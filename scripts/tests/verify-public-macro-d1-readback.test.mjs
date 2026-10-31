import test from "node:test";
import assert from "node:assert/strict";
import {assessMacroPublicSnapshot,readMacroPublicSnapshot} from "../ops/verify-public-macro-d1-readback.mjs";
const now=Date.parse("2026-11-01T10:00:00.000Z");
const iso=new Date(now-60_000).toISOString();
const sample=()=>({schema:"geomacro.macro-fastlane-public.v1",category:"macro",
 fx_reference:{provider:"ECB_DAILY_REFERENCE",base:"EUR",
  reference_date:"2026-10-30",intraday_live_verified:false,transaction_price:false,
  rates:[{currency:"USD",per_eur:1.2},{currency:"GBP",per_eur:0.9},{currency:"JPY",per_eur:155}]},
 prices:["XAU","XAG"].map((symbol,i)=>({
  instrument:symbol+"/USD",currency:"USD",unit:"troy_ounce",
  value:4000+i,observed_at:iso,quote_kind:"provider_spot_indication",
  exchange_tick_verified:false,provider_latency_verified:false}))});
test("Source-dated ECB and two fresh metals prove independent D1 readback, not executable tick",()=>{
 const result=assessMacroPublicSnapshot(sample(),now);
 assert.equal(result.complete,true);
 assert.equal(result.d1_public_projection_received,true);
 assert.equal(result.ecb_reference,"SOURCE_DATED_D1_READBACK");
 assert.equal(result.metals.XAU,"SOURCE_DATED_D1_READBACK");
 assert.equal(result.verified_live_fx_quote,false);
 assert.equal(result.verified_exchange_tick,false);
});
test("Malformed, old or future issuer observations cannot become success",()=>{
 const invalid=sample();invalid.fx_reference.reference_date="2026-09-20";
 assert.equal(assessMacroPublicSnapshot(invalid,now).complete,false);
 const st=sample();st.prices[0].observed_at="2026-10-30T08:00:00.000Z";
 assert.equal(assessMacroPublicSnapshot(st,now).metals.XAU,"NOT_OBSERVED");
 const future=sample();future.prices[1].observed_at=new Date(now+30000).toISOString();
 assert.equal(assessMacroPublicSnapshot(future,now).metals.XAG,"NOT_OBSERVED");
 const untrusted=sample();untrusted.prices[0].exchange_tick_verified=true;
 assert.equal(assessMacroPublicSnapshot(untrusted,now).complete,false);
 assert.equal(assessMacroPublicSnapshot({schema:"wrong"},now).d1_public_projection_received,false);
});
test("Unreachable public control plane yields explicit negative receipt and one GET maximum",async()=>{
 const transport=await readMacroPublicSnapshot({now,fetchImpl:async()=>{throw Error("DNS");}});
 assert.equal(transport.reason,"PUBLIC_MACRO_TRANSPORT_UNAVAILABLE");
 let requests=0;
 const out=await readMacroPublicSnapshot({now,fetchImpl:async()=>{requests++;
  return new Response(JSON.stringify(sample()),{status:200});
 }});
 assert.equal(requests,1);
 assert.equal(out.complete,true);
});
