import { describe, expect, it } from "vitest";
import { GEOMACRO_STORE_REQUEST_EXAMPLES } from "./store-product-examples";
import { publicCapabilityPricingCatalog, resolveGeomacroCapabilityPrice } from "./capability-pricing-catalog";
import {
  preflightStoreProductData, storeProductAvailabilityDiscovery,
} from "./store-product-availability.server";
import type { AgentQueryPlan } from "./agent-query-plan";
import type { AgentQueryDeliverability } from "./agent-query-deliverability.server";

const url = "https://geomacro.live/api/v1/intelligence/products-availability";
const body = GEOMACRO_STORE_REQUEST_EXAMPLES.country_digest;
const request = (payload: unknown, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
const check = async (plan: AgentQueryPlan): Promise<AgentQueryDeliverability> => ({
  deliverable: true, code: "AVAILABLE",
  query_plan_hash: plan.query_plan_hash, checked_at: new Date().toISOString(),
  missing_modules: [], stale_modules: [], ineligible_source_ids: [],
  source_contracts: [{
    source_id: "test-reviewed-source",
    commercial_usage_status: "DERIVED_ONLY",
    raw_redistribution_allowed: false, attribution_required: false, licence_name: null,
  }],
  subjects: plan.subjects.map(subject => ({
    subject, status: "AVAILABLE", available_modules: [...plan.required_modules],
    latest_evidence_at: new Date().toISOString(), required_source_ids: ["test-reviewed-source"],
    governed_fallback_modules: [],
  })),
});
const qualify = {
  rateLimit: () => true,
  check,
  // Synthetic classifier only in these unit tests. The exported HTTP route
  // always uses the actual canonical evidence / price classifier.
  classify: (plan: AgentQueryPlan) =>
    resolveGeomacroCapabilityPrice(plan.product!.capability, plan.product!.variant),
};
describe("no-funds buyer and agent product data preflight", () => {
  it("discovers the exact 12 publicly active price variants, without retired GRI", () => {
    const catalog = storeProductAvailabilityDiscovery();
    const variants = catalog.supported_products.flatMap(product =>
      product.variants.map(variant => product.capability + ":" + variant.variant));
    const expected = publicCapabilityPricingCatalog().flatMap(product =>
      product.variants.map(variant => product.capability + ":" + variant.variant));
    expect(variants).toEqual(expected);
    expect(variants).toHaveLength(12);
    expect(variants.some(s => s.startsWith("gri_read:"))).toBe(false);
    expect(catalog.preflight_is_not_an_x402_quote).toBe(true);
    expect(catalog.preflight_is_not_payment_authorization).toBe(true);
  });
  it("returns data readiness and exact locked catalog price without any charge", async () => {
    const response = await preflightStoreProductData(request(body), qualify);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("DATA_ELIGIBLE_NOT_YET_PREPARED_OR_PAYABLE");
    expect(json.catalog_price.amount_usdc).toBe("0.02");
    expect(json.selected_product.capability).toBe("structural_country_digest");
    expect(json.chargeable).toBe(false);
    expect(json.payment_required_now).toBe(false);
    expect(json.payment_authorized).toBe(false);
  });
  it("fails closed on missing explicit selected product", async () => {
    const {product: _product, ...unsigned} = body;
    const response = await preflightStoreProductData(request(unsigned), qualify);
    expect(response.status).toBe(400);
  });
  it("rejects a payment or authorization header at the discovery endpoint", async () => {
    const response = await preflightStoreProductData(
      request(body, { "payment-signature": "not-an-authority" }), qualify);
    expect(response.status).toBe(400);
    expect((await response.json()).payment_authorized).toBe(false);
  });
  it("checks content type, body size and rate budget ahead of D1 proof reads", async () => {
    expect((await preflightStoreProductData(
      request(body, { "Content-Type": "text/plain" }), qualify)).status).toBe(415);
    expect((await preflightStoreProductData(request(body, {
      "Content-Length": "90000",
    }), qualify)).status).toBe(413);
    expect((await preflightStoreProductData(request(body), {
      ...qualify, rateLimit: () => false,
    })).status).toBe(429);
  });
  it("rejects unqualified, stale and query-mismatched availability", async () => {
    for (const mutation of [
      (a: AgentQueryDeliverability) => ({ ...a, deliverable: false }),
      (a: AgentQueryDeliverability) => ({ ...a, code: "STALE_REQUIRED_DATA" as const }),
      (a: AgentQueryDeliverability) => ({ ...a, query_plan_hash: "wrong" }),
      (a: AgentQueryDeliverability) => ({ ...a, missing_modules: ["critical_minerals"] }),
    ]) {
      const response = await preflightStoreProductData(request(body), {
        ...qualify,
        check: async plan => mutation(await check(plan)),
      });
      expect(response.status).toBe(422);
      expect((await response.json()).chargeable).toBe(false);
    }
  });
  it("rejects any classifier/catalog price or variant mismatch", async () => {
    const response = await preflightStoreProductData(request(body), {
      ...qualify,
      classify: () => resolveGeomacroCapabilityPrice("structural_country_profile", "standard"),
    });
    expect(response.status).toBe(422);
    expect((await response.json()).payment_required_now).toBe(false);
  });
  it("preserves fail-closed 503 when genuine proof engine fails", async () => {
    const response = await preflightStoreProductData(request(body), {
      ...qualify, check: async () => { throw Error("internal source details"); },
    });
    expect(response.status).toBe(503);
    const result = await response.json();
    expect(JSON.stringify(result)).not.toContain("internal source details");
    expect(result.chargeable).toBe(false);
  });
});
