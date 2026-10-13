import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";

describe("#2170 all 535 source roots full bounded rotation census, not raw ingestion",()=>{
  it("validates 14 distinct GitHub source observation windows and forged/stale reports",()=>{
    const r=spawnSync("node",["--test",
      "scripts/lib/governed-root-rotation-census.test.mjs"],{
      encoding:"utf8",timeout:30000,maxBuffer:900000,
    });
    expect(r.status,r.stdout+"\n"+r.stderr).toBe(0);
  });
  it("keeps prior source fair rotation and canonical x402 source-status GET intact",()=>{
    const root=readFileSync("scripts/ops/probe-source-discovery-roots.mjs","utf8");
    const cli=readFileSync("scripts/ops/collect-full-root-rotation-census.mjs","utf8");
    const route=readFileSync("src/routes/api.v1.intelligence.query.ts","utf8");
    const workflow=readFileSync(".github/workflows/source-root-full-rotation-census.yml","utf8");
    expect(root).toContain("position%windowCount===index");
    expect(cli).toContain("auditGovernedRootRotation");
    expect(cli).toContain("actions/artifacts/");
    expect(route).toContain('view")!=="source-status"');
    expect(route).toContain("mainnetIntelligenceHandlers");
    expect(workflow).toContain("source-root-full-rotation-census.json");
    for(const s of [cli,root]){
      for(const prohibited of [
        "settleCoinbaseX402","SUPABASE_DB_URL",
        "GEOMACRO_COMMERCE_LEDGER_TOKEN","rawArticleToCustomer",
      ])expect(s).not.toContain(prohibited);
    }
  });
});
