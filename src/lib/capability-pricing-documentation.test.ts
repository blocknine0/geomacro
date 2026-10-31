import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GEOMACRO_CAPABILITY_PRICES, GEOMACRO_CAPABILITY_PRICING_VERSION } from "./capability-pricing-catalog";

const docs = [
  "docs/COMMERCIAL_INTELLIGENCE.md",
  "docs/PAY_PER_CALL_PRODUCTION_ACTIVATION.md",
  "docs/PRODUCTION_LAUNCH_ACCEPTANCE.md",
  "docs/COINBASE_X402_BAZAAR_RUNBOOK.md",
  "docs/COMMERCIAL_AGENT_DISTRIBUTION_PLAN.md",
];

describe("commercial runbooks cannot contradict founder-locked capability pricing", () => {
  it("anchors all revenue instructions to the one versioned catalog", () => {
    expect(GEOMACRO_CAPABILITY_PRICING_VERSION).toBe("geomacro.capability-usdc.v2");
    expect(Object.keys(GEOMACRO_CAPABILITY_PRICES)).toHaveLength(8);
    for (const path of docs) {
      const content = readFileSync(path, "utf8");
      expect(content).toContain(GEOMACRO_CAPABILITY_PRICING_VERSION);
      expect(content).not.toMatch(/(?:canonical|coordinated|early-adoption|initial) (?:production |commercial )?(?:launch )?price (?:is|of) \*\*?0\.05 USDC/);
    }
  });
  it("blocks the old Supabase-ledger or flat price from becoming the production launch path", () => {
    const activation = readFileSync("docs/PAY_PER_CALL_PRODUCTION_ACTIVATION.md", "utf8");
    const acceptance = readFileSync("docs/PRODUCTION_LAUNCH_ACCEPTANCE.md", "utf8");
    expect(activation).toContain("Supabase remains frozen");
    expect(activation).toContain("source_as_of");
    expect(activation).toContain("NO FUNDS");
    expect(acceptance).toContain("REAL FUNDS DISABLED");
    expect(acceptance).toContain("0.02 to 0.05 USDC");
    expect(activation).not.toContain("production Supabase migration");
    expect(activation).not.toContain("COINBASE_X402_PRICE_USDC=0.05\n");
  });
});
