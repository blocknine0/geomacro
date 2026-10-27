import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAgentQueryPlan } from "./agent-query-plan";
import { loadAgentQueryStructuralContext } from "./store-structural-release-context.server";
import { assertStoreStructuralEvidence } from "./store-product-evidence.server";
import { GEOMACRO_STORE_REQUEST_EXAMPLES } from "./store-product-examples";
import { checkAgentQueryDeliverability } from "./agent-query-deliverability.server";
import { prepareVerifiedCapabilityOffer } from "./capability-x402-offer.server";
import { freezeCanonicalCapabilityHttpBody } from "./capability-x402-exact-http-body.server";
import { resolveGeomacroCapabilityPrice } from "./capability-pricing-catalog";
import type { StructuralContext, StructuralSubject } from "./structural-context.server";

const mock = vi.hoisted(() => ({ primary: vi.fn(), mcs: vi.fn(), fx: vi.fn(), freeze: vi.fn() }));
vi.mock("./structural-context.server", async original => ({ ...await original<typeof import("./structural-context.server")>(), loadStructuralContext: (...args: unknown[]) => mock.primary(...args) }));
vi.mock("./qualified-mcs-country-digest.server", async original => ({ ...await original<typeof import("./qualified-mcs-country-digest.server")>(), loadQualifiedMcsCountryContext: (...args: unknown[]) => mock.mcs(...args) }));
vi.mock("./qualified-treasury-fx.server", async original => ({ ...await original<typeof import("./qualified-treasury-fx.server")>(), loadQualifiedTreasuryFxCountryContext: (...args: unknown[]) => mock.fx(...args) }));
vi.mock("./capability-x402-prequote.server", () => ({ freezeVerifiedCapabilityAnswer: (...args: unknown[]) => mock.freeze(...args) }));
const NOW = new Date("2026-10-24T13:00:00.000Z");
function empty(subject: StructuralSubject): StructuralContext {
  return { status: "NOT_CONFIGURED", subject, observations: [], methodology_status: "EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
    metadata: { serving_layer: "NOT_CONFIGURED", warehouse_methodology_status: "EVIDENCE_ONLY_NOT_IN_GRO_V02", coverage: [], composition_method: null, route_modeling_status: null, direct_evidence_status: null },
    note: "Offline synthetic source fixture; never production evidence." };
}
function release(country: string, dimension = "critical_minerals"): StructuralContext {
  const c = empty({ type: "country", country_iso3: country });
  return { ...c, status: "AVAILABLE", observations: [{
    observation_id: `synthetic:${country}:${dimension}`, source_id: `private_fixture_${dimension}`, source_record_id: null,
    country_iso3: country, partner_country_iso3: null, dimension, metric: "synthetic_derived_change_pct",
    value_numeric: country === "USA" ? 2 : 3, value_text: "Synthetic offline derived value.", unit: "percent_change",
    observed_at: "2025-12-31T23:59:59.000Z", published_at: null, retrieved_at: NOW.toISOString(),
    event_type: null, signal_type: "ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS", source_url: null,
    parser_version: "synthetic-test-only", methodology_status: "EVIDENCE_ONLY_NOT_IN_GRI_V1_2", quality_status: "VERIFIED",
    provenance: { date_precision: "YEAR", reference_year: 2025, reference_period_end_is_not_publication_time: true }, normalized_hash: "a".repeat(64),
  }] };
}
// Synthetic rights rows model explicit source-by-source authorization; they
// do not prove any production provider, historical B2 payload or licence.
const fixtureRights = async (ids: string[]) => ({
  eligible: true, ineligible_source_ids: [],
  results: ids.map(source_id => ({ source_id, eligible: true })),
});
const storeRead = (plan: ReturnType<typeof buildAgentQueryPlan>) =>
  loadAgentQueryStructuralContext(plan, plan.subjects[0], { sourceEligibilityChecker: fixtureRights });
function proof(plan: ReturnType<typeof buildAgentQueryPlan>, context: StructuralContext) {
  return () => assertStoreStructuralEvidence(plan, { asOf: NOW.toISOString(), subjects: [{ context, worldBank: {} }] });
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW); vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("UNEXPECTED_EXTERNAL_TEST_NETWORK"); }));
  mock.primary.mockImplementation(empty); mock.mcs.mockImplementation(country => release(country)); mock.fx.mockImplementation(country => release(country, "external_fx"));
  mock.freeze.mockImplementation(async ({ quote, preparedIntelligence }) => ({ quote, intelligence: preparedIntelligence, frozen: freezeCanonicalCapabilityHttpBody(preparedIntelligence) }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("qualified releases reuse the exact Store country/dimension scope (offline synthetic fixtures)", () => {
  it("reads both corridor endpoints separately and preserves directional non-route metadata", async () => {
    const plan = buildAgentQueryPlan(GEOMACRO_STORE_REQUEST_EXAMPLES.corridor_digest);
    const result = await storeRead(plan);
    expect(mock.mcs.mock.calls.map(row => row[0])).toEqual(["USA", "CAN"]);
    expect(new Set(result.observations.map(row => row.country_iso3))).toEqual(new Set(["USA", "CAN"]));
    expect(result.metadata).toMatchObject({ composition_method: "ENDPOINT_COMPOSED_V0_1", route_modeling_status: "NOT_MODELED", direct_evidence_status: "NO_DIRECT_BILATERAL_EVIDENCE" });
    expect(proof(plan, result)).not.toThrow();
  });
  it("does not fabricate a destination when that country has no qualified rows", async () => {
    mock.mcs.mockImplementation(country => country === "USA" ? release(country) : null);
    const plan = buildAgentQueryPlan(GEOMACRO_STORE_REQUEST_EXAMPLES.corridor_digest);
    const result = await storeRead(plan);
    expect(result.observations.every(row => row.country_iso3 === "USA")).toBe(true);
    expect(proof(plan, result)).toThrow("ENDPOINT_MODULE_UNVERIFIED");
  });
  it("combines exact requested dimensions in a full country profile without substituting macro data", async () => {
    const plan = buildAgentQueryPlan({ ...GEOMACRO_STORE_REQUEST_EXAMPLES.country_profile, subjects: [{ type: "country", country_iso3: "IND" }], topics: ["critical_minerals", "fx_external_risk"] });
    const result = await storeRead(plan);
    expect(new Set(result.observations.map(row => row.dimension))).toEqual(new Set(["critical_minerals", "external_fx"]));
    expect(proof(plan, result)).not.toThrow();
    const unchangedScope = buildAgentQueryPlan(GEOMACRO_STORE_REQUEST_EXAMPLES.country_profile);
    const incomplete = await storeRead(unchangedScope);
    expect(incomplete.observations.some(row => row.dimension === "macro_monetary")).toBe(false);
    expect(proof(unchangedScope, incomplete)).toThrow("ENDPOINT_MODULE_UNVERIFIED");
  });
  it("keeps a complete verified archive and avoids unnecessary publisher requests", async () => {
    const plan = buildAgentQueryPlan(GEOMACRO_STORE_REQUEST_EXAMPLES.country_digest);
    const original = release("USA"); mock.primary.mockResolvedValue(original);
    expect(await storeRead(plan)).toEqual(original);
    expect(mock.mcs).not.toHaveBeenCalled(); expect(mock.fx).not.toHaveBeenCalled();
  });
  it("retains a genuine origin and reads only the missing endpoint", async () => {
    const plan = buildAgentQueryPlan(GEOMACRO_STORE_REQUEST_EXAMPLES.corridor_digest);
    mock.primary.mockResolvedValue({ ...release("USA"), subject: plan.subjects[0] });
    const result = await storeRead(plan);
    expect(mock.mcs.mock.calls.map(row => row[0])).toEqual(["CAN"]);
    expect(proof(plan, result)).not.toThrow();
  });
  it.each(["stale", "future", "foreign"])("does not accept a %s endpoint release or replace its source clock with retrieval time", async mode => {
    mock.mcs.mockImplementation(country => {
      const c = release(country);
      if (country === "CAN") c.observations = c.observations.map(row => ({ ...row,
        country_iso3: mode === "foreign" ? "BRA" : row.country_iso3,
        observed_at: mode === "stale" ? "2020-01-01T00:00:00Z" : mode === "future" ? "2027-01-01T00:00:00Z" : row.observed_at,
      }));
      return c;
    });
    const plan = buildAgentQueryPlan(GEOMACRO_STORE_REQUEST_EXAMPLES.corridor_digest);
    expect(proof(plan, await storeRead(plan))).toThrow("ENDPOINT_MODULE_UNVERIFIED");
  });
  it("rejects a foreign primary subject and does not relabel it", async () => {
    const plan = buildAgentQueryPlan(GEOMACRO_STORE_REQUEST_EXAMPLES.country_digest);
    mock.primary.mockResolvedValue(release("CAN"));
    await expect(storeRead(plan)).rejects.toThrow("SUBJECT_MISMATCH");
  });
  it("excludes rights-ineligible competing source rows without blocking the independently allowed record", async () => {
    const plan = buildAgentQueryPlan(GEOMACRO_STORE_REQUEST_EXAMPLES.country_digest);
    const original = release("USA");
    const lawful = { ...original.observations[0], source_id: "lawful_offline_fixture", normalized_hash: "b".repeat(64) };
    const denied = { ...original.observations[0], source_id: "denied_offline_fixture", normalized_hash: "c".repeat(64) };
    mock.primary.mockResolvedValue({ ...original, observations: [lawful, denied] });
    const result = await loadAgentQueryStructuralContext(plan, plan.subjects[0], {
      sourceEligibilityChecker: async () => ({
        ineligible_source_ids: ["denied_offline_fixture"],
        results: [
          { source_id: "lawful_offline_fixture", eligible: true },
          { source_id: "denied_offline_fixture", eligible: false },
        ],
      }),
    });
    expect(result.observations.map(row => row.source_id)).toEqual(["lawful_offline_fixture"]);
    expect(mock.mcs).not.toHaveBeenCalled();
    expect(proof(plan, result)).not.toThrow();
  });
  it("tries a separately qualified original when a fresh archived source has no rights", async () => {
    const plan = buildAgentQueryPlan(GEOMACRO_STORE_REQUEST_EXAMPLES.country_digest);
    const original = release("USA");
    mock.primary.mockResolvedValue({ ...original, observations: original.observations.map(
      row => ({ ...row, source_id: "unlicensed_archive_fixture" }),
    ) });
    const result = await loadAgentQueryStructuralContext(plan, plan.subjects[0], {
      sourceEligibilityChecker: async () => ({
        ineligible_source_ids: ["unlicensed_archive_fixture"],
        results: [{ source_id: "unlicensed_archive_fixture", eligible: false }],
      }),
    });
    expect(mock.mcs).toHaveBeenCalledTimes(1);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].source_id).toBe("private_fixture_critical_minerals");
    expect(proof(plan, result)).not.toThrow();
  });
  it("never lets a rights-registry error admit an archive row without separate source proof", async () => {
    const plan = buildAgentQueryPlan(GEOMACRO_STORE_REQUEST_EXAMPLES.country_digest);
    const original = release("USA");
    mock.primary.mockResolvedValue(original);
    mock.mcs.mockResolvedValue(null);
    const result = await loadAgentQueryStructuralContext(plan, plan.subjects[0], {
      sourceEligibilityChecker: async () => { throw Error("OFFLINE_RIGHTS_REGISTRY_UNAVAILABLE"); },
    });
    expect(result.observations).toEqual([]);
    expect(proof(plan, result)).toThrow("ENDPOINT_MODULE_UNVERIFIED");
  });
  it("preserves legacy reader options and keeps signed queries outside structural release opt-in", async () => {
    const plan = buildAgentQueryPlan(GEOMACRO_STORE_REQUEST_EXAMPLES.signed_existing);
    await storeRead(plan);
    expect(mock.primary).toHaveBeenCalledWith(plan.subjects[0], { allowQualifiedRelease: false, qualifiedReleaseTopic: "risk_object" });
    expect(mock.mcs).not.toHaveBeenCalled(); expect(mock.fx).not.toHaveBeenCalled();
  });
  it.each(["corridor_digest", "country_profile", "corridor_profile"] as const)("admits, assembles, prices and freezes %s with actual qualified endpoint reads", async id => {
    const example = structuredClone(GEOMACRO_STORE_REQUEST_EXAMPLES[id]);
    const raw = id === "corridor_digest" ? example : { ...example, topics: ["critical_minerals", "fx_external_risk"] };
    const plan = buildAgentQueryPlan(raw);
    const availability = await checkAgentQueryDeliverability(plan, { now: NOW, sourceEligibilityChecker: async ids => ({ eligible: true, ineligible_source_ids: [], results: ids.map(source_id => ({ source_id, eligible: true, commercial_usage_status: "DERIVED_ONLY", attribution_required: false, raw_redistribution_allowed: false, licence_name: "synthetic-test-only" })) as any }) });
    expect(availability.deliverable).toBe(true);
    const result = await prepareVerifiedCapabilityOffer({ plan, availability, clientRequestId: null, requestFingerprint: "f".repeat(64), rail: "coinbase_x402", network: "eip155:8453", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", recipient: "0x" + "1".repeat(40) });
    expect(result.quote.amount_atomic).toBe(resolveGeomacroCapabilityPrice(raw.product.capability, raw.product.variant).amount_atomic);
    expect(result.frozen.sha256).toBe(result.quote.prepared_answer_sha256);
    expect(result.frozen.body).not.toContain("private_fixture");
    expect(mock.primary).toHaveBeenCalledTimes(1); // assembly reuses the private evidence capture
  });
});
