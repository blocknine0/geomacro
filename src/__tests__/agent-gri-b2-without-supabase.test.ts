import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";

const files=[
  "src/lib/agent-query-external-modules.server.ts",
  "src/lib/testnet-intelligence-capability.server.ts",
  "src/lib/agentic-demo-service.server.ts",
  "src/lib/agent-query-response.server.ts",
];

describe("Supabase-is-unavailable machine GRI serving",()=>{
  it("requires one independently verified B2 authority for all four machine/demo global risk consumers",()=>{
    for(const file of files){
      const code=readFileSync(file,"utf8");
      expect(code,file).toContain('import { readProductionGlobalRisk } from "./production-global-risk.server";');
      expect(code,file).toContain("readProductionGlobalRisk()");
      expect(code,file).not.toContain("readPublicGlobalRisk()");
      expect(code,file).not.toContain('from("gri_snapshots")');
      expect(code,file).not.toContain("getAppSupabase()");
    }
    const authority=readFileSync("src/lib/production-global-risk.server.ts","utf8");
    expect(authority).toContain("await readB2PublicRisk()");
    expect(authority).toContain('throw new Error("VERIFIED_B2_GLOBAL_RISK_UNAVAILABLE")');
    expect(authority).not.toContain("getAppSupabase");
    expect(authority).not.toContain("supabase.co");
  });
  it("uses the exact verified lowercase status rather than silently disabling every GRI module",()=>{
    const code=readFileSync(files[0],"utf8");
    expect(code).toContain('gri.verificationStatus === "verified"');
    expect(code).not.toContain('gri.verificationStatus === "VERIFIED"');
    // Cross-check the producer's real verified status, not a different enum.
    const publisher=readFileSync("src/lib/global-risk-assemble.ts","utf8");
    expect(publisher).toContain('latest.verification_status === "verified"');
  });
  it("does not extend website's 60-minute hold to x402 and machine APIs",()=>{
    const authority=readFileSync("src/lib/production-global-risk.server.ts","utf8");
    expect(authority).not.toContain("websitePublicCutoff");
    expect(authority).not.toContain("WEBSITE_GRI_DELAY_MS");
    const signed=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
    expect(signed).not.toContain("website-lagged-global-risk");
    for(const f of files){
      expect(readFileSync(f,"utf8")).not.toContain("getWebsiteLaggedGlobalRisk");
    }
  });
  it("preserves publisher-only canonical calculation from database when and only when explicit recovery job runs",()=>{
    const legacy=readFileSync("src/lib/global-risk-read.server.ts","utf8");
    expect(legacy).toContain("assemblePublicGlobalRisk");
    const publisher=readFileSync("scripts/ops/publish-b2-live-snapshots.ts","utf8");
    expect(publisher).toContain('import { readPublicGlobalRisk } from "../../src/lib/global-risk-read.server"');
    // Never republish previous B2 output as a newly signed/current snapshot.
    expect(publisher).not.toContain("readProductionGlobalRisk");
  });
});