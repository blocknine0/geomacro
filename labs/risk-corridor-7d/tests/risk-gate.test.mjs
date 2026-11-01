import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {canonical,sha256,signEnvelope,verifyEnvelope} from "../src/crypto.mjs";
import {normalizeRequest,lockQuote,usdcAtomic} from "../src/contract.mjs";
import {executeGate} from "../src/service.mjs";
if (!globalThis.crypto) globalThis.crypto=webcrypto;
const keys=await crypto.subtle.generateKey("Ed25519",true,["sign","verify"]);
const tenant={id:"tenant-abc",status:"ACTIVE",pricing_profile:"test-tenant"};
const catalog={"test-tenant":{status:"APPROVED",version:"test-pricing-v1",corridor_pricing_approved:false,
  tiers:{BASIC:"0.15",STANDARD:"0.20",COMPLEX:"0.30"}}};
const country=iso=>({type:"country",country_iso3:iso});
const corridor=(a,b)=>({type:"corridor",origin_country_iso3:a,destination_country_iso3:b});
function input({subjects=[country("IND")],domains=["geopolitics"],tier="BASIC",scenarios=[],historical_comparison=false,id="req-00000001"}={}) {
 return {schema:"geomacro.risk-request.v1",request_id:id,tier,subjects,domains,
  policy_id:"standard-policy-v1",scenarios,historical_comparison};
}
function gro(subject,score=28) {
 return {schema_version:"gro-1.1",subject,object_id:"gro-"+subject.id,methodology_version:"fixture-only",
   generated_at:"2026-11-02T00:00:00.000Z",expires_at:"2026-11-03T00:00:00.000Z",
   verification:{status:"VERIFIED"},commercial_eligibility:{status:"VERIFIED"},
   integrity:{payload_hash:"a".repeat(64)},risk:{score},confidence:0.96,
   corridor_context:subject.type==="corridor"?{
     origin_country_iso3:subject.id.split(">")[0],destination_country_iso3:subject.id.split(">")[1]}:undefined};
}
const now=new Date("2026-11-02T05:00:00.000Z");
function ledger(){
 const map=new Map();
 return {entries:map,async claim(a){
  const key=a.tenant_id+":"+a.request_id;
  if(map.has(key)){const x=map.get(key);return x.hash!==a.request_hash?{state:"CONFLICT"}:
    x.response?{state:"REPLAY",response:x.response}:{state:"IN_PROGRESS"};}
  map.set(key,{hash:a.request_hash,response:null});return {state:"CLAIMED"};
 },async complete(a){const key=a.tenant_id+":"+a.request_id;const x=map.get(key);
  if(!x||x.hash!==a.request_hash||x.response)return false;x.response=a.response;return true;},
 async fail(a){map.delete(a.tenant_id+":"+a.request_id);}
 };
}
function deps({score=25,load=true}={}) {
 const store=ledger();let fetched=0,evaluated=0;
 const adapters={ledger:store,approvedPricing:catalog,authenticate:async()=>tenant,
  loadTrustedGro:async(s)=>{fetched++;return load?gro(s,score):null;},
  verifyGro:async(g)=>({valid:!!g,cryptographic_verified:!!g,commercial_eligible:!!g,
    verified_domains:["geopolitics","macro_fx","critical_minerals"]}),
  evaluate:async(r,g)=>{evaluated++;const decision=g.risk.score>70?"PAUSE":g.risk.score>40?"REQUIRE_APPROVAL":"CONTINUE";
    return {request_id:r.request_id,subject:g.subject,execution_authorized:false,decision,
      recommended_action:decision==="PAUSE"?"BLOCK":"ALLOW",risk:{object_id:g.object_id,score:g.risk.score,confidence:g.confidence},
      reason_codes:["fixture_only"],top_drivers:[],counterfactual:{fixture_only:true}};},
  signer:async()=>({keyId:"test-only-ed25519",privateKey:keys.privateKey})};
 return {adapters,store,getFetched:()=>fetched,getEvaluated:()=>evaluated};
}
test("tier matches scope and low/high tier requests cannot bypass price lock",()=>{
 assert.equal(normalizeRequest(input()).tier,"BASIC");
 assert.equal(normalizeRequest(input({tier:"STANDARD",domains:["geopolitics","macro_fx"]})).tier,"STANDARD");
 assert.equal(normalizeRequest(input({tier:"COMPLEX",subjects:[country("IND"),country("USA")]})).tier,"COMPLEX");
 assert.throws(()=>normalizeRequest(input({tier:"BASIC",domains:["geopolitics","macro_fx"]})),/TIER_SCOPE_MISMATCH/);
 assert.throws(()=>normalizeRequest(input({tier:"COMPLEX"})),/TIER_SCOPE_MISMATCH/);
});
test("micro-USDC is integer; corridor price is withheld by default",()=>{
 assert.equal(usdcAtomic("0.15"),"150000");assert.equal(usdcAtomic("0.30"),"300000");
 assert.throws(()=>usdcAtomic("0.0000001"),/PRICE_PRECISION_INVALID/);
 assert.equal(lockQuote(normalizeRequest(input({subjects:[corridor("CHN","IND")]})),tenant,catalog).status,"UNPRICED_CORRIDOR");
});
test("Ed25519 verdict binds pricing, decision and execution boundary against tampering",async()=>{
 const original={schema:"geomacro.risk-verdict.v1",price:"0.15",decision:"PAUSE",execution_authorized:false};
 const signed=await signEnvelope(original,{keyId:"test-key",privateKey:keys.privateKey});
 assert.equal(await verifyEnvelope(signed,async()=>keys.publicKey),true);
 assert.equal(await verifyEnvelope({...signed,price:"0.16"},async()=>keys.publicKey),false);
 assert.equal(await verifyEnvelope({...signed,execution_authorized:true},async()=>keys.publicKey),false);
 assert.equal(await verifyEnvelope(signed,async()=>null),false);
 assert.equal(await sha256(original),await sha256(JSON.parse(canonical(original))));
});
test("BASIC creates signed uncollected verdict and idempotent replay",async()=>{
 const c=deps();const first=await executeGate(input(),c.adapters,now);
 assert.equal(first.ok,true);assert.equal(first.verdict.pricing.price_atomic,"150000");
 assert.equal(first.verdict.chargeable,true);assert.equal(first.verdict.payment_collected,false);
 assert.equal(first.verdict.execution_authorized,false);
 assert.equal(await verifyEnvelope(first.verdict,async()=>keys.publicKey),true);
 const replay=await executeGate(input(),c.adapters,now);
 assert.equal(replay.idempotent_replay,true);assert.equal(c.getEvaluated(),1);
 assert.equal(replay.verdict.integrity.signature,first.verdict.integrity.signature);
});
test("STANDARD requires verified independent category coverage",async()=>{
 const c=deps();
 const request=input({domains:["geopolitics","macro_fx"],tier:"STANDARD"});
 assert.equal((await executeGate(request,c.adapters,now)).verdict.pricing.price_atomic,"200000");
 c.adapters.verifyGro=async()=>({valid:true,cryptographic_verified:true,commercial_eligible:true,verified_domains:["geopolitics"]});
 const denied=await executeGate(input({domains:["geopolitics","macro_fx"],tier:"STANDARD",id:"req-00000002"}),c.adapters,now);
 assert.equal(denied.ok,false);assert.equal(denied.chargeable,false);
});
test("COMPLEX multiple countries retains each canonical score, with conservative decision",async()=>{
 const c=deps({score:92});
 const r=await executeGate(input({tier:"COMPLEX",subjects:[country("IND"),country("USA")]}),c.adapters,now);
 assert.equal(r.ok,true);assert.equal(r.verdict.subjects.length,2);
 assert.equal(r.verdict.decision,"PAUSE");assert.equal(r.verdict.pricing.price_atomic,"300000");
 assert.equal(r.verdict.aggregation_method,"MOST_RESTRICTIVE_CANONICAL_DECISION_NO_SYNTHETIC_SCORE");
});
test("scenario/history must be independently evidenced or fail closed with no charge",async()=>{
 const c=deps();const req=input({tier:"COMPLEX",scenarios:["stress"]});
 const failed=await executeGate(req,c.adapters,now);
 assert.equal(failed.ok,false);assert.equal(failed.error,"COMPLEX_CONTEXT_UNAVAILABLE");
 assert.equal(c.store.entries.size,0);
 c.adapters.resolveComplexContext=async()=>({verified:true,context_sha256:"f".repeat(64)});
 const passing=await executeGate(req,c.adapters,now);
 assert.equal(passing.ok,true);assert.equal(passing.verdict.analysis_context.context_sha256,"f".repeat(64));
});
test("missing/stale GRO is unbillable and does not reserve a request ID",async()=>{
 const c=deps({load:false});
 const missing=await executeGate(input(),c.adapters,now);
 assert.equal(missing.ok,false);assert.equal(missing.chargeable,false);assert.equal(c.store.entries.size,0);
 c.adapters.loadTrustedGro=async(s)=>({...gro(s),expires_at:"2026-11-01T00:00:00Z"});
 const stale=await executeGate(input(),c.adapters,now);
 assert.equal(stale.ok,false);assert.equal(stale.error,"GRO_STALE_OR_EXPIRED");
 assert.equal(c.store.entries.size,0);
});
test("tenant-aware idempotency rejects modified input and isolates another tenant",async()=>{
 const c=deps();assert.equal((await executeGate(input(),c.adapters,now)).ok,true);
 const conflict=await executeGate(input({subjects:[country("USA")]}),c.adapters,now);
 assert.equal(conflict.error,"IDEMPOTENCY_CONFLICT");assert.equal(conflict.chargeable,false);
 c.adapters.authenticate=async()=>({...tenant,id:"tenant-other"});
 assert.equal((await executeGate(input(),c.adapters,now)).ok,true);
 assert.equal(c.store.entries.size,2);
});
test("CORRIDOR can produce only nonpayable advisory until pricing approval",async()=>{
 const c=deps();const r=await executeGate(input({subjects:[corridor("CHN","IND")]}),c.adapters,now);
 assert.equal(r.ok,true);assert.equal(r.verdict.chargeable,false);
 assert.equal(r.verdict.pricing.status,"UNPRICED_CORRIDOR");
});
