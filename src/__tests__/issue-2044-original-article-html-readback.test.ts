import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
describe("#2044 original first-party pages genuine byte-readback with no commercial promotion",()=>{
  it("passes bounded article byte/hash, native clock and malicious/denied URL tests",()=>{
    const child=spawnSync("node",["--test",
      "scripts/lib/geomacro-original-page-readback.test.mjs"],{
      encoding:"utf8",timeout:30_000,maxBuffer:750_000,
    });
    expect(child.status,child.stdout+"\n"+child.stderr).toBe(0);
  });
  it("keeps the existing qualified paid/strict reviewer path separate",()=>{
    const source=readFileSync("scripts/lib/geomacro-original-page-readback.mjs","utf8");
    const cli=readFileSync("scripts/ops/verify-private-original-page-readback.mjs","utf8");
    const strict=readFileSync("src/lib/on-demand-reviewed-rights-qualifier.server.ts","utf8");
    expect(source).toContain("approvedFirstPartyOriginalArticleUrl");
    expect(source).toContain("verifiedPublisherPageDate");
    expect(source).toContain("original_pages_authenticity_and_clock_verified:valid");
    expect(source).toContain("source_content_match_claim_semantically_verified:false");
    expect(source).toContain("licensed_commercial_use_verified:false");
    expect(source).toContain("payment_authorized:false");
    expect(source).toContain('Object.hasOwn(row,"original_article_sha256")');
    expect(strict).toContain("approvedIndependentReviewerFromEnv()");
    for(const code of [source,cli]){
      for(const forbidden of ["settleCoinbaseX402","requireRiskSupabase",
        "createReviewedRightsOnDemandQualifier","D1.prepare","B2_APPLICATION_KEY"]){
        expect(code).not.toContain(forbidden);
      }
    }
  });
});
