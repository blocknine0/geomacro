import { describe, expect, it } from "vitest";
import { canonicalStructuralEvidence } from "../lib/canonical-structural-evidence";
import { storeProductRows } from "../lib/store-product-evidence.server";
import type { StructuralContext, StructuralObservation } from "../lib/structural-context.server";
import type { AgentQueryPlan } from "../lib/agent-query-plan";

const AS_OF = "2026-10-27T00:00:00.000Z";
function evidence(overrides: Partial<StructuralObservation> = {}): StructuralObservation {
  return {
    observation_id: "derived:" + "a".repeat(64),
    source_id: "governed_mcs_release",
    source_record_id: "a".repeat(64),
    dimension: "critical_minerals",
    country_iso3: "USA",
    partner_country_iso3: null,
    observed_at: "2025-12-31T23:59:59.000Z",
    published_at: null,
    metric: "annual_mineral_production_change_pct",
    value_numeric: 0,
    value_text: "Year-over-year comparison",
    unit: "percent_change",
    event_type: null,
    signal_type: "ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS",
    source_url: null,
    parser_version: "v1",
    methodology_status: "EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
    quality_status: "VERIFIED",
    provenance: { reference_year: 2025, date_precision: "YEAR" },
    normalized_hash: "b".repeat(64),
    retrieved_at: "2026-10-26T00:00:00.000Z",
    ...overrides,
  };
}

describe("private canonical structural evidence", () => {
  it("preserves explicit annual reference period, zero values and traceable private ID", () => {
    const result = canonicalStructuralEvidence(evidence(), AS_OF);
    expect(result).toMatchObject({
      country_iso3: "USA", dimension: "critical_minerals",
      value: 0, unit: "percent_change", data_quality: "VERIFIED",
      measurement_period: {
        start: "2025-01-01T00:00:00.000Z",
        end: "2025-12-31T23:59:59.999Z",
        granularity: "year",
      },
    });
    expect(result?.evidence_id).toContain("governed_mcs_release:");
    expect(JSON.stringify(result)).not.toContain("source_url");
    expect(JSON.stringify(result)).not.toContain("retrieved_at");
  });

  it("recognizes source-declared quarterly reporting period without claiming live FX", () => {
    const result = canonicalStructuralEvidence(evidence({
      country_iso3: "IND", dimension: "external_fx",
      observed_at: "2026-09-30T23:59:59.000Z",
      provenance: { date_precision: "QUARTER" },
    }), AS_OF);
    expect(result?.measurement_period).toEqual({
      start: "2026-07-01T00:00:00.000Z",
      end: "2026-09-30T23:59:59.999Z",
      granularity: "quarter",
    });
  });

  it("accepts separately declared source-native measurement dates", () => {
    const result = canonicalStructuralEvidence(evidence({
      provenance: { measurement_period: { start: "2025-01-01", end: "2025-12-31", granularity: "year" } },
    }), AS_OF);
    expect(result?.measurement_period.start).toBe("2025-01-01T00:00:00.000Z");
  });

  it("allows a real event observation to declare an instant period", () => {
    const result = canonicalStructuralEvidence(evidence({
      event_type: "POLICY_DECISION", provenance: {},
    }), AS_OF);
    expect(result?.measurement_period.granularity).toBe("instant");
  });

  it.each([
    ["no native measurement period", { provenance: {} }],
    ["bad country", { country_iso3: "ZZZ" }],
    ["foreign partner", { partner_country_iso3: "ZZZ" }],
    ["missing quality", { quality_status: null }],
    ["review-only quality", { quality_status: "PENDING_REVIEW" }],
    ["no metric value", { value_numeric: null, value_text: null }],
    ["missing measurement unit", { unit: null }],
    ["invalid content hash", { normalized_hash: "unverified" }],
    ["undated original", { observed_at: null }],
    ["future observation", { observed_at: "2030-12-31T23:59:59.000Z" }],
    ["reference year mismatch", { provenance: { reference_year: 2024, date_precision: "YEAR" } }],
    ["relabelled future period", { provenance: { measurement_period: "2028" } }],
    ["retrieval as original", { observed_at: null, retrieved_at: AS_OF }],
  ] satisfies Array<[string, Partial<StructuralObservation>]>)(
    "rejects %s before it can qualify a paid observation",
    (_, changes) => expect(canonicalStructuralEvidence(evidence(changes), AS_OF)).toBeNull(),
  );

  it("enforces the same predicate in the paid Store selection path", () => {
    const valid = evidence();
    const plan = {
      subjects: [{ type: "country", country_iso3: "USA" }],
      module_max_age_seconds: { critical_minerals: 400 * 86400 },
    } as unknown as AgentQueryPlan;
    const context = {
      observations: [evidence({ provenance: {}, observation_id: "bad" }), valid],
    } as StructuralContext;
    expect(storeProductRows(plan, context, "critical_minerals", AS_OF))
      .toEqual([valid]);
  });
});
