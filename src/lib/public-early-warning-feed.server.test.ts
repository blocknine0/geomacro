import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildEarlyWarningAlertRecord } from "./early-warning-service.server";
import { boundedPublicEarlyWarningRow } from "./public-early-warning-feed.server";

const common = {
  alert_key: "ind-policy-20260916-public-001",
  visibility: "public" as const,
  country_iso3: "IND",
  country_name: "India",
  country_timezone: "Asia/Kolkata",
  event_family: "monetary_policy",
  event_title: "Verified policy-sensitive development",
  primary_cause: "A verified policy development with cross-market transmission potential",
  cews_inputs: {
    novelty: 80,
    severity: 90,
    escalation_velocity: 80,
    structural_vulnerability: 70,
    transmission_potential: 90,
    evidence_confidence: 80,
    source_reliability: 90,
    recency: 100,
  },
  confidence: 0.86,
  independent_evidence_count: 3,
  official_source_present: true,
  evidence_refs: ["official:secret-source-ref", "independent:secret-source-ref"],
  source_event_ids: ["internal-event-1"],
  source_risk_object_id: "internal-risk-object-1",
  first_source_seen_at_utc: "2026-09-16T08:12:20Z",
  detected_at_utc: "2026-09-16T08:12:41Z",
  public_url: "https://geomacro.live/intelligence/example",
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

function stableHash(value: unknown) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function marketImpactRow() {
  return {
    ...buildEarlyWarningAlertRecord({
      ...common,
      market_impact_driver: "MONETARY_TIGHTENING" as const,
    }),
    published_at_utc: "2026-09-16T08:13:00Z",
  };
}

function legacyRow() {
  return {
    ...buildEarlyWarningAlertRecord({
      ...common,
      transmission_channels: ["rates", "currency"],
      market_relevance: {
        equities: "HIGH" as const,
        crypto: "MODERATE" as const,
      },
    }),
    published_at_utc: "2026-09-16T08:13:00Z",
  };
}

describe("bounded public Early Warning feed rows", () => {
  it("exposes CEWS plus structural market impact without raw evidence or internal objects", () => {
    const source = marketImpactRow();
    const output = boundedPublicEarlyWarningRow(source);

    expect(output.country).toEqual({
      iso3: "IND",
      name: "India",
      local_timezone: "Asia/Kolkata",
    });
    expect(output.early_warning).toMatchObject({
      status: "CRITICAL",
      cews_score: 84,
      confidence: 0.86,
      independent_evidence_count: 3,
      official_source_present: true,
      methodology_version: "cews-v0.1.0-provisional",
      methodology_calibrated: false,
    });
    expect(output.market_impact).toMatchObject({
      methodology_version: "early-warning-market-impact-v0.1-provisional",
      calibrated: false,
      structural_pressure_only: true,
      market_price_prediction: false,
      trading_instruction: false,
      driver: "MONETARY_TIGHTENING",
      country_iso3: "IND",
      assets: {
        equities: { relevance: "HIGH", pressure_direction: "NEGATIVE" },
        crypto: { relevance: "HIGH", pressure_direction: "NEGATIVE" },
        fx: { relevance: "HIGH", pressure_direction: "POSITIVE" },
        rates: { relevance: "VERY_HIGH", pressure_direction: "POSITIVE" },
        commodities: { relevance: "MODERATE", pressure_direction: "MIXED" },
      },
    });
    expect(output.integrity.market_impact_hash).toBe(source.market_impact_hash);
    expect(output.boundaries).toEqual({
      structural_pressure_only: true,
      market_price_prediction: false,
      trading_instruction: false,
      public_performance_claims_allowed: false,
    });

    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain("cews_inputs");
    expect(serialized).not.toContain("cews_contributions");
    expect(serialized).not.toContain("evidence_refs");
    expect(serialized).not.toContain("source_event_ids");
    expect(serialized).not.toContain("source_risk_object_id");
    expect(serialized).not.toContain("secret-source-ref");
    expect(serialized).not.toContain("internal-event-1");
  });

  it("keeps legacy public alerts compatible without inventing market impact", () => {
    const output = boundedPublicEarlyWarningRow(legacyRow());
    expect(output.market_impact).toBeNull();
    expect(output.integrity.market_impact_hash).toBeNull();
    expect(output.transmission_channels).toEqual(["rates", "currency"]);
    expect(output.market_relevance).toEqual({
      equities: "HIGH",
      crypto: "MODERATE",
    });
  });

  it("rejects private, unapproved, unpublished and sub-threshold rows", () => {
    const privateRow = { ...marketImpactRow(), visibility: "private" };
    expect(() => boundedPublicEarlyWarningRow(privateRow)).toThrow(/not public eligible/);

    const ineligible = { ...marketImpactRow(), public_eligible: false };
    expect(() => boundedPublicEarlyWarningRow(ineligible)).toThrow(/not public eligible/);

    const unpublished = { ...marketImpactRow(), published_at_utc: null };
    expect(() => boundedPublicEarlyWarningRow(unpublished)).toThrow(/published_at_utc/);

    const watch = { ...marketImpactRow(), status: "WATCH" };
    expect(() => boundedPublicEarlyWarningRow(watch)).toThrow(/not distributable/);
  });

  it("rejects market-impact object tampering against its bound hash", () => {
    const tampered = structuredClone(marketImpactRow());
    if (!tampered.market_impact) throw new Error("fixture missing market impact");
    tampered.market_impact.assets.crypto.pressure_direction = "POSITIVE";
    expect(() => boundedPublicEarlyWarningRow(tampered)).toThrow(/market impact hash mismatch/);
  });

  it("rejects semantic drift even when the attacker recomputes the market-impact hash", () => {
    const semanticsDrift = structuredClone(marketImpactRow());
    if (!semanticsDrift.market_impact) throw new Error("fixture missing market impact");
    semanticsDrift.market_impact.direction_semantics.fx = "arbitrary fx meaning" as never;
    semanticsDrift.market_impact_hash = stableHash(semanticsDrift.market_impact);
    expect(() => boundedPublicEarlyWarningRow(semanticsDrift)).toThrow(/fx direction semantics mismatch/);

    const assetShapeDrift = structuredClone(marketImpactRow()) as ReturnType<typeof marketImpactRow> & {
      market_impact: NonNullable<ReturnType<typeof marketImpactRow>["market_impact"]> & {
        assets: NonNullable<ReturnType<typeof marketImpactRow>["market_impact"]>["assets"] & {
          stocks?: unknown;
        };
      };
    };
    if (!assetShapeDrift.market_impact) throw new Error("fixture missing market impact");
    assetShapeDrift.market_impact.assets.stocks = {
      relevance: "HIGH",
      pressure_direction: "NEGATIVE",
      rationale_code: "UNREGISTERED_ASSET_CLASS",
    };
    assetShapeDrift.market_impact_hash = stableHash(assetShapeDrift.market_impact);
    expect(() => boundedPublicEarlyWarningRow(assetShapeDrift)).toThrow(/market impact assets keys mismatch/);
  });

  it("rejects market-impact country and confidence drift", () => {
    const countryDrift = { ...marketImpactRow(), country_iso3: "USA" };
    expect(() => boundedPublicEarlyWarningRow(countryDrift)).toThrow(/country binding mismatch/);

    const confidenceDrift = { ...marketImpactRow(), confidence: 0.85 };
    expect(() => boundedPublicEarlyWarningRow(confidenceDrift)).toThrow(/confidence binding mismatch/);
  });

  it("rejects legacy relevance or transmission drift from the bound market impact", () => {
    const relevanceDrift = {
      ...marketImpactRow(),
      market_relevance: {
        equities: "LOW",
        crypto: "HIGH",
        fx: "HIGH",
        rates: "VERY_HIGH",
        commodities: "MODERATE",
      },
    };
    expect(() => boundedPublicEarlyWarningRow(relevanceDrift)).toThrow(/equities relevance binding mismatch/);

    const transmissionDrift = {
      ...marketImpactRow(),
      transmission_channels: ["policy_rates", "capital_flows"],
    };
    expect(() => boundedPublicEarlyWarningRow(transmissionDrift)).toThrow(
      /transmission-channel binding mismatch/,
    );
  });

  it("rejects CEWS or public-policy version drift", () => {
    const methodDrift = { ...marketImpactRow(), methodology_version: "cews-future" };
    expect(() => boundedPublicEarlyWarningRow(methodDrift)).toThrow(/CEWS methodology boundary/);

    const policyDrift = { ...marketImpactRow(), public_policy_version: "public-alert-policy-future" };
    expect(() => boundedPublicEarlyWarningRow(policyDrift)).toThrow(/policy version mismatch/);
  });

  it("rejects local-time drift and non-canonical public URLs", () => {
    const localTimeDrift = { ...marketImpactRow(), detected_at_local: "2026-09-16T13:42:42+05:30" };
    expect(() => boundedPublicEarlyWarningRow(localTimeDrift)).toThrow(/local binding mismatch/);

    const externalUrl = { ...marketImpactRow(), public_url: "https://example.com/fake-alert" };
    expect(() => boundedPublicEarlyWarningRow(externalUrl)).toThrow(/canonical Geomacro origin/);
  });

  it("rejects duplicate transmission channels", () => {
    const duplicated = structuredClone(marketImpactRow());
    if (!duplicated.market_impact) throw new Error("fixture missing market impact");
    duplicated.market_impact.transmission_channels.push(
      duplicated.market_impact.transmission_channels[0],
    );
    duplicated.transmission_channels = [...duplicated.market_impact.transmission_channels];
    duplicated.market_impact_hash = stableHash(duplicated.market_impact);
    expect(() => boundedPublicEarlyWarningRow(duplicated)).toThrow(/contains duplicates/);
  });

  it("rejects publication timestamps before detection", () => {
    const bad = { ...marketImpactRow(), published_at_utc: "2026-09-16T08:12:00Z" };
    expect(() => boundedPublicEarlyWarningRow(bad)).toThrow(/cannot precede detection/);
  });
});
