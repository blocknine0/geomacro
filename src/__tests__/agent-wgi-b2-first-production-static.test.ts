import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=readFileSync("src/lib/agent-query-political-governance.server.ts","utf8");
const method=source.slice(source.indexOf("export async function loadAgentPoliticalGovernanceModule"));

describe("WGI structural country digest remains B2-first with frozen Supabase",()=>{
  it("checks certified source rights before any serving access",()=>{
    expect(method.indexOf("checkCommercialSourceEligibility("))
      .toBeLessThan(method.indexOf("await b2Fallback("));
    expect(method).toContain('if (!source.eligible)');
  });
  it("reads governed B2 before optional Supabase standby",()=>{
    expect(method.indexOf("await b2Fallback("))
      .toBeLessThan(method.indexOf("const db = requireRiskSupabase()"));
    expect(method.indexOf("if (b2State?.deliverable) return b2State"))
      .toBeLessThan(method.indexOf("const db = requireRiskSupabase()"));
  });
  it("frozen mode never consults or reactivates legacy Supabase",()=>{
    expect(method.indexOf("if (!supabaseReadFallbackAllowed())"))
      .toBeLessThan(method.indexOf("const db = requireRiskSupabase()"));
    expect(method).toContain('return b2State ?? unavailable(input.subject, "OBSERVATION_NOT_AVAILABLE", sourceContract);');
    expect(method).not.toContain('console.warn("[agent-wgi] primary governed store unavailable');
  });
  it("does not repeat B2 quota-consuming reads after a standby failure",()=>{
    expect(method.match(/await b2Fallback\(/g)).toHaveLength(1);
    expect(method).toContain("if (b2State) return b2State");
  });
});
