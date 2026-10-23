import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../ops/verify-live-structured-no-funds.mjs",import.meta.url),"utf8")
  .replace(/^#![^\n]*\n/u,"");
const run=new (Object.getPrototypeOf(async function(){}).constructor)(
  "fetch","process","console","Response","AbortSignal",source);

for(const ready of [false,true])test(`collect every route after health ready=${ready}`,async()=>{
  const calls=[],logs=[],state={};
  const fetcher=async(url,init)=>{
    calls.push({url,init});
    if(url.includes("/api/health"))return Response.json({
      schema:"geomacro.product-scoped-deep-health.v1",ok:ready,
      x402_payment_authorized:false,fresh_signed_snapshot_readiness_attested:false,
      legacy_signed_intelligence_gri_risk_indices:"NOT_EVALUATED_IN_THIS_PROFILE",
      new_intelligence_durable_storage_required:false,
      categories:Object.fromEntries(["geopolitics","macro-fx","critical-minerals"]
        .map(category=>[category,{source_fetch_accepted:ready||category!=="critical-minerals"}])),
    },{status:ready?200:503});
    if(init.method==="GET")return Response.json({
      schema:"geomacro.live-structured-discovery.v1",x402_enabled:false,
      durable_storage_required:false,
    });
    return Response.json({schema:"geomacro.live-structured.v1",status:"LIVE_SOURCE_FETCHED",
      chargeable:false,payment_required:false,durable_storage_written:false,
      signature:null,score:null,observations:[{finding:"Derived observation"}]});
  };
  await run(fetcher,state,{log:text=>logs.push(JSON.parse(text))},Response,AbortSignal);
  assert.equal(calls.length,7);
  assert.equal(calls.filter(x=>x.init.method==="POST").length,5);
  const result=logs.at(-1);
  assert.equal(result.checked,5);
  assert.equal(result.passed,5);
  assert.equal(result.accepted,ready);
  assert.equal(result.product_scoped_health_ready,ready);
  assert.equal(state.exitCode,ready?undefined:2);
  assert.equal(result.payment_attempts,0);
});
