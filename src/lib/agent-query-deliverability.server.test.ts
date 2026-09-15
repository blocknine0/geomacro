import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAgentQueryPlan } from "./agent-query-plan";

const mocks = vi.hoisted(() => ({ loadStructuralContext: vi.fn() }));
vi.mock("./structural-context.server", async () => {
  const actual = await vi.importActual<typeof import("./structural-context.server")>("./structural-context.server");
  return { ...actual, loadStructuralContext: mocks.loadStructuralContext };
});

import { checkAgentQueryDeliverability } from "./agent-query-deliverability.server";

function context(overrides: Record<string, unknown> = {}) {
  return {
    status: "AVAILABLE",
    methodology_status: "EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
    subject: { type: "country", country_iso3: "USA" },
    observations: [
      {
        observation_id: "o1", source_id: "world_bank_wdi", source_record_id: null,
        dimension: "macro_monetary", country_iso3: "USA", partner_country_iso3: null,
        observed_at: "2026-09-15T00:00:00.000Z", published_at: null, metric: "inflation",
        value_numeric: 2, value_text: null, unit: "percent", event_type: null, signal_type: null,
        source_url: "https://example.invalid", parser_version: "1", methodology_status: "evidence",
        quality_status: "accepted", provenance: {}, normalized_hash: "a", retrieved_at: "2026-09-15T00:00:00.000Z",
      },
      {
        observation_id: "o2", source_id: "world_bank_wdi", source_record_id: null,
        dimension: "sovereign_fiscal", country_iso3: "USA", partner_country_iso3: null,
        observed_at: "2026-09-15T00:00:00.000Z", published_at: null, metric: "debt",
        value_numeric: 1, value_text: null, unit: "percent", event_type: null, signal_type: null,
        source_url: "https://example.invalid", parser_version: "1", methodology_status: "evidence",
        quality_status: "accepted", provenance: {}, normalized_hash: "b", retrieved_at: "2026-09-15T00:00:00.000Z",
      },
    ],
    metadata: { serving_layer: "COUNTRY_PROFILE_V1", warehouse_methodology_status: "EVIDENCE_ONLY_NOT_IN_GRO_V02", coverage: [], composition_method: null, route_modeling_status: null, direct_evidence_status: null },
    note: "test",
    ...overrides,
  };
}

const commercialOk = async () => ({ eligible: true, ineligible_source_ids: [] as string[] });

beforeEach(() => mocks.loadStructuralContext.mockReset());

describe("adaptive query pre-payment deliverability", () => {
  it("allows a fresh fully-covered commercially eligible structural query", async () => {
    mocks.loadStructuralContext.mockResolvedValue(context());
    const plan = buildAgentQueryPlan({ subjects: [{ type: "country", country_iso3: "usa" }], topics: ["macro_risk"], max_age_seconds: 172800 });
    const result = await checkAgentQueryDeliverability(plan, {
      now: new Date("2026-09-16T00:00:00.000Z"),
      sourceEligibilityChecker: commercialOk,
    });
    expect(result.deliverable).toBe(true);
    expect(result.code).toBe("AVAILABLE");
  });

  it("fails closed before payment when a required module is absent", async () => {
    const base = context();
    mocks.loadStructuralContext.mockResolvedValue({ ...base, observations: [base.observations[0]] });
    const plan = buildAgentQueryPlan({ subjects: [{ type: "country", country_iso3: "USA" }], topics: ["macro_risk"], max_age_seconds: 172800 });
    const result = await checkAgentQueryDeliverability(plan, {
      now: new Date("2026-09-16T00:00:00.000Z"),
      sourceEligibilityChecker: commercialOk,
    });
    expect(result.deliverable).toBe(false);
    expect(result.code).toBe("INSUFFICIENT_COVERAGE");
    expect(result.missing_modules).toContain("sovereign_fiscal");
  });

  it("fails closed when required evidence is stale", async () => {
    mocks.loadStructuralContext.mockResolvedValue(context());
    const plan = buildAgentQueryPlan({ subjects: [{ type: "country", country_iso3: "USA" }], topics: ["macro_risk"], max_age_seconds: 3600 });
    const result = await checkAgentQueryDeliverability(plan, {
      now: new Date("2026-09-16T00:00:00.000Z"),
      sourceEligibilityChecker: commercialOk,
    });
    expect(result.deliverable).toBe(false);
    expect(result.code).toBe("STALE_REQUIRED_DATA");
  });

  it("fails closed when a required source is not commercially eligible", async () => {
    mocks.loadStructuralContext.mockResolvedValue(context());
    const plan = buildAgentQueryPlan({ subjects: [{ type: "country", country_iso3: "USA" }], topics: ["macro_risk"], max_age_seconds: 172800 });
    const result = await checkAgentQueryDeliverability(plan, {
      now: new Date("2026-09-16T00:00:00.000Z"),
      sourceEligibilityChecker: async () => ({ eligible: false, ineligible_source_ids: ["world_bank_wdi"] }),
    });
    expect(result.deliverable).toBe(false);
    expect(result.code).toBe("COMMERCIAL_SOURCE_NOT_ELIGIBLE");
    expect(result.ineligible_source_ids).toEqual(["world_bank_wdi"]);
  });

  it("requires explicit governed checker for Risk Gate/Risk Object modules", async () => {
    mocks.loadStructuralContext.mockResolvedValue(context());
    const plan = buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "USA" }],
      topics: ["risk_gate"],
      risk_gate_context: { action_type: "exposure_review", policy_preset: "balanced" },
    });
    const denied = await checkAgentQueryDeliverability(plan, {
      now: new Date("2026-09-16T00:00:00.000Z"),
      sourceEligibilityChecker: commercialOk,
    });
    expect(denied.deliverable).toBe(false);
    expect(denied.missing_modules).toEqual(expect.arrayContaining(["risk_gate", "signed_risk_object"]));

    const allowed = await checkAgentQueryDeliverability(plan, {
      now: new Date("2026-09-16T00:00:00.000Z"),
      sourceEligibilityChecker: commercialOk,
      externalModuleChecker: async () => true,
    });
    expect(allowed.deliverable).toBe(true);
  });
});
