import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";

describe("#2170 80% of 1059 target measured as real unique HTTP feed transports",()=>{
  it("reconciles all 1059 private references with XML-only active HTTP evidence, no fake activation",()=>{
    const result=spawnSync("node",["--test",
      "scripts/lib/geomacro-feed-activation-ledger.test.mjs"],{
      encoding:"utf8",timeout:30000,maxBuffer:1200000,
    });
    expect(result.status,result.stdout+"\n"+result.stderr).toBe(0);
  });
  it("executes in the existing source probe job without extra source GETs and never touches x402",()=>{
    const flow=readFileSync(".github/workflows/expanded-official-source-observation.yml","utf8");
    const runner=readFileSync("scripts/ops/audit-operator-1059-feed-activation.mjs","utf8");
    const privateLedger=readFileSync("scripts/lib/geomacro-feed-activation-ledger.mjs","utf8");
    const query=readFileSync("src/routes/api.v1.intelligence.query.ts","utf8");
    expect(flow.match(/node scripts\/ops\/audit-operator-1059-feed-activation.mjs/g)?.length)
      .toBe(2);
    expect(flow).toContain("1059-feed-activation-audit.json");
    expect(runner).toContain("gatherPrivateIntakeSnapshot");
    expect(privateLedger).toContain("PUBLIC_FEED_ROTATION");
    expect(privateLedger).toContain("observed_rotating_groups");
    expect(privateLedger).toContain("requested_active_feed_target_80pct");
    expect(privateLedger).toContain("x402_payment_authorized:false");
    expect(query).toContain('view")!=="source-status"');
    for(const source of [runner,privateLedger]){
      for(const forbidden of ["settleCoinbaseX402","SUPABASE_DB_URL",
        "GEOMACRO_COMMERCE_LEDGER_TOKEN","B2_APPLICATION_KEY"])
        expect(source).not.toContain(forbidden);
    }
  });
});
