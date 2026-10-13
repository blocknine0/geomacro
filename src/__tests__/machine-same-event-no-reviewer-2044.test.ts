import {spawnSync} from "node:child_process";
import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

describe("#2044 reviewer-free automated evidence staging without relaxing commercial trust",()=>{
  it("executes real anti-spoof, anti-syndication, anti-retraction candidate tests",()=>{
    const result=spawnSync("node",["--test",
      "scripts/lib/geomacro-machine-corroboration.test.mjs"],{
      encoding:"utf8",timeout:20_000,maxBuffer:500_000,
    });
    expect(result.status,result.stdout+"\n"+result.stderr).toBe(0);
  });
  it("does not modify strict human-review signoff, GEO GRO, rights, or payments",()=>{
    const machine=readFileSync("scripts/lib/geomacro-machine-corroboration.mjs","utf8");
    const reviewer=readFileSync("src/lib/on-demand-reviewed-rights-qualifier.server.ts","utf8");
    const cli=readFileSync("scripts/ops/evaluate-machine-same-event.mjs","utf8");
    expect(machine).toContain("clusterPrivateIndependentEventCandidates");
    expect(machine).toContain("x402_payment_authorized:false");
    expect(machine).toContain("licensed_commercial_source_rights_verified:false");
    expect(machine).toContain("independent_external_review_completed:false");
    expect(machine).not.toContain("settleCoinbase");
    expect(cli).not.toContain("SUPABASE_DB_URL");
    expect(cli).not.toContain("B2_KEY_ID");
    expect(reviewer).toContain("approvedIndependentReviewerFromEnv()");
    expect(reviewer).toContain("qualifyIndependentSameEvent");
  });
});
