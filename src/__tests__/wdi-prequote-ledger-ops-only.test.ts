import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

describe("Commerce Durable Object WDI prequote operations (no funds)",()=>{
  it("executes the real Worker code with isolated synthetic storage and no credentials",()=>{
    const cmd=spawnSync(process.execPath,
      ["--test","scripts/ops/verify-wdi-durable-ledger.test.mjs"],
      {encoding:"utf8",timeout:15000,env:{
        ...process.env,GEOMACRO_COMMERCE_LEDGER_TOKEN:"",
        CDP_API_KEY_SECRET:"",COINBASE_X402_MAINNET_ACK:"",
      }});
    expect(cmd.status,String(cmd.stdout)+"\n"+String(cmd.stderr)).toBe(0);
  });
  it("deployment is protected main-only and preserves original delivery/usage/audit",()=>{
    const y=readFileSync(".github/workflows/deploy-commerce-ledger-worker.yml","utf8");
    const w=readFileSync("workers/commerce-ledger/src/index.mjs","utf8");
    expect(y).toContain("github.ref == 'refs/heads/main'");
    expect(y).toContain("environment: production");
    expect(y).toContain("verify-commerce-ledger-worker.mjs");
    expect(y).toContain("verify-commerce-control-plane-worker.mjs");
    expect(y).toContain("verify-wdi-prequote-ledger-no-funds.mjs");
    for(const v of ["paymentKey(fingerprint)","async claim(body)","async prepare(body)",
      "async complete(body)","async usageReserve(body)","async auditUpsert(body)",
      "wdi-prequote-freeze","wdi-prequote-readback",
      'wdi_prequote_contract_version: "geomacro.wdi-prequote-worker.v1"'])
      expect(w).toContain(v);
  });
});
