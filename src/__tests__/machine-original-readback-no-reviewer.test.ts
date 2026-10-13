import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("Reviewerless Geomacro original-page readback remains private and no-charge",()=>{
  it("runs the actual first-party exact-hash and source-clock regression suite",()=>{
    const run=spawnSync("node",[
      "--test","scripts/lib/geomacro-machine-original-readback.test.mjs",
    ],{encoding:"utf8",timeout:25_000,maxBuffer:600_000});
    expect(run.status,run.stdout+"\n"+run.stderr).toBe(0);
  });
  it("reuses pinned original publisher policy and never signs or bills",()=>{
    const s=readFileSync("scripts/lib/geomacro-machine-original-readback.mjs","utf8");
    expect(s).toContain("approvedFirstPartyOriginalArticleUrl");
    expect(s).toContain("verifiedPublisherPageDate");
    expect(s).toContain("original_article_sha256");
    expect(s).toContain("event_semantics_independently_verified:false");
    expect(s).toContain("legal_commercial_use_verified:false");
    expect(s).toContain("x402_payment_authorized:false");
    expect(s).not.toContain("settleCoinbase");
    expect(s).not.toContain("SUPABASE_DB_URL");
    expect(s).not.toContain("signRiskObject(");
  });
});
