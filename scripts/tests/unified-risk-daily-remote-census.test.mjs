import test from "node:test";
import assert from "node:assert/strict";
import {CANONICAL_UNIFIED_TARGETS,verifyUnifiedRiskDailyRemoteCensus}
  from "../../workers/control-plane/src/unified-risk-gate.mjs";

const DAY="2026-11-03";
const local=CANONICAL_UNIFIED_TARGETS.map((x,i)=>({
  entity_type:x.type,entity_id:x.id,
  content_sha256:i.toString(16).padStart(64,"0"),
  supabase_synced_at:DAY+"T18:00:00Z",
}));
const cfg={
  RISK_GATE_SUPABASE_ACCEPTANCE:"ACCEPTED_PRIVATE_RISK_GATE_DAILY",
  RISK_GATE_SUPABASE_URL:"https://receipt-test.supabase.co",
  RISK_GATE_SUPABASE_SERVICE_ROLE_KEY:"unit-test-key-not-production-secret-32characters"
};
function env(rows){
 return {...cfg,DB:{prepare(sql){
  assert.match(sql,/FROM unified_risk_snapshots/);
  return {bind(day){
   assert.equal(day,DAY);
   return {all:async()=>({results:rows})};
  }};
 }}};
}
test("fresh exact 207 canonical D1+Supabase hash readback; optional TWN excluded",async()=>{
 let calls=0;
 const fetcher=async(url,request)=>{
  calls++;
  assert.match(url,/day_utc=eq.2026-11-03/);
  assert.match(url,/limit=210/);
  assert.equal(request.method,"GET");
  assert.ok(request.headers.Authorization?.startsWith("Bearer "));
  return Response.json([...local.map(({entity_type,entity_id,content_sha256})=>({entity_type,entity_id,content_sha256})),
   {entity_type:"COUNTRY",entity_id:"TWN",content_sha256:"f".repeat(64)}]);
 };
 const r=await verifyUnifiedRiskDailyRemoteCensus(env(local),DAY,{fetcher});
 assert.equal(r.ok,true);
 assert.equal(r.remote_count,207);
 assert.equal(r.remote_hash_matches,207);
 assert.equal(calls,1);
});
test("remote row loss or digest mismatch never passes acceptance",async()=>{
 const fetcher=async()=>Response.json(local.slice(0,-1).map(({entity_type,entity_id,content_sha256})=>({entity_type,entity_id,content_sha256})));
 const missing=await verifyUnifiedRiskDailyRemoteCensus(env(local),DAY,{fetcher});
 assert.equal(missing.ok,false);
 assert.equal(missing.error,"UNIFIED_CENSUS_REMOTE_HASH_MISMATCH");
 const changed=local.map(({entity_type,entity_id,content_sha256})=>({entity_type,entity_id,content_sha256}));
 changed[12].content_sha256="f".repeat(64);
 const mismatch=await verifyUnifiedRiskDailyRemoteCensus(env(local),DAY,{fetcher:async()=>Response.json(changed)});
 assert.equal(mismatch.ok,false);
 assert.equal(mismatch.error,"UNIFIED_CENSUS_REMOTE_HASH_MISMATCH");
});
test("local missing snapshot or not-yet-synced flag blocks remote lookup",async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;return Response.json([])};
 for(const rows of [local.slice(1),local.map((x,i)=>i===1?{...x,supabase_synced_at:null}:x)]){
  const result=await verifyUnifiedRiskDailyRemoteCensus(env(rows),DAY,{fetcher});
  assert.equal(result.ok,false);
  assert.equal(result.error,"UNIFIED_CENSUS_LOCAL_INCOMPLETE");
 }
 assert.equal(calls,0);
});
test("remote HTTP or malformed readback fails closed",async()=>{
 const r=await verifyUnifiedRiskDailyRemoteCensus(env(local),DAY,{
   fetcher:async()=>new Response("upstream failure",{status:503})});
 assert.equal(r.ok,false);
 assert.equal(r.error,"UNIFIED_CENSUS_REMOTE_READBACK_UNAVAILABLE");
});
