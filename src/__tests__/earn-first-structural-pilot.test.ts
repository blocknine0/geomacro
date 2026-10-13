import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  agentAdaptiveQuerySchema, buildAgentQueryPlan,
} from "@/lib/agent-query-plan";
import {
  earnFirstStructuralOfferHandlers, preflightStructuralBaseline,
} from "@/lib/earn-first-structural-offers.server";
import type { AgentQueryDeliverability } from "@/lib/agent-query-deliverability.server";

const pilot = {
  fulfillment_mode: "published_only",
  delivery_tier: "structural_baseline",
  topics: ["macro_risk"],
  subjects: [{ type: "country", country_iso3: "USA" }],
} as const;

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://geomacro.live/api/v1/intelligence/availability", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const fakeAvailability = (
  plan: ReturnType<typeof buildAgentQueryPlan>,
  eligible = true,
): AgentQueryDeliverability => ({
  deliverable: eligible,
  code: eligible ? "AVAILABLE" : "INSUFFICIENT_COVERAGE",
  query_plan_hash: plan.query_plan_hash,
  checked_at: "2026-10-13T13:00:00.000Z",
  missing_modules: eligible ? [] : ["sovereign_fiscal"],
  stale_modules: [],
  ineligible_source_ids: [],
  source_contracts: [{
    source_id: "PRIVATE_PROVENANCE_DO_NOT_RETURN", commercial_usage_status: "DERIVED_ONLY",
    raw_redistribution_allowed: false, attribution_required: false, licence_name: null,
  }],
  subjects: [{
    subject: plan.subjects[0],
    status: "AVAILABLE",
    available_modules: eligible ? [...plan.required_modules] : ["macro_monetary"],
    latest_evidence_at: "2026-10-12T00:00:00.000Z",
    required_source_ids: ["PRIVATE_PROVENANCE_DO_NOT_RETURN"],
    governed_fallback_modules: [],
  }],
});

describe("earn-first original-dated structural baseline pilot", () => {
  it("keeps every existing legacy published-only x402 payment query hash unchanged", () => {
    const legacy = { topics: ["macro_risk"], subjects: [{ type: "country", country_iso3: "USA" }] };
    const before = buildAgentQueryPlan(legacy);
    const after = buildAgentQueryPlan({ ...legacy, delivery_tier: "signed_risk_intelligence" });
    const baseline = buildAgentQueryPlan(pilot);
    expect(before.query_plan_hash).toBe(after.query_plan_hash);
    expect(before.required_modules).toEqual(["macro_monetary", "sovereign_fiscal"]);
    expect(after.required_modules).toEqual(before.required_modules);
    expect(baseline.query_plan_hash).not.toBe(before.query_plan_hash);
    expect(baseline.delivery_tier).toBe("structural_baseline");
    expect(baseline.required_modules).toEqual(before.required_modules);
    expect(baseline.required_modules).not.toContain("signed_risk_object");
    expect(baseline.required_modules).not.toContain("hot_topics");
  });

  it("requires one explicit country/topic, disallows live/signed risk and keeps legacy behavior", () => {
    const cases = [
      { ...pilot, topics: [] },
      { ...pilot, topics: ["risk_object"] },
      { ...pilot, topics: ["hot_topics"] },
      { ...pilot, topics: ["risk_gate"] },
      { ...pilot, topics: ["macro_risk", "critical_minerals"] },
      { ...pilot, fulfillment_mode: "live_on_demand" },
      { ...pilot, subjects: [{ type: "corridor", origin_country_iso3: "USA", destination_country_iso3: "CHN" }] },
      { ...pilot, subjects: [...pilot.subjects, { type: "country", country_iso3: "CHN" }] },
      { ...pilot, question: "What is the current signed risk score in USA?" },
      { ...pilot, question: "What changed today in Macro/FX?" },
      { ...pilot, question: "What do rare earth supply issues mean for country USA?" },
      { ...pilot, question: "How does conflict affect regional security?" },
      { ...pilot, as_of: "2026-10-01T00:00:00Z" },
      { ...pilot, ranking: { metric: "risk_object_score" } },
      { ...pilot, intent: "comparison" },
    ];
    for (const value of cases)
      expect(() => buildAgentQueryPlan(value)).toThrow();
    const validQuestion = buildAgentQueryPlan({
      ...pilot, question: "What is the inflation baseline for this country?",
    });
    expect(validQuestion.delivery_tier).toBe("structural_baseline");
    expect(validQuestion.required_modules).toEqual(["macro_monetary","sovereign_fiscal"]);
    // Legacy default remains compatible with valid historical signed queries.
    expect(buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "USA" }],
      question: "What is the latest geopolitical risk?",
    }).required_modules).toContain("signed_risk_object");
  });

  it("only advertises category offers; no money or readiness is presumed", async () => {
    const res = await earnFirstStructuralOfferHandlers.GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.offers.map((x: {category:string}) => x.category))
      .toContain("Critical Minerals");
    expect(body.signed_current_risk_object).toBe(false);
    expect(body.current_event_or_risk_score_promised).toBe(false);
    expect(body.payment_required_now).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE_PROVENANCE/i);
  });

  it("confirms actual governed module evidence, without falsely claiming funded checkout", async () => {
    const check = vi.fn(async (plan: ReturnType<typeof buildAgentQueryPlan>) =>
      fakeAvailability(plan));
    const res = await preflightStructuralBaseline(request(pilot), {
      check, rateLimit: () => true, paymentRailReady: () => false,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true, chargeable: false, payment_required_now: false,
      execution_authorized: false,
      status: "ELIGIBLE_BUT_PAYMENT_RAIL_LOCKED",
      payment_rail_ready: false,
      signed_gro_delivered: false, current_scored_risk_delivered: false,
      purchase_endpoint: "/api/v1/intelligence/query",
      price_authoritative_only_in_canonical_x402_quote: true,
    });
    expect(body.query_plan_hash).toBe(buildAgentQueryPlan(pilot).query_plan_hash);
    expect(body.availability.subjects[0].available_modules)
      .toEqual(["macro_monetary", "sovereign_fiscal"]);
    expect(check).toHaveBeenCalledOnce();
    expect(JSON.stringify(body)).not.toContain("PRIVATE_PROVENANCE_DO_NOT_RETURN");
    expect(JSON.stringify(body)).not.toContain("source_contracts");
    expect(JSON.stringify(body)).not.toContain("required_source_ids");
  });

  it("reports quote-eligible only after actual data qualification AND explicit payment rail", async () => {
    const res = await preflightStructuralBaseline(request(pilot), {
      check: async plan => fakeAvailability(plan),
      rateLimit: () => true,
      paymentRailReady: () => true,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ELIGIBLE_FOR_X402_QUOTE");
    expect(body.payment_required_now).toBe(false);
    expect(body.chargeable).toBe(false);
  });

  it("fails closed on source eligibility, stale data, or falsified module proof", async () => {
    const cases: Array<(plan: ReturnType<typeof buildAgentQueryPlan>) =>
      AgentQueryDeliverability> = [
      plan => fakeAvailability(plan, false),
      plan => ({ ...fakeAvailability(plan), query_plan_hash: "f".repeat(64) }),
      plan => ({ ...fakeAvailability(plan), subjects: [] }),
      plan => ({ ...fakeAvailability(plan),
        subjects: [{ ...fakeAvailability(plan).subjects[0], available_modules: [] }] }),
      plan => ({ ...fakeAvailability(plan), code: "COMMERCIAL_SOURCE_NOT_ELIGIBLE",
        ineligible_source_ids: ["PRIVATE_DENIED_SOURCE"] }),
      plan => ({ ...fakeAvailability(plan), source_contracts: [] }),
      plan => ({ ...fakeAvailability(plan), source_contracts: [{
        ...fakeAvailability(plan).source_contracts[0], attribution_required: true,
      }] }),
      plan => ({ ...fakeAvailability(plan), source_contracts: [{
        ...fakeAvailability(plan).source_contracts[0],
        commercial_usage_status: "RESEARCH_ONLY",
      }] }),
      plan => ({ ...fakeAvailability(plan), subjects: [{
        ...fakeAvailability(plan).subjects[0], latest_evidence_at: null,
      }] }),
      plan => ({ ...fakeAvailability(plan), subjects: [{
        ...fakeAvailability(plan).subjects[0],
        latest_evidence_at: "2099-01-01T00:00:00Z",
      }] }),
    ];
    for (const build of cases) {
      const res = await preflightStructuralBaseline(request(pilot), {
        check: async plan => build(plan),
        rateLimit: () => true, paymentRailReady: () => true,
      });
      const body = await res.json();
      expect(res.status).toBe(422);
      expect(body.chargeable).toBe(false);
      expect(body.payment_required_now).toBe(false);
      expect(JSON.stringify(body)).not.toContain("PRIVATE_DENIED_SOURCE");
    }
  });

  it("never accepts payment, refunds, source URLs, unlimited scans, or invalid requests", async () => {
    const checker = vi.fn(async (plan: ReturnType<typeof buildAgentQueryPlan>) =>
      fakeAvailability(plan));
    for (const [input, headers] of [
      [pilot, { "payment-signature": "not-an-authorization" }],
      [pilot, { authorization: "Bearer paid" }],
      [{ ...pilot, delivery_tier: "signed_risk_intelligence" }, {}],
      [{ ...pilot, topics: ["risk_gate"] }, {}],
      [{ ...pilot, question: "today's signed index" }, {}],
    ] as const) {
      const result = await preflightStructuralBaseline(request(input, headers), {
        check: checker, rateLimit: () => true,
      });
      expect(result.status).toBe(400);
      expect((await result.json()).payment_required_now).toBe(false);
    }
    expect(checker).not.toHaveBeenCalled();
    const blocked = await preflightStructuralBaseline(request(pilot), {
      check: checker, rateLimit: () => false,
    });
    expect(blocked.status).toBe(429);
    expect(checker).not.toHaveBeenCalled();
    const unavailable = await preflightStructuralBaseline(request(pilot), {
      check: async () => {throw Error("Internal secret failure");},
      rateLimit: () => true,
    });
    expect(unavailable.status).toBe(503);
    expect(JSON.stringify(await unavailable.json())).not.toContain("Internal secret failure");
  });

  it("preserves canonical Coinbase x402 settlement, idempotency, output and funding locks", () => {
    const source = readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
    const route = readFileSync("src/routes/api.v1.intelligence.availability.ts","utf8");
    const gate = readFileSync("src/lib/coinbase-x402.server.ts","utf8");
    expect(route).toContain("earnFirstStructuralOfferHandlers");
    for (const required of [
      "checkAgentQueryDeliverability(plan",
      "prepareCoinbaseX402Delivery",
      "assertPublicPaidOutputBoundary(prepared)",
      "settleCoinbaseX402(paymentPayload, config)",
      "claimCoinbaseX402Delivery",
      "X402_PAYMENT_REPLAY_CONFLICT",
    ]) expect(source).toContain(required);
    expect(gate).toContain("I_ACCEPT_REAL_USDC");
    expect(gate).toContain("assertCommercialLaunchAuthorized");
    expect(route).not.toContain("settleCoinbaseX402");
  });
});
