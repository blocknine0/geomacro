import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  GEOMACRO_AGENT_MICROPAYMENT,
  GEOMACRO_ONE_TIME_PACKS,
  GEOMACRO_SUBSCRIPTIONS,
  GEOMACRO_LOW_BARRIER_VERSION,
} from "../lib/low-barrier-pricing";
import {
  GEOMACRO_CAPABILITY_PRICING_VERSION,
  publicCapabilityPricingCatalog,
} from "../lib/capability-pricing-catalog";

const page = readFileSync("src/routes/pricing.tsx", "utf8");
const alias = readFileSync("src/routes/data-api.tsx", "utf8");
const store = readFileSync("src/components/low-barrier-pricing.tsx", "utf8");

describe("unified Store & API: one authoritative low-barrier pricing catalog", () => {
  it("renders new-sale plans and packs from the same versioned catalog as Store", () => {
    expect(GEOMACRO_SUBSCRIPTIONS.map((p) => [p.price_usd, p.credits_per_30_days]))
      .toEqual([[9, 1000], [29, 5000], [99, 25000]]);
    expect(GEOMACRO_ONE_TIME_PACKS.map((p) => [p.price_usd, p.credits]))
      .toEqual([[5, 100], [15, 500], [30, 1500]]);
    expect(page).toContain("GEOMACRO_LOW_BARRIER_VERSION");
    expect(page).toContain("data-store-api-unified={GEOMACRO_LOW_BARRIER_VERSION}");
    expect(store).toContain("GEOMACRO_SUBSCRIPTIONS.map");
    expect(store).toContain("GEOMACRO_ONE_TIME_PACKS.map");
    expect(page).toContain("<LowBarrierPricing />");
    expect(alias).toContain('redirect({ to: "/pricing", replace: true })');
    expect(GEOMACRO_LOW_BARRIER_VERSION).toBe("geomacro.low-barrier.v1");
  });
  it("quotes only approved evidence-gated Base USDC x402 variants", () => {
    expect(GEOMACRO_AGENT_MICROPAYMENT).toMatchObject({
      network: "eip155:8453", asset: "USDC",
      minimum_usdc: "0.02", maximum_usdc: "0.05",
    });
    expect(page).not.toContain("GEOMACRO_AGENT_MICROPAYMENT.minimum_usdc");
    expect(page).not.toContain("GEOMACRO_AGENT_MICROPAYMENT.maximum_usdc");
    expect(page).not.toContain("<CapabilityPriceSchedule />");
    expect(page).not.toContain("GEOMACRO_CAPABILITY_PRICING_VERSION");
    expect(GEOMACRO_CAPABILITY_PRICING_VERSION).toBe("geomacro.capability-usdc.v2");
    const rows = publicCapabilityPricingCatalog();
    expect(rows.every((row) => row.capability !== "gri_read")).toBe(true);
    expect(rows.every((row) => row.variants.every((v) =>
      Number(v.amount_usdc) >= 0.02 && Number(v.amount_usdc) <= 0.05,
    ))).toBe(true);
    expect(rows.find((r) => r.capability === "risk_gate_bundle")?.launch_status)
      .toBe("COMING_SOON");
  });
  it("never presents an unverified card link or merchant settlement as active", () => {
    const inline = readFileSync("src/components/dual-rail-checkout.tsx", "utf8");
    expect(store).toContain("<LockedDualRailCheckout selection={selection} />");
    expect(store).not.toContain("Card to crypto");
    expect(store).not.toContain("Pay by card. Merchant receives USDC.");
    expect(inline).toContain('id="payment-checkout"');
    expect(inline).toContain("PayPal / card checkout · Locked");
    expect(inline).toContain("Manual transfer / QR · Locked");
    expect(inline).not.toContain("createOrder(");
    expect(inline).not.toContain("sendTransaction(");
    expect(page).toContain("Paid API requests become available only when the live payment and delivery service confirms activation.");
    expect(page).toContain("<CapabilityPriceSchedule />");
    expect(page).not.toMatch(/checkout\.stripe\.com|buy\.stripe\.com|payment_authorized:\s*true/);
  });
});
