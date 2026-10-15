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

  it("recognizes governed currency_capital_mobility evidence as external_fx", async () => {
    const base = context();
    mocks.loadStructuralContext.mockResolvedValue({
      ...base,
      observations: [
        base.observations[0],
        {
          ...base.observations[1],
          observation_id: "o-fx",
          dimension: "currency_capital_mobility",
          metric: "reserve_adequacy",
          normalized_hash: "fx",
        },
      ],
    });
    const plan = buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "USA" }],
      topics: ["fx_external_risk"],
      max_age_seconds: 172800,
    });
    const result = await checkAgentQueryDeliverability(plan, {
      now: new Date("2026-09-16T00:00:00.000Z"),
      sourceEligibilityChecker: commercialOk,
    });
    expect(result.deliverable).toBe(true);
    expect(result.missing_modules).not.toContain("external_fx");
    expect(result.subjects[0].available_modules).toContain("external_fx");
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

  it("coverage-only metadata cannot make an unrelated structural module payable", async () => {
    const base = context();
    mocks.loadStructuralContext.mockResolvedValue({
      ...base,
      // This is a real macro row, not a sanctions observation.
      observations: [base.observations[0]],
      metadata: {
        ...base.metadata,
        coverage: [{
          source_id: "official_unverified_coverage_only",
          dimension: "sanctions_restrictions",
          country_iso3: "USA",
          coverage_year: 2026,
          coverage_status: "AVAILABLE",
          observation_count: 4,
          latest_observed_at: "2026-09-15T00:00:00.000Z",
          updated_at: "2026-09-16T00:00:00.000Z",
          audit_metadata: {},
        }],
      },
    });
    const plan = buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "USA" }],
      topics: ["sanctions_restrictions"],
      max_age_seconds: 7 * 86400,
    });
    const sourceChecker = vi.fn(commercialOk);
    const result = await checkAgentQueryDeliverability(plan, {
      now: new Date("2026-09-16T00:00:00.000Z"),
      sourceEligibilityChecker: sourceChecker,
    });
    expect(result.deliverable).toBe(false);
    expect(result.code).toBe("STALE_REQUIRED_DATA");
    expect(result.stale_modules).toContain("sanctions_restrictions");
    expect(result.subjects[0].latest_evidence_at).toBeNull();
    expect(sourceChecker).not.toHaveBeenCalled();
  });

  it("never promotes another country's observation or coverage into a USA paid digest", async () => {
    const base = context();
    const unrelated = {
      ...base.observations[0],
      observation_id: "foreign-obs",
      dimension: "geopolitical_security",
      country_iso3: "CHN",
      source_id: "foreign-not-approved",
    };
    mocks.loadStructuralContext.mockResolvedValue({
      ...base,
      observations: [unrelated],
      metadata: {
        ...base.metadata,
        coverage: [{
          source_id: "foreign-not-approved",
          dimension: "geopolitical_security", country_iso3: "CHN",
          coverage_year: 2026, coverage_status: "AVAILABLE",
          observation_count: 1, latest_observed_at: "2026-09-15T00:00:00.000Z",
          updated_at: "2026-09-16T00:00:00.000Z", audit_metadata: {},
        }],
      },
    });
    const checker = vi.fn(commercialOk);
    const plan = buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "USA" }],
      topics: ["conflict_geopolitics"],
    });
    const result = await checkAgentQueryDeliverability(plan, {
      now: new Date("2026-09-16T00:00:00.000Z"),
      sourceEligibilityChecker: checker,
    });
    expect(result.deliverable).toBe(false);
    expect(result.subjects[0].latest_evidence_at).toBeNull();
    expect(result.subjects[0].required_source_ids).toEqual([]);
    expect(result.subjects[0].available_modules).not.toContain("geopolitical_security");
    expect(result.missing_modules).toContain("geopolitical_security");
    expect(checker).not.toHaveBeenCalled();
  });

  it("checks source rights only for evidence belonging to the exact requested ISO3", async () => {
    const base = context();
    mocks.loadStructuralContext.mockResolvedValue({
      ...base,
      observations: [
        ...base.observations,
        { ...base.observations[0], observation_id: "foreign-row",
          source_id: "foreign-not-approved", country_iso3: "CHN" },
      ],
    });
    const checker = vi.fn(async (ids: string[]) => ({
      eligible: true, ineligible_source_ids: [] as string[],
    }));
    const plan = buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "USA" }],
      topics: ["macro_risk"],
    });
    const result = await checkAgentQueryDeliverability(plan, {
      now: new Date("2026-09-16T00:00:00.000Z"),
      sourceEligibilityChecker: checker,
    });
    expect(result.deliverable).toBe(true);
    expect(checker).toHaveBeenCalledWith(["world_bank_wdi"]);
    expect(result.subjects[0].required_source_ids).toEqual(["world_bank_wdi"]);
  });

  it("never treats a new retrieval as fresh original macro evidence", async () => {
    const base = context();
    mocks.loadStructuralContext.mockResolvedValue({
      ...base,
      observations: base.observations.map((row) => ({
        ...row,
        observed_at: null,
        published_at: null,
        retrieved_at: "2026-09-16T00:00:00.000Z",
      })),
    });
    const plan = buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "USA" }],
      topics: ["macro_risk"],
      max_age_seconds: 3600,
    });
    const result = await checkAgentQueryDeliverability(plan, {
      now: new Date("2026-09-16T00:00:00.000Z"),
      sourceEligibilityChecker: commercialOk,
    });
    expect(result.deliverable).toBe(false);
    expect(result.stale_modules).toEqual(expect.arrayContaining(["macro_monetary", "sovereign_fiscal"]));
  });

  it("never offers payment on future source-native or coverage observation timestamps", async () => {
    const base = context();
    mocks.loadStructuralContext.mockResolvedValue({
      ...base,
      observations: base.observations.map((row) => ({
        ...row, observed_at: "2026-09-16T00:01:00.000Z",
      })),
      metadata: {
        ...base.metadata,
        coverage: [{
          source_id: "world_bank_wdi", dimension: "macro_monetary",
          country_iso3: "USA", coverage_year: 2026,
          coverage_status: "AVAILABLE", observation_count: 1,
          latest_observed_at: "2026-09-16T00:01:00.000Z",
          updated_at: "2026-09-16T00:01:00.000Z", audit_metadata: {},
        }],
      },
    });
    const plan = buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "USA" }],
      topics: ["macro_risk"],
      max_age_seconds: 3600,
    });
    const result = await checkAgentQueryDeliverability(plan, {
      now: new Date("2026-09-16T00:00:00.000Z"),
      sourceEligibilityChecker: commercialOk,
    });
    expect(result.deliverable).toBe(false);
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
