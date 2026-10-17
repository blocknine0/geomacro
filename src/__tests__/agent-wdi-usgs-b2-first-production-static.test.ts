import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cases = [
  { path: "src/lib/agent-query-world-bank-modules.server.ts",
    method: "loadAgentWorldBankModule", source: "AGENT_WORLD_BANK_SOURCE_ID" },
  { path: "src/lib/agent-query-critical-minerals.server.ts",
    method: "loadAgentCriticalMineralsModule", source: "AGENT_CRITICAL_MINERALS_SOURCE_ID" },
] as const;

describe("WDI and USGS structural modules: B2 authority with no frozen Supabase", () => {
  for (const item of cases) {
    const text=readFileSync(item.path, "utf8");
    const method=text.slice(text.indexOf("export async function " + item.method));
    it(item.method + ": certified rights before any data reads", () => {
      expect(method.indexOf("checkCommercialSourceEligibility"))
        .toBeGreaterThanOrEqual(0);
      expect(method.indexOf("checkCommercialSourceEligibility"))
        .toBeLessThan(method.indexOf("await b2Fallback("));
      expect(method).toContain('"SOURCE_NOT_ELIGIBLE"');
    });
    it(item.method + ": B2 read before any optional Supabase standby", () => {
      expect(method.indexOf("await b2Fallback("))
        .toBeLessThan(method.indexOf("const db = requireRiskSupabase()"));
      expect(method.indexOf("if (b2State?.deliverable) return b2State"))
        .toBeLessThan(method.indexOf("const db = requireRiskSupabase()"));
    });
    it(item.method + ": frozen mode must return no-charge without Supabase", () => {
      expect(method.indexOf("if (!supabaseReadFallbackAllowed())"))
        .toBeLessThan(method.indexOf("const db = requireRiskSupabase()"));
      expect(method).toContain("return b2State ?? unavailable(");
      expect(method).toContain('"OBSERVATION_NOT_AVAILABLE"');
    });
    it(item.method + ": only one governed B2 read, no retry if standby fails", () => {
      expect(method.match(/await b2Fallback\(/g)).toHaveLength(1);
      expect(method).toContain("if (b2State) return b2State");
    });
  }
});
