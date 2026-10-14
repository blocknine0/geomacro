import fs from "node:fs";
import { describe, expect, it } from "vitest";

const capabilities = fs.readFileSync("src/routes/api.intelligence.capabilities.ts", "utf8");
const state = fs.readFileSync("src/routes/api.intelligence.state.ts", "utf8");
const contract = fs.readFileSync("src/lib/geomacro-intelligence-contract.ts", "utf8");

describe("public intelligence machine surfaces", () => {
  it("keeps capability discovery free and payment-bound", () => {
    expect(capabilities).toContain('"/api/v1/intelligence/query"');
    expect(capabilities).toContain('pricing_contract_version');
    expect(capabilities).toContain('capabilityPricingCatalog()');
    expect(capabilities).toContain('raw_source_identity_exposed: false');
  });

  it("offers a free state-change check without delivering paid intelligence", () => {
    expect(state).toContain('"/api/intelligence/state"');
    expect(state).toContain("known_state_version");
    expect(state).toContain("state_changed");
    expect(state).toContain("score_exposed: false");
    expect(state).toContain('required_for_current_intelligence: true');
    expect(state).not.toContain("object.risk.score");
    expect(state).not.toContain("event.title");
  });

  it("keeps legacy testnet reference separate from live capability-specific pricing", () => {
    expect(contract).toContain('GEOMACRO_INTELLIGENCE_PRICE_USDC');
    expect(capabilities).toContain("GEOMACRO_CAPABILITY_PRICING_VERSION");
    expect(capabilities).not.toContain("early_adoption_price_usdc");
    expect(capabilities).not.toContain("later_reference_price_usdc");
  });
});
