import fs from "node:fs";
import { describe, expect, it } from "vitest";

const availabilityRoute = fs.readFileSync("src/routes/api.x402.risk_.availability.ts", "utf8");
const paidRoute = fs.readFileSync("src/routes/api.x402.intelligence.ts", "utf8");

describe("Coinbase x402 adaptive availability boundary", () => {
  it("uses deterministic planning and governed deliverability before payment", () => {
    expect(availabilityRoute).toContain("buildAgentQueryPlan");
    expect(availabilityRoute).toContain("checkAgentQueryDeliverability");
    expect(availabilityRoute).toContain("checkAgentQueryExternalModule");
    expect(availabilityRoute).toContain("query_plan_hash");
    expect(availabilityRoute).toContain("payment_required_now: false");
  });

  it("never verifies or settles a payment on the availability endpoint", () => {
    expect(availabilityRoute).not.toContain("verifyCoinbaseX402");
    expect(availabilityRoute).not.toContain("settleCoinbaseX402");
    expect(availabilityRoute).not.toContain("PAYMENT-SIGNATURE");
    expect(availabilityRoute).not.toContain("PAYMENT-REQUIRED");
  });

  it("returns exact configured price information only as pre-payment metadata", () => {
    expect(availabilityRoute).toContain("getCoinbaseX402Config");
    expect(availabilityRoute).toContain("amount_usdc: config.priceUsdc");
    expect(availabilityRoute).toContain("amount_atomic: config.amountAtomic");
    expect(availabilityRoute).toContain("chargeable: availability.deliverable");
  });

  it("advertises a standards-shaped Geomacro query-binding extension", () => {
    expect(paidRoute).toContain("geomacro: {");
    expect(paidRoute).toContain("info: {");
    expect(paidRoute).toContain("schema: {");
    expect(paidRoute).toContain('required: ["product", "query_plan_hash", "execution_authorized"]');
    expect(paidRoute).toContain("const info = extension.info");
    expect(paidRoute).toContain("PAYMENT_QUERY_PLAN_MISMATCH");
  });

  it("rechecks deliverability before settlement", () => {
    const firstCheck = paidRoute.indexOf("checkAgentQueryDeliverability");
    const finalCheck = paidRoute.indexOf("FINAL_AVAILABILITY");
    const settle = paidRoute.indexOf("settleCoinbaseX402");
    expect(firstCheck).toBeGreaterThanOrEqual(0);
    expect(finalCheck).toBeGreaterThan(firstCheck);
    expect(settle).toBeGreaterThan(finalCheck);
  });
});
