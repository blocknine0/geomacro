import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("#2044 private machine candidate to independently reread original HTML",()=>{
  it("exercises real byte/hash-to-claim linkage and retraction/spoof rejection",()=>{
    const result=spawnSync("node",["--test",
      "scripts/lib/geomacro-machine-original-binding.test.mjs"],{
      encoding:"utf8",timeout:30000,maxBuffer:900000,
    });
    expect(result.status,result.stdout+"\n"+result.stderr).toBe(0);
  });
  it("does not turn same-event candidate into commercial intelligence or bypass strict GRO path",()=>{
    const src=readFileSync("scripts/lib/geomacro-machine-original-binding.mjs","utf8");
    const strict=readFileSync("src/lib/on-demand-reviewed-rights-qualifier.server.ts","utf8");
    expect(src).toContain("evaluateGeomacroMachineCorroboration");
    expect(src).toContain("verifyGeomacroOriginalPages");
    expect(src).toContain("r.article_sha256!==candidates[i].original_article_sha256");
    expect(src).toContain("semantic_same_event_claim_verified:false");
    expect(src).toContain("source_derived_commercial_rights_verified:false");
    expect(src).toContain("payment_authorized:false");
    expect(strict).toContain("approvedIndependentReviewerFromEnv()");
    for(const forbidden of ["settleCoinbaseX402","GEOMACRO_COMMERCE_LEDGER_TOKEN",
      "requireRiskSupabase","D1.prepare","B2_APPLICATION_KEY"])
      expect(src).not.toContain(forbidden);
  });
});
