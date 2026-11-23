import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const pricing = readFileSync("src/routes/pricing.tsx", "utf8");
const packs = readFileSync("src/components/low-barrier-pricing.tsx", "utf8");

describe("free intelligence and Risk Gate pricing surfaces", () => {
  it("keeps public intelligence reachable without requiring a pricing action", () => {
    expect(pricing).toContain('to="/intelligence"');
    expect(pricing).toContain("Open intelligence");
    expect(pricing).toContain("See public Risk Gate findings");
  });

  it("keeps /pricing focused on the unified Risk Gate product", () => {
    expect(pricing).toContain("Risk Gate pricing.");
    expect(pricing).toContain("One balance. Three categories.");
    expect(pricing).toContain("$0.15 BASIC, $0.20 STANDARD, and $0.30 COMPLEX");
    expect(packs).toContain("GEOPOLITICS, MACRO_FX, and CRITICAL_MINERALS");
  });

  it("shows accurate monthly pack credits and pay-per-call equivalents", () => {
    expect(packs).toContain("1 credit = $0.01 USD");
    expect(packs).toContain('id: "risk-gate-small", name: "Small", priceUsd: 15, credits: 1_500, basic: 100, standard: 75, complex: 50');
    expect(packs).toContain('id: "risk-gate-standard", name: "Standard", priceUsd: 30, credits: 3_000, basic: 200, standard: 150, complex: 100');
    expect(packs).toContain('id: "risk-gate-best", name: "Best", priceUsd: 60, credits: 6_000, basic: 400, standard: 300, complex: 200');
  });
});
