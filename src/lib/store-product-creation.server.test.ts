import {materializeNewsProduct} from "./news-product-factory.server";
import {normalizeReusableNewsJson} from "./reusable-news-json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { buildAgentQueryPlan } from "./agent-query-plan";
import { GEOMACRO_STORE_REQUEST_EXAMPLES } from "./store-product-examples";
import { resolveGeomacroCapabilityPrice } from "./capability-pricing-catalog";
import { checkAgentQueryDeliverability } from "./agent-query-deliverability.server";
import { resolveEligiblePublishedCapabilityPrice } from "./verified-capability-coinbase-binding.server";
import { prepareVerifiedCapabilityOffer, assembleVerifiedCapabilityProduct } from "./capability-x402-offer.server";
import { freezeCanonicalCapabilityHttpBody } from "./capability-x402-exact-http-body.server";
import { geomacroAgentToolToCanonicalQuery } from "./geomacro-agent-tools";
import type { StructuralContext, StructuralObservation } from "./structural-context.server";

const mocks = vi.hoisted(() => ({ context: vi.fn(), object: vi.fn(), verify: vi.fn(), freeze: vi.fn() }));
vi.mock("./structural-context.server", async original => ({ ...await original<typeof import("./structural-context.server")>(), loadStructuralContext: (...args: unknown[]) => mocks.context(...args) }));
vi.mock("./qualified-mcs-country-digest.server", async original => ({ ...await original<typeof import("./qualified-mcs-country-digest.server")>(), loadQualifiedMcsCountryContext: async () => null }));
vi.mock("./qualified-treasury-fx.server", async original => ({ ...await original<typeof import("./qualified-treasury-fx.server")>(), loadQualifiedTreasuryFxCountryContext: async () => null }));
vi.mock("./agent-query-external-modules.server", async original => ({ ...await original<typeof import("./agent-query-external-modules.server")>(), loadCommercialRiskObjectForAgentQuery: (...args: unknown[]) => mocks.object(...args) }));
vi.mock("./commercial-risk-object-policy", async original => ({ ...await original<typeof import("./commercial-risk-object-policy")>(), verifyCommercialRiskObjectArtifact: (...args: unknown[]) => mocks.verify(...args) }));
vi.mock("./capability-x402-prequote.server", () => ({ freezeVerifiedCapabilityAnswer: (...args: unknown[]) => mocks.freeze(...args) }));
vi.mock("./agent-query-hot-topics.server", () => ({ loadAgentHotTopics: async ({ subject }: any) => ({
  subject, deliverable: true, code: "AVAILABLE", checked_at: "2026-10-24T13:00:00.000Z",
  requested_families: [], matched_families: [], current_event_signal: false,
  commercially_deliverable_event_count: 0, excluded_non_deliverable_event_count: 0, events: [],
  source_pipeline: { status: "healthy", last_success_at: "2026-10-24T12:59:30.000Z", lag_seconds: 30, active_source_count: 1 },
  limitations: { raw_source_material_redistributed: false, article_text_redistributed: false, no_signal_is_not_zero_risk: true },
}) }));
vi.mock("./risk-gate-service.server", () => ({ evaluateCountryRiskGate: async () => ({ context: { execution_authorized: false }, response: { execution_authorized: false, decision: "CAUTION" } }) }));
vi.mock("./corridor-risk-gate-service.server", () => ({ evaluateCorridorRiskGate: async () => ({ context: { execution_authorized: false }, response: { execution_authorized: false, decision: "CAUTION" } }) }));

const NOW = new Date("2026-10-24T13:00:00.000Z"), NATIVE = "2026-10-23T00:00:00.000Z";
const publishedResponse = JSON.parse(readFileSync("schemas/adaptive-intelligence-response-v1.schema.json", "utf8"));
const selectedModules = ["macro_monetary", "external_fx", "sovereign_fiscal", "critical_minerals"];
function observation(country: string, module: string, index: number): StructuralObservation {
  return { observation_id: `${country}-${module}-${index}`, source_id: "private_test_fixture_only", source_record_id: null,
    dimension: module, country_iso3: country, partner_country_iso3: null, observed_at: NATIVE, published_at: NATIVE,
    metric: "synthetic_derived_metric", value_numeric: index + 1, value_text: null, unit: "index",
    event_type: null, signal_type: null, source_url: "https://private.invalid/not-customer-data", parser_version: "test-only",
    methodology_status: "evidence", quality_status: "accepted", provenance: {}, normalized_hash: (index % 10).toString().repeat(64), retrieved_at: NATIVE };
}
function context(subject: any): StructuralContext {
  const countries = subject.type === "country" ? [subject.country_iso3] : [subject.origin_country_iso3, subject.destination_country_iso3];
  return { status: "AVAILABLE", methodology_status: "EVIDENCE_ONLY_NOT_IN_GRI_V1_2", subject,
    observations: countries.flatMap((country: string) => selectedModules.map((module, i) => observation(country, module, i))),
    metadata: { serving_layer: subject.type === "country" ? "COUNTRY_PROFILE_V1" : "CORRIDOR_ENDPOINT_COMPOSED_V1",
      warehouse_methodology_status: "EVIDENCE_ONLY_NOT_IN_GRO_V02", coverage: [],
      composition_method: subject.type === "country" ? null : "ENDPOINT_COMPOSED_V0_1",
      route_modeling_status: subject.type === "country" ? null : "NOT_MODELED", direct_evidence_status: null }, note: "Synthetic offline fixture; no production evidence." };
}
function object(subject: any, asOf: string): any {
  const generated = "2026-10-24T12:59:30.000Z";
  if (Date.parse(asOf) < Date.parse(generated)) return null;
  return { schema_version: "gro-1.1", object_id: "synthetic-unit-only", issuer: "Geomacro",
    subject: { type: subject.type, id: subject.type === "country" ? subject.country_iso3 : `${subject.origin_country_iso3}>${subject.destination_country_iso3}`, name: null },
    risk: { score: 45, label: "ELEVATED", previous_score: 44, delta: 1, direction: "escalating" },
    attribution: [{ driver: "structural_change", score_contribution: 45, delta_contribution: 1, event_count: 1, weight: 1 }],
    confidence: 0.8, evidence_summary: { event_count: 1, evidence_count: 2, independent_source_count: 2 },
    methodology_version: "country-risk-v0.1.0-pilot", observed_at: generated, generated_at: generated,
    expires_at: "2026-10-24T14:00:00.000Z", verification: { status: "VERIFIED", reason_codes: [], last_verified_at: generated },
    commercial_eligibility: { status: "VERIFIED", reason_codes: [] },
    integrity: { input_hash: "a".repeat(64), data_hash: "b".repeat(64), calculation_hash: "c".repeat(64), payload_hash: "d".repeat(64), signature_scheme: "Ed25519", signing_key_id: "synthetic-unit-key-not-production" } };
}
const rights = async (ids: string[]) => ({ eligible: true, ineligible_source_ids: [], results: ids.map(source_id => ({
  source_id, eligible: true, commercial_usage_status: "DERIVED_ONLY", attribution_required: false, raw_redistribution_allowed: false, licence_name: "synthetic-test-only",
})) as any });
function request(id: keyof typeof GEOMACRO_STORE_REQUEST_EXAMPLES): any {
  const value: any = structuredClone(GEOMACRO_STORE_REQUEST_EXAMPLES[id]);
  if (id === "signed_new") value.product.issued_after = "2026-10-24T12:59:00.000Z";
  return value;
}
async function admitted(raw: unknown) {
  const plan = buildAgentQueryPlan(raw);
  const availability = await checkAgentQueryDeliverability(plan, { now: NOW, sourceEligibilityChecker: rights, externalModuleChecker: async () => true });
  return { plan, availability };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW); vi.clearAllMocks();
  mocks.context.mockImplementation(context); mocks.object.mockImplementation(object);
  // Existing signature/rights verification is independently tested. This
  // injected trusted-loader boundary is synthetic, never a production proof.
  mocks.verify.mockReturnValue({ deliverable: true });
  mocks.freeze.mockImplementation(async ({ quote, preparedIntelligence }) => ({ quote, intelligence: preparedIntelligence, frozen: freezeCanonicalCapabilityHttpBody(preparedIntelligence) }));
});
afterEach(() => vi.useRealTimers());

describe("all active Store creation contracts on the canonical mainnet engine (offline synthetic evidence)", () => {
  it.each(Object.keys(GEOMACRO_STORE_REQUEST_EXAMPLES) as Array<keyof typeof GEOMACRO_STORE_REQUEST_EXAMPLES>)("materializes the news-triggered %s context with the canonical assembler",async id=>{
    const news=normalizeReusableNewsJson({category:"rare_earth",country_iso3:"USA",
      published_at:"2026-10-24T12:58:00.000Z",text:"USA announced a critical mineral production investment of 25 million USD."});
    const result=await materializeNewsProduct({news,product_id:id,destination_country_iso3:"CAN",
      ...(id==="signed_new"?{issued_after:"2026-10-24T12:59:00.000Z"}:{})},{
        check:plan=>checkAgentQueryDeliverability(plan,{now:NOW,sourceEligibilityChecker:rights,externalModuleChecker:async()=>true}),
      });
    expect(result.status).toBe("QUALIFIED_CONTEXT_PREPARED");
    expect(result).toHaveProperty("prepared_context");
    expect(result.payment_authorized).toBe(false);
    expect(result.news_extraction_verified).toBe(false);
    expect(mocks.freeze).not.toHaveBeenCalled();
  });
  it.each(Object.keys(GEOMACRO_STORE_REQUEST_EXAMPLES) as Array<keyof typeof GEOMACRO_STORE_REQUEST_EXAMPLES>)("creates, prices and freezes %s using the real assembler", async id => {
    const raw = request(id), { plan, availability } = await admitted(raw);
    expect(availability.deliverable).toBe(true);
    expect(geomacroAgentToolToCanonicalQuery("store_product_query", raw).product).toEqual(raw.product);
    const expected = resolveGeomacroCapabilityPrice(raw.product.capability, raw.product.variant);
    expect(resolveEligiblePublishedCapabilityPrice(plan, availability, NOW)).toEqual(expected);
    const result = await prepareVerifiedCapabilityOffer({ plan, availability, clientRequestId: null, requestFingerprint: "f".repeat(64), rail: "coinbase_x402",
      network: "eip155:8453", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", recipient: "0x" + "1".repeat(40) });
    expect(result.quote.capability).toBe(raw.product.capability);
    expect(result.quote.variant).toBe(raw.product.variant);
    expect(result.quote.amount_atomic).toBe(expected.amount_atomic);
    expect(result.frozen.sha256).toBe(result.quote.prepared_answer_sha256);
    const intelligence = result.intelligence as any;
    expect(intelligence.question_interpretation.product).toEqual(raw.product);
    expect(JSON.stringify(intelligence)).not.toMatch(/private\.invalid|private_test_fixture_only|source_id|source_url/);
    expect(intelligence.execution_authorized).toBe(false);
    // Published closed envelopes must describe actual customer fields, not
    // reject valid Store output as an undocumented additional property.
    for (const [value, schema] of [
      [intelligence, publishedResponse],
      [intelligence.question_interpretation, publishedResponse.properties.question_interpretation],
      [intelligence.methodology, publishedResponse.properties.methodology],
      [intelligence.limitations, publishedResponse.properties.limitations],
      ...intelligence.structural.map((row: any) => [row.evidence_summary, publishedResponse.properties.structural.items.properties.evidence_summary]),
    ]) {
      for (const field of Object.keys(value)) expect(schema.properties).toHaveProperty(field);
      for (const field of schema.required ?? []) expect(value).toHaveProperty(field);
    }
    expect(publishedResponse.properties.payment.properties.provider.enum).toContain(intelligence.payment.provider);
  });
  it.each(Object.keys(GEOMACRO_STORE_REQUEST_EXAMPLES) as Array<keyof typeof GEOMACRO_STORE_REQUEST_EXAMPLES>)("prepares %s with no durable quote write", async id => {
    const {plan,availability}=await admitted(request(id));
    const {price,prepared}=await assembleVerifiedCapabilityProduct({plan,availability,clientRequestId:null});
    expect(price.capability).toBe(plan.product!.capability);
    expect(price.variant).toBe(plan.product!.variant);
    expect(prepared.delivered_product_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared).not.toHaveProperty("payment");
    expect(mocks.freeze).not.toHaveBeenCalled();
  });
  it("rejects origin-only corridor data even when the overall module timestamp is fresh", async () => {
    mocks.context.mockImplementation((subject: any) => ({ ...context(subject), observations: context(subject).observations.filter(row => row.country_iso3 === "USA") }));
    const { availability } = await admitted(request("corridor_digest"));
    expect(availability.deliverable).toBe(false);
    expect(availability.missing_modules).toContain("store_product_evidence");
    expect(mocks.freeze).not.toHaveBeenCalled();
  });
  it("rejects a stale destination dimension without re-dating it from a fresh origin", async () => {
    mocks.context.mockImplementation((subject: any) => ({ ...context(subject), observations: context(subject).observations.map(row => row.country_iso3 === "CAN" && row.dimension === "external_fx"
      ? { ...row, observed_at: "2020-01-01T00:00:00Z", published_at: "2020-01-01T00:00:00Z" } : row) }));
    expect((await admitted(request("corridor_profile"))).availability.deliverable).toBe(false);
  });
  it("keeps both endpoint observations inside a bounded digest and excludes unrelated countries", async () => {
    mocks.context.mockImplementation((subject: any) => ({ ...context(subject), observations: [
      ...Array.from({ length: 8 }, (_, index) => observation("USA", "critical_minerals", index)),
      observation("CAN", "critical_minerals", 8), observation("BRA", "critical_minerals", 9),
    ] }));
    const { plan, availability } = await admitted(request("corridor_digest"));
    const out = await prepareVerifiedCapabilityOffer({ plan, availability, clientRequestId: null, requestFingerprint: "e".repeat(64), rail: "coinbase_x402",
      network: "eip155:8453", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", recipient: "0x" + "1".repeat(40) });
    const intelligence = out.intelligence as any;
    expect(intelligence.structural[0].intelligence.critical_minerals.observations).toHaveLength(3);
    expect(new Set(intelligence.structural[0].intelligence.critical_minerals.observations.map((row: any) => row.country_iso3))).toEqual(new Set(["USA", "CAN"]));
  });
  it("does not accept a JSON-cloned or caller-forged availability as private Store proof", async () => {
    const { plan, availability } = await admitted(request("country_profile"));
    expect(() => resolveEligiblePublishedCapabilityPrice(plan, JSON.parse(JSON.stringify(availability)), NOW)).toThrow("QUALIFIED_EVIDENCE_REQUIRED");
  });
  it("does not relabel an existing or signature-invalid object as newly qualified", async () => {
    const raw = request("signed_new"), { plan, availability } = await admitted(raw);
    mocks.verify.mockReturnValue({ deliverable: false });
    expect(() => resolveEligiblePublishedCapabilityPrice(plan, availability, NOW)).toThrow("NEW_SIGNED_PUBLICATION_NOT_AVAILABLE");
    mocks.verify.mockReturnValue({ deliverable: true });
    const old = request("signed_new"); old.product.issued_after = "2020-01-01T00:00:00Z";
    const oldResult = await admitted(old);
    expect(() => resolveEligiblePublishedCapabilityPrice(oldResult.plan, oldResult.availability, NOW)).toThrow("ISSUANCE_REQUEST_UNVERIFIED");
  });
  it("binds the requested product/variant in the plan hash and rejects cheaper variants or wrong scopes", async () => {
    const full = request("country_profile");
    expect(() => buildAgentQueryPlan({ ...full, topics: ["macro_risk"] })).toThrow("DIMENSIONS_REQUIRED");
    expect(() => buildAgentQueryPlan({ ...full, subjects: request("corridor_profile").subjects })).toThrow("SCOPE_MISMATCH");
    expect(() => buildAgentQueryPlan({ ...full, product: { capability: "gri_read", variant: "verified_cached" } })).toThrow();
    const wrong = request("query_complex"); wrong.product.variant = "focused";
    const mismatch = await admitted(wrong);
    expect(() => resolveEligiblePublishedCapabilityPrice(mismatch.plan, mismatch.availability, NOW)).toThrow("REQUESTED_STORE_PRODUCT_MISMATCH");
    const base = request("country_digest"), selected = buildAgentQueryPlan(base);
    delete base.product;
    const legacy = buildAgentQueryPlan(base);
    expect(selected.query_plan_hash).not.toBe(legacy.query_plan_hash);
    expect(legacy).not.toHaveProperty("product");
    expect(() => buildAgentQueryPlan({ ...base, subjects: request("corridor_digest").subjects })).toThrow("BASELINE_PILOT_SCOPE_UNSUPPORTED");
  });
});
