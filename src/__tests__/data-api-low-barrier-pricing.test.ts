import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  GEOMACRO_AGENT_MICROPAYMENT,
  GEOMACRO_LOW_BARRIER_VERSION,
} from "../lib/low-barrier-pricing";
import {
  GEOMACRO_CAPABILITY_PRICING_VERSION,
  publicCapabilityPricingCatalog,
} from "../lib/capability-pricing-catalog";

const page = readFileSync("src/routes/pricing.tsx", "utf8");
const alias = readFileSync("src/routes/data-api.tsx", "utf8");
const store = readFileSync("src/components/low-barrier-pricing.tsx", "utf8");
const riskGateSetup = readFileSync("src/components/structured-product-setup.tsx", "utf8");
const paymentPreview = readFileSync("src/components/dual-rail-checkout.tsx", "utf8");

describe("unified Store & API: one authoritative low-barrier pricing catalog", () => {
  it("shows only the three monthly Risk Gate Packs with published call equivalents", () => {
    expect(page).toContain("GEOMACRO_LOW_BARRIER_VERSION");
    expect(page).toContain("data-store-api-unified={GEOMACRO_LOW_BARRIER_VERSION}");
    expect(store).toContain('aria-label="Monthly Risk Gate packs"');
    expect(store).toContain('id: "risk-gate-small", name: "Small", priceUsd: 15, credits: 1_500, basic: 100, standard: 75, complex: 50');
    expect(store).toContain('id: "risk-gate-standard", name: "Standard", priceUsd: 30, credits: 3_000, basic: 200, standard: 150, complex: 100');
    expect(store).toContain('id: "risk-gate-best", name: "Best", priceUsd: 60, credits: 6_000, basic: 400, standard: 300, complex: 200');
    expect(store).toContain("Unused credits never expire; your balance rolls over month to month.");
    expect(store).toContain("below $2.00");
    expect(store).toContain("Base, Polygon PoS, or Arc");
    expect(store).toContain("this preview does not promise automatic fallback or uninterrupted calls");
    expect(store).not.toContain("GEOMACRO_SUBSCRIPTIONS.map");
    expect(store).not.toContain("GEOMACRO_ONE_TIME_PACKS.map");
    expect(page).toContain("<LowBarrierPricing />");
    expect(store).toContain("1 credit = $0.01 USD");
    expect(page).toContain("$0.15 / $0.20 / $0.30 per eligible delivery");
    expect(riskGateSetup).toContain('fetch("/api/v1/risk-gate"');
    expect(riskGateSetup).toContain('value: "GEOPOLITICS"');
    expect(riskGateSetup).toContain('value: "MACRO_FX"');
    expect(riskGateSetup).toContain('value: "CRITICAL_MINERALS"');
    expect(riskGateSetup).toContain("country_iso3: riskGateCountry.trim().toUpperCase()");
    expect(riskGateSetup).toContain('mode: "prepare"');
    expect(riskGateSetup).not.toContain("structuredProductSetup");
    expect(paymentPreview).toContain("AI Agents · Base x402");
    expect(paymentPreview).toContain("Base USDC x402 agent payment · Locked preview");
    expect(alias).toContain('redirect({ to: "/pricing", replace: true })');
    expect(GEOMACRO_LOW_BARRIER_VERSION).toBe("geomacro.low-barrier.v1");
  });
  it("quotes only approved evidence-gated Base USDC x402 variants", () => {
    expect(GEOMACRO_AGENT_MICROPAYMENT).toMatchObject({
      network: "eip155:8453", asset: "USDC",
      minimum_usdc: "0.02", maximum_usdc: "0.30",
    });
    expect(page).not.toContain("GEOMACRO_AGENT_MICROPAYMENT.minimum_usdc");
    expect(page).not.toContain("GEOMACRO_AGENT_MICROPAYMENT.maximum_usdc");
    expect(page).not.toContain("<CapabilityPriceSchedule />");
    expect(page).not.toContain("GEOMACRO_CAPABILITY_PRICING_VERSION");
    expect(GEOMACRO_CAPABILITY_PRICING_VERSION).toBe("geomacro.capability-usdc.v2");
    const rows = publicCapabilityPricingCatalog();
    expect(rows.every((row) => row.capability !== "gri_read")).toBe(true);
    expect(rows.every((row) => row.variants.every((v) =>
      Number(v.amount_usdc) >= 0.02 && Number(v.amount_usdc) <= (row.capability==="risk_gate_bundle"?0.30:0.05),
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
    expect(inline).toContain("PayPal / card checkout · Locked");
    expect(inline).not.toContain("createOrder(");
    expect(inline).not.toContain("sendTransaction(");
    expect(page).toContain("Paid API requests become available only when the live payment and delivery service confirms activation.");
    expect(page).not.toContain("<CapabilityPriceSchedule />");
    expect(page).not.toContain('id="api-products"');
    expect(page).not.toContain('id="product-catalog"');
    expect(page).not.toContain("What every delivery includes.");
    expect(page).not.toMatch(/checkout\.stripe\.com|buy\.stripe\.com|payment_authorized:\s*true/);
  });
});
