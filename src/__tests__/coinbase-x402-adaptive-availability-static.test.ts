import fs from "node:fs";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync("src/routes/api.x402.risk_.availability.ts", "utf8");

describe("Coinbase x402 availability route", () => {
  it("uses deterministic planning and governed deliverability before payment", () => {
    expect(route).toContain("buildAgentQueryPlan");
    expect(route).toContain("checkAgentQueryDeliverability");
    expect(route).toContain("checkAgentQueryExternalModule");
    expect(route).toContain("query_plan_hash");
    expect(route).toContain("payment_required_now: false");
  });

  it("never verifies or settles a payment", () => {
    expect(route).not.toContain("verifyCoinbaseX402");
    expect(route).not.toContain("settleCoinbaseX402");
    expect(route).not.toContain("PAYMENT-SIGNATURE");
    expect(route).not.toContain("PAYMENT-REQUIRED");
  });

  it("returns exact configured price information only as pre-payment metadata", () => {
    expect(route).toContain("getCoinbaseX402Config");
    expect(route).toContain("amount_usdc: config.priceUsdc");
    expect(route).toContain("amount_atomic: config.amountAtomic");
    expect(route).toContain("chargeable: availability.deliverable");
  });
});
