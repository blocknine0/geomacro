import { describe, expect, it } from "vitest";
import { buildCorridorRiskObject } from "../lib/corridor-risk-engine";
import {
  COUNTRY_RISK_METHOD_VERSION,
  GRO_CANONICALIZATION_VERSION,
  GRO_SCHEMA_VERSION,
  GRO_SIGNATURE_SCHEME,
  type GeomacroRiskObject,
} from "../lib/risk-object-contract";

function country(
  iso3: string,
  score: number,
  payloadHash: string,
  calculationHash: string,
): GeomacroRiskObject {
  return {
    schema_version: GRO_SCHEMA_VERSION,
    object_id: `gro_country_${iso3}_${payloadHash.slice(0, 8)}`,
    subject: { type: "country", id: iso3, name: null },
    risk: {
      score,
      label: score >= 60 ? "ELEVATED" : "WATCH",
      previous_score: null,
      delta: null,
      direction: "unknown",
    },
    attribution: [{
      driver: "conflict",
      score_contribution: score,
      delta_contribution: null,
      event_count: 1,
      weight: 1,
    }],
    confidence: 0.8,
    evidence: [{
      event_id: `event-${iso3}-${payloadHash.slice(0, 8)}`,
      title: `${iso3} test event`,
      event_type: "conflict",
      severity: score,
      confidence: 80,
      direction: "unknown",
      last_seen_at: "2026-10-05T12:00:00.000Z",
      evidence_count: 1,
      independent_source_count: 1,
      evidence_refs: [`ref-${iso3}`],
      source_families: [`source-${iso3}`],
    }],
    evidence_coverage: null,
    evidence_summary: { event_count: 1, evidence_count: 1, independent_source_count: 1 },
    methodology_version: COUNTRY_RISK_METHOD_VERSION,
    generated_at: "2026-10-05T12:00:00.000Z",
    expires_at: "2026-10-06T12:00:00.000Z",
    issuer: "Geomacro",
    commercial_eligibility: { status: "VERIFIED", reason_codes: [] },
    verification: { status: "VERIFIED", reason_codes: [], last_verified_at: "2026-10-05T12:00:00.000Z" },
    integrity: {
      input_hash: "1".repeat(64),
      data_hash: "2".repeat(64),
      calculation_hash: calculationHash,
      payload_hash: payloadHash,
      canonicalization: GRO_CANONICALIZATION_VERSION,
      signature: "test-signature",
      signature_scheme: GRO_SIGNATURE_SCHEME,
      signing_key_id: "test-key",
    },
    provenance: {
      structure_versions: ["structure-test"],
      scoring_versions: ["score-test"],
      relevance_versions: ["relevance-test"],
      country_versions: ["country-test"],
      story_versions: ["story-test"],
    },
  };
}

describe("#1414 country-to-corridor propagation", () => {
  it("changes the corridor identity hashes when either canonical endpoint GRO changes", async () => {
    const destination = country("CHN", 58, "b".repeat(64), "c".repeat(64));
    const before = await buildCorridorRiskObject({
      origin_country_iso3: "USA",
      destination_country_iso3: "CHN",
      origin: country("USA", 61, "d".repeat(64), "e".repeat(64)),
      destination,
      as_of: "2026-10-05T13:00:00.000Z",
    });

    const after = await buildCorridorRiskObject({
      origin_country_iso3: "USA",
      destination_country_iso3: "CHN",
      origin: country("USA", 67, "f".repeat(64), "a".repeat(64)),
      destination,
      previous: before,
      as_of: "2026-10-05T14:00:00.000Z",
    });

    expect(after.subject.id).toBe("USA>CHN");
    expect(after.risk.score).toBe(67);
    expect(after.risk.previous_score).toBe(61);
    expect(after.risk.delta).toBe(6);
    expect(after.integrity.input_hash).not.toBe(before.integrity.input_hash);
    expect(after.integrity.calculation_hash).not.toBe(before.integrity.calculation_hash);
    expect(after.object_id).not.toBe(before.object_id);
    expect(after.corridor_context?.source_risk_object_ids).toEqual([
      "gro_country_USA_ffffffff",
      "gro_country_CHN_bbbbbbbb",
    ]);
  });

  it("keeps reverse corridors distinct even when they share endpoint GROs", async () => {
    const usa = country("USA", 67, "f".repeat(64), "a".repeat(64));
    const chn = country("CHN", 58, "b".repeat(64), "c".repeat(64));
    const forward = await buildCorridorRiskObject({
      origin_country_iso3: "USA",
      destination_country_iso3: "CHN",
      origin: usa,
      destination: chn,
      as_of: "2026-10-05T14:00:00.000Z",
    });
    const reverse = await buildCorridorRiskObject({
      origin_country_iso3: "CHN",
      destination_country_iso3: "USA",
      origin: chn,
      destination: usa,
      as_of: "2026-10-05T14:00:00.000Z",
    });
    expect(forward.subject.id).toBe("USA>CHN");
    expect(reverse.subject.id).toBe("CHN>USA");
    expect(forward.object_id).not.toBe(reverse.object_id);
  });
});
