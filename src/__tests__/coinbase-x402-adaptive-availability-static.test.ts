import fs from "node:fs";
import { describe, expect, it } from "vitest";

const availabilityRoute = fs.readFileSync("src/routes/api.x402.risk_.availability.ts", "utf8");
const paidRoute = fs.readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts", "utf8");

describe("Coinbase x402 adaptive availability boundary", () => {
  it("uses deterministic planning and governed deliverability before payment", () => {
    expect(availabilityRoute).toContain("buildAgentQueryPlan");
    expect(availabilityRoute).toContain("checkAgentQueryDeliverability");
    expect(availabilityRoute).toContain("checkAgentQueryExternalModule");
    expect(availabilityRoute).toContain("query_plan_hash");
    expect(availabilityRoute).toContain("payment_required_now: false");
  });

  it("never returns internal rights contracts or provider identities to no-charge callers", () => {
    expect(availabilityRoute).toContain("publicAgentQueryAvailability");
    expect(availabilityRoute).toContain("availability: publicAgentQueryAvailability(availability)");
    expect(availabilityRoute).not.toMatch(/\\n\\s+availability,\\n\\s+execution_authorized:/);
    const sanitize = fs.readFileSync("src/lib/agent-query-deliverability.server.ts","utf8");
    expect(sanitize).toContain("ineligible_source_count: result.ineligible_source_ids.length");
    expect(sanitize).not.toContain("source_contracts: result.source_contracts");
  });

  it("never verifies or settles a payment on the availability endpoint", () => {
    expect(availabilityRoute).not.toContain("verifyCoinbaseX402");
    expect(availabilityRoute).not.toContain("settleCoinbaseX402");
    expect(availabilityRoute).not.toContain("PAYMENT-SIGNATURE");
    expect(availabilityRoute).not.toContain("PAYMENT-REQUIRED");
  });

  it("returns the exact proof-qualified capability price only as pre-payment metadata", () => {
    expect(availabilityRoute).toContain("getCoinbaseX402Config");
    expect(availabilityRoute).toContain("resolveEligibleCoinbaseCapabilityConfig(plan, availability, config)");
    expect(availabilityRoute).toContain("exact_price: pricedConfig ?");
    expect(availabilityRoute).toContain("amount_usdc: pricedConfig.priceUsdc");
    expect(availabilityRoute).toContain("amount_atomic: pricedConfig.amountAtomic");
    expect(availabilityRoute).toContain("chargeable: availability.deliverable");
  });

  it("advertises a standards-shaped Geomacro query-binding extension with the source-free delivery boundary", () => {
    expect(paidRoute).toContain("geomacro: {");
    expect(paidRoute).toContain("info: {");
    expect(paidRoute).toContain("schema: {");
    expect(paidRoute).toContain('required: ["product", "query_plan_hash", "delivery_boundary", "raw_data_delivered", "source_identity_delivered", "execution_authorized"]');
    expect(paidRoute).toContain('delivery_boundary: "STRUCTURED_DERIVED_INTELLIGENCE_ONLY"');
    expect(paidRoute).toContain("raw_data_delivered: false");
    expect(paidRoute).toContain("source_identity_delivered: false");
    expect(paidRoute).toContain("const info = extension.info");
    expect(paidRoute).toContain("PAYMENT_QUERY_PLAN_MISMATCH");
  });

  it("requires the structured response contract before settlement", () => {
    expect(fs.readFileSync("src/lib/capability-x402-offer.server.ts", "utf8")).toContain("assertGeomacroIntelligenceResponseContract");
    const validate = paidRoute.indexOf("assertFrozenCapabilityResponse(prepared)");
    const prepare = paidRoute.indexOf("await prepareCoinbaseX402Delivery");
    const settle = paidRoute.indexOf("await settleCoinbaseX402");
    expect(validate).toBeGreaterThanOrEqual(0);
    expect(prepare).toBeGreaterThan(validate);
    expect(settle).toBeGreaterThan(prepare);
  });

  it("rechecks deliverability and prepares the product before settlement", () => {
    const finalCheck = paidRoute.indexOf("FINAL_AVAILABILITY_CHECK_FAILED");
    const prepare = paidRoute.indexOf("await prepareCoinbaseX402Delivery");
    const settle = paidRoute.indexOf("await settleCoinbaseX402");
    expect(finalCheck).toBeGreaterThanOrEqual(0);
    expect(prepare).toBeGreaterThan(finalCheck);
    expect(settle).toBeGreaterThan(prepare);
  });
});
