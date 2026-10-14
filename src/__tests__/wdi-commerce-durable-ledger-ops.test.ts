import {describe,it,expect} from "vitest";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";

describe("WDI no-funds immutable commerce ledger contract",()=>{
  it("executes genuine Durable Object worker implementation using synthetic bytes only",()=>{
    const x=spawnSync(process.execPath,
      ["--test","scripts/ops/verify-wdi-durable-ledger.test.mjs"],
      {encoding:"utf8",timeout:15000,env:{
        ...process.env,GEOMACRO_COMMERCE_LEDGER_TOKEN:"",
        B2_ARCHIVE_READ_KEY_ID:"",B2_ARCHIVE_READ_APPLICATION_KEY:"",
        COINBASE_X402_MAINNET_ACK:"",CDP_API_KEY_SECRET:"",
      }});
    expect(x.status,String(x.stdout)+"\n"+String(x.stderr)).toBe(0);
  });
  it("retains public fail-closed WDI payment boundary and original commerce replay",()=>{
    const main=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
    const worker=readFileSync("workers/commerce-ledger/src/index.mjs","utf8");
    expect(main).toContain("WDI_PAYMENT_PROOF_NOT_ACCEPTED_BEFORE_FROZEN_OFFER");
    expect(main).toContain("WDI_PREPARED_X402_DELIVERY_NOT_DURABLY_FROZEN");
    for(const phrase of ["wdi-prequote-freeze","wdi-prequote-readback",
      "WDI_PREQUOTE_IMMUTABLE_CONFLICT","WDI_PREQUOTE_MISSING_STALE_OR_CORRUPT",
      "paymentKey(fingerprint)"])expect(worker).toContain(phrase);
  });
});
