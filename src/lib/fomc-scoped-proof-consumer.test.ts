import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  consumeFomcScopedProofArtifact,
  validateFomcScopedProofArtifact,
} from "./fomc-scoped-proof-consumer";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function sample(
  idSeed: string,
  outcome: "MATERIAL_EVENT" | "NO_MATERIAL_EVENT",
  alertIssued: boolean,
  detectedAt: string | null,
  observedAt: string | null,
) {
  return {
    sample_id: stableHash(idSeed),
    country_iso3: "USA",
    event_family: "monetary_policy",
    alert_issued: alertIssued,
    alert_status: alertIssued ? ("WARNING" as const) : null,
    detected_at_utc: alertIssued ? detectedAt : null,
    outcome,
    outcome_observed_at_utc: observedAt,
  };
}

function artifact() {
  const samples = [
    sample(
      "tp",
      "MATERIAL_EVENT",
      true,
      "2020-03-03T12:00:00Z",
      "2020-03-03T15:00:00Z",
    ),
    sample("fn", "MATERIAL_EVENT", false, null, "2020-03-15T21:00:00Z"),
    sample("fp", "NO_MATERIAL_EVENT", true, "2020-02-01T12:00:00Z", null),
    sample("tn", "NO_MATERIAL_EVENT", false, null, null),
  ];
  samples.sort((a, b) => a.sample_id.localeCompare(b.sample_id));
  const core = {
    schema_version: "early-warning-fomc-scoped-proof-samples-v1",
    claim_scope_type: "MATERIALITY_RULE_SLICE",
    country_iso3: "USA",
    event_family: "monetary_policy",
    materiality_rule_code: "CB_POLICY_RATE_MOVE_25BP",
    slice_artifact_hash: "a".repeat(64),
    control_artifact_hash: "b".repeat(64),
    replay_artifact_hash: "c".repeat(64),
    scope_hash: "d".repeat(64),
    sample_count: samples.length,
    material_event_sample_count: 2,
    control_sample_count: 2,
    samples_hash: stableHash(samples),
    samples,
    methodology_calibrated: false,
    material_event_universe_complete_for_this_rule_scoped_slice: true,
    control_period_sampling_documented: true,
    broad_monetary_policy_universe_complete: false,
    broad_country_risk_universe_complete: false,
    eligible_for_main_proof_metric_computation: true,
    eligible_for_public_performance_claims: false,
    public_performance_claims_allowed: false,
    commercial_signal_activation: false,
    market_price_prediction: false,
  } as const;
  return { ...core, proof_sample_artifact_hash: stableHash(core) };
}

function rehash<T extends Record<string, unknown>>(raw: T) {
  const core = Object.fromEntries(
    Object.entries(raw).filter(([key]) => key !== "proof_sample_artifact_hash"),
  );
  return { ...raw, proof_sample_artifact_hash: stableHash(core) };
}

describe("FOMC scoped proof consumer", () => {
  it("computes bounded metrics but remains non-publishable", () => {
    const result = consumeFomcScopedProofArtifact(artifact());

    expect(result.metrics.confusion_matrix).toEqual({
      true_positive: 1,
      false_positive: 1,
      false_negative: 1,
      true_negative: 1,
    });
    expect(result.metrics.precision).toBe(0.5);
    expect(result.metrics.recall).toBe(0.5);
    expect(result.metrics.false_positive_rate).toBe(0.5);
    expect(result.metrics.lead_time_seconds.confirmed_alert_count).toBe(1);
    expect(result.metrics.lead_time_seconds.median).toBe(10_800);

    expect(result.publication_readiness.publishable).toBe(false);
    expect(result.publication_readiness.reasons).toContain("methodology_not_calibrated");
    expect(result.publication_readiness.reasons).toContain("insufficient_resolved_samples");
    expect(result.publication_readiness.reasons).toContain("insufficient_material_events");
    expect(result.publication_readiness.reasons).toContain("insufficient_country_coverage");
    expect(result.scope_publication_allowed).toBe(false);
    expect(result.public_performance_claims_allowed).toBe(false);
    expect(result.commercial_signal_activation).toBe(false);
    expect(result.market_price_prediction).toBe(false);
  });

  it("rejects sample tamper even when top-level artifact hash is recomputed", () => {
    const raw = structuredClone(artifact());
    raw.samples[0].country_iso3 = "GBR";
    raw.samples_hash = stableHash(raw.samples);
    const tampered = rehash(raw);
    expect(() => validateFomcScopedProofArtifact(tampered)).toThrow(
      /escaped the declared scope/,
    );
  });

  it("rejects denominator drift", () => {
    const raw = structuredClone(artifact());
    raw.material_event_sample_count = 3;
    const tampered = rehash(raw);
    expect(() => validateFomcScopedProofArtifact(tampered)).toThrow(
      /denominator counts do not add up|material-event count mismatch/,
    );
  });

  it("rejects public or commercial promotion flags", () => {
    const publicRaw = structuredClone(artifact());
    publicRaw.public_performance_claims_allowed = true as false;
    expect(() => validateFomcScopedProofArtifact(rehash(publicRaw))).toThrow(
      /public_performance_claims_allowed must remain false/,
    );

    const commercialRaw = structuredClone(artifact());
    commercialRaw.commercial_signal_activation = true as false;
    expect(() => validateFomcScopedProofArtifact(rehash(commercialRaw))).toThrow(
      /commercial_signal_activation must remain false/,
    );
  });

  it("rejects artifact hash mismatch", () => {
    const raw = artifact();
    raw.proof_sample_artifact_hash = "0".repeat(64);
    expect(() => validateFomcScopedProofArtifact(raw)).toThrow(/artifact hash mismatch/);
  });

  it("rejects schema or broad-completeness drift", () => {
    const schemaRaw = structuredClone(artifact());
    schemaRaw.schema_version = "future-schema" as typeof schemaRaw.schema_version;
    expect(() => validateFomcScopedProofArtifact(rehash(schemaRaw))).toThrow(/schema mismatch/);

    const broadRaw = structuredClone(artifact());
    broadRaw.broad_monetary_policy_universe_complete = true as false;
    expect(() => validateFomcScopedProofArtifact(rehash(broadRaw))).toThrow(
      /broad monetary-policy completeness must remain false/,
    );
  });
});
