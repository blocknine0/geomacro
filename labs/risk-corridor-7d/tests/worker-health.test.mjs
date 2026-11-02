import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import worker from "../src/worker.mjs";

const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const incoming = (path, method="GET")=>new Request("https://geomacro-rc-staging.example"+path, {method});

test("isolated Wrangler config pins exact owner-provisioned staging D1 without cron or main env",()=>{
  assert.equal(config.name,"geomacro-rc-staging");
  assert.equal(config.main,"src/worker.mjs");
  assert.equal(config.d1_databases.length,1);
  assert.deepEqual(config.d1_databases[0],{
    binding:"RC_STAGING_D1",
    database_name:"geomacro-risk-corridor-staging",
    database_id:"9f9c3a23-d299-4af1-9c4f-db9cc4bcb2f9"
  });
  assert.deepEqual(config.triggers.crons,["*/15 * * * *"]);
  assert.equal(config.vars.RC_SYNC_ENABLED,"0");
  assert.equal(config.vars.RC_SUPABASE_URL,"https://ymjuwuvbialsevfawvvq.supabase.co");
  assert.equal(config.routes,undefined);
});

test("health check only reads staging schema; never exposes commercial service",async()=>{
  let calls=0;
  const env={RC_STAGING_D1:{prepare(sql){
    calls++;
    assert.match(sql,/sqlite_master/);
    assert.match(sql,/gm_rc_requests/);
    return {first:async()=>({name:"gm_rc_requests"})};
  }}};
  const result=await worker.fetch(incoming("/_health"),env);
  assert.equal(result.status,200);
  const json=await result.json();
  assert.equal(json.ok,true);
  assert.equal(json.staging_d1_schema_readback,"VERIFIED");
  assert.equal(json.source_sync_active,false);
  assert.equal(json.risk_gate_active,false);
  assert.equal(json.payment_active,false);
  assert.equal(json.supabase_connected,false);
  assert.equal(calls,1);
});

test("missing binding or staging schema fails closed",async()=>{
  const missing=await worker.fetch(incoming("/_health"),{});
  assert.equal(missing.status,503);
  assert.equal((await missing.json()).code,"STAGING_D1_BINDING_MISSING");

  const invalid=await worker.fetch(incoming("/_health"),
    {RC_STAGING_D1:{prepare:()=>({first:async()=>null})}});
  assert.equal(invalid.status,503);
  assert.equal((await invalid.json()).code,"STAGING_D1_SCHEMA_MISSING");
});

test("no ingestion or paid API becomes active from this scaffold",async()=>{
  const r=await worker.fetch(incoming("/api/v1/risk-gate"),{});
  assert.equal(r.status,503);
  const payload=await r.json();
  assert.equal(payload.source_sync_active,false);
  assert.equal(payload.payment_active,false);
  assert.equal(payload.risk_gate_active,false);
});
