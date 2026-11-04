import {it as test} from "vitest";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {COUNTRIES_195} from "../lib/canonical-country-registry-195";
import {
 ingestDirectlyForRiskGate,getLatestSignedResearchGRO,
 createSignedResearchSnapshot,canonicalResearchJson,researchSha256
} from "../lib/risk-gate/stream-ingest";
import {evaluateResearchRiskGate,proxyIsolatedResearchRiskGate} from "../routes/api.research-risk-gate";
const time=new Date("2026-11-04T04:20:00.000Z");
const key=generateKeyPairSync("ed25519");
const env={
 GEOMACRO_RESEARCH_SUPABASE_URL:"https://research-contract.supabase.co",
 GEOMACRO_RESEARCH_SUPABASE_SERVICE_ROLE_KEY:"test_".repeat(18),
 GEOMACRO_RESEARCH_RISK_GATE_ENABLE:"1",
 GEOMACRO_RESEARCH_RISK_GATE_READ_TOKEN:"r".repeat(64),
 GEOMACRO_RESEARCH_SIGNING_KEY_ID:"geomacro-test-research-ed25519",
 GEOMACRO_RESEARCH_SIGNING_PRIVATE_KEY_PKCS8_B64:key.privateKey.export({
  format:"der",type:"pkcs8"}).toString("base64"),
 GEOMACRO_RESEARCH_SIGNING_PUBLIC_KEY_SPKI_B64:key.publicKey.export({
  format:"der",type:"spki"}).toString("base64")
} as unknown as NodeJS.ProcessEnv;
const event=(severity=75,overrides={})=>({
 country_code:"IND",category:"geopolitics",severity,confidence:84,
 evidence_sha256:"a".repeat(64),original_published_at:"2026-11-04T04:19:00.000Z",
 independent_originals:2,trusted_native_originals_verified:true,
 research_use_permitted:true,commercial_eligible:false,...overrides
} as const);
const state=(country_code="IND",version=1,score=56)=>({
 status:"RESEARCH_STATE_UPDATED",state_changed:true,
 country_code,version,composite_score:score,geopolitics_score:score,
 macro_score:50,critical_minerals_score:50,
 last_event_at:"2026-11-04T04:19:00.000+00:00",
 updated_at:"2026-11-04T04:20:00.000+00:00",
 last_evidence_sha256:"a".repeat(64),profile:"RESEARCH_UNVERIFIED",
});
const response=(data:unknown)=>Response.json(data,{status:200});
test("195 accepted countries and the three research lanes are a fixed universe",()=>{
 assert.equal(COUNTRIES_195.length,195);
 assert.equal(new Set(COUNTRIES_195.map(c=>c.iso3)).size,195);
 assert.deepEqual(["geopolitics","macro","critical_minerals"],[
  "geopolitics","macro","critical_minerals"]);
});
test("low-signal and old-native observations never hit Supabase or any storage",async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error("not expected");};
 const low=await ingestDirectlyForRiskGate(event(39),{env,fetchImpl,now:time});
 assert.equal(low.status,"SKIPPED_LOW_SIGNAL");
 const old=await ingestDirectlyForRiskGate(event(96,{
   original_published_at:"2026-11-03T20:19:00.000Z"
 }),{env,fetchImpl,now:time});
 assert.equal(old.status,"SKIPPED_NONCURRENT_NATIVE_TIMESTAMP");
 assert.equal(calls,0);
});
test("reject malformed/caller asserted missing trusted source, invalid country and forged native clocks",async()=>{
 for(const e of [
  event(90,{country_code:"ZZZ"}),
  event(90,{trusted_native_originals_verified:false}),
  event(90,{research_use_permitted:false}),
  event(90,{commercial_eligible:true}),
  event(90,{evidence_sha256:"not-a-sha256"})
 ]){
  await assert.rejects(()=>ingestDirectlyForRiskGate(e as any,{env,now:time}),
    /RESEARCH_UNTRUSTED_EVENT/);
 }
});
test("newly qualified high-severity original immediately persists and signs exact research state without queue",async()=>{
 let attached:any=null,calls=0;
 const fetchImpl=async(url:unknown,opts:any)=>{
  calls++;
  const target=String(url);
  assert.match(String(opts.headers.authorization),/^Bearer test_/);
  if(target.includes("/rest/v1/country_risk_state?")){
   assert.ok(attached);
   return response([{country_code:"IND",version:1,signed_version:1,
    signed_snapshot:attached.p_snapshot,
    signed_snapshot_sha256:attached.p_snapshot_sha256,
    signed_signature_b64:attached.p_signature_b64,
    signed_signing_key_id:attached.p_signing_key_id}]);
  }
  assert.ok(target.includes("/rest/v1/rpc/"));
  const payload=JSON.parse(opts.body);
  if(target.endsWith("/update_country_realtime_score")){
   assert.equal(payload.p_country_code,"IND");
   assert.equal(payload.p_category,"geopolitics");
   assert.equal(payload.p_evidence_sha256,"a".repeat(64));
   return response(state());
  }
  if(target.endsWith("/attach_country_research_signature")){
   assert.equal(payload.p_expected_version,1);
   assert.equal(payload.p_snapshot.profile,"RESEARCH_UNVERIFIED");
   assert.equal(payload.p_snapshot.execution_authorized,false);
   assert.equal(payload.p_snapshot_sha256,researchSha256(
    canonicalResearchJson(payload.p_snapshot)));
   assert.ok(payload.p_signature_b64.length>60);
   attached=payload;
   return response(true);
  }
  throw Error("unexpected route");
 };
 const out=await ingestDirectlyForRiskGate(event(),{env,now:time,fetchImpl:fetchImpl as any});
 assert.equal(out.status,"RESEARCH_SIGNED_STATE_UPDATED");
 assert.equal(out.signed,true);
 assert.equal(out.execution_authorized,false);
 assert.equal(calls,3);
 assert.equal(attached.p_snapshot.commercial_eligible,false);
 assert.match(out.snapshot_sha256,/^[a-f0-9]{64}$/);
});
test("low-medium severity writes atomic state but never manufactures signed GRO",async()=>{
 let count=0;
 const out=await ingestDirectlyForRiskGate(event(55),{
  env,now:time,fetchImpl:async()=>{count++;return response(state())}
 });
 assert.equal(count,1);
 assert.equal(out.status,"RESEARCH_STATE_UPDATED_UNSIGNED");
 assert.equal(out.signed,false);
});
test("duplicate identity from atomic RPC is never rescored or resigned",async()=>{
 let count=0;
 const out=await ingestDirectlyForRiskGate(event(),{
  env,now:time,fetchImpl:async()=>{count++;return response({
   status:"DUPLICATE_EVIDENCE",state_changed:false})}
 });
 assert.equal(out.state_changed,false);
 assert.equal(out.signed,false);
 assert.equal(count,1);
});
test("detached Ed25519 verifies only exact signed-current-version state",async()=>{
 const signed=createSignedResearchSnapshot(state(),time,env);
 const validRow={
  country_code:"IND",version:1,signed_version:1,
  signed_snapshot:signed.snapshot,signed_snapshot_sha256:signed.hash,
  signed_signature_b64:signed.signature,signed_signing_key_id:signed.keyId
 };
 const fetchImpl=async()=>response([validRow]);
 const verified=await getLatestSignedResearchGRO("IND",{env,now:time,
  fetchImpl:fetchImpl as any});
 assert.ok(verified);
 assert.equal(verified.research_sha256,signed.hash);
 for(const row of [
  {...validRow,signed_version:0},
  {...validRow,version:2},
  {...validRow,signed_snapshot:{...signed.snapshot,composite_score:99}},
  {...validRow,signed_signature_b64:"x".repeat(88)},
  {...validRow,signed_snapshot:{...signed.snapshot,commercial_eligible:true}},
 ]){
  assert.equal(await getLatestSignedResearchGRO("IND",{
   env,now:time,fetchImpl:(async()=>response([row])) as any}),null);
 }
 assert.equal(await getLatestSignedResearchGRO("IND",{env,
  now:new Date(time.getTime()+3*3600_000+1000),fetchImpl:fetchImpl as any}),null);
});
test("read-only private research risk gate replies with signed proof and never grants execution",async()=>{
 const india=createSignedResearchSnapshot(state("IND",1,66),time,env);
 const usa=createSignedResearchSnapshot(state("USA",1,73),time,env);
 const fetchImpl=async(url:unknown)=>{
  const isIndia=String(url).includes("eq.IND"),entry=isIndia?india:usa;
  return response([{
   country_code:isIndia?"IND":"USA",version:1,signed_version:1,
   signed_snapshot:entry.snapshot,signed_snapshot_sha256:entry.hash,
   signed_signature_b64:entry.signature,signed_signing_key_id:entry.keyId
  }]);
 };
 const req=new Request("https://geomacro.live/api/research-risk-gate",{
  method:"POST",headers:{authorization:"Bearer "+env.GEOMACRO_RESEARCH_RISK_GATE_READ_TOKEN,
   "content-type":"application/json"},
  body:JSON.stringify({origin_country:"IND",destination_country:"USA"})
 });
 const r=await evaluateResearchRiskGate(req,{env,now:time,fetchImpl:fetchImpl as any});
 const payload=await r.json();
 assert.equal(r.status,200);
 assert.equal(payload.decision,"REQUIRE_APPROVAL");
 assert.equal(payload.execution_authorized,false);
 assert.equal(payload.commercial_eligible,false);
 assert.equal(payload.proof.origin_signature,india.signature);
 assert.equal(payload.proof.dest_signature,usa.signature);
});
test("research endpoint fails closed for absent secrets, absent signatures or invalid bearer",async()=>{
 const input=JSON.stringify({origin_country:"IND",destination_country:"USA"});
 for(const auth of ["","Bearer invalid"]){
  const req=new Request("https://geomacro.live/api/research-risk-gate",{
   method:"POST",headers:{authorization:auth,"content-type":"application/json"},
   body:input
  });
  const res=await evaluateResearchRiskGate(req,{env,now:time});
  assert.equal(res.status,401);
  assert.equal((await res.json()).decision,"PAUSE");
 }
 const req=new Request("https://geomacro.live/api/research-risk-gate",{
  method:"POST",headers:{authorization:"Bearer "+env.GEOMACRO_RESEARCH_RISK_GATE_READ_TOKEN,
   "content-type":"application/json"},body:input
 });
 const res=await evaluateResearchRiskGate(req,{env,now:time,
  fetchImpl:(async()=>response([])) as any});
 assert.equal(res.status,503);
 assert.equal((await res.json()).execution_authorized,false);
});


test("production host without secrets transparently forwards ONLY authenticated private Edge research requests",async()=>{
 let count=0;
 const bearer="a".repeat(64),input=JSON.stringify({
  origin_country:"UKR",destination_country:"USA",policy_threshold:70
 });
 const req=new Request("https://geomacro.live/api/research-risk-gate",{
  method:"POST",headers:{authorization:"Bearer "+bearer,
   "content-type":"application/json"},body:input
 });
 const res=await evaluateResearchRiskGate(req,{env:{} as NodeJS.ProcessEnv,
  fetchImpl:(async(url:unknown,opts:any)=>{
   count++;
   assert.equal(String(url),
    "https://ymjuwuvbialsevfawvvq.supabase.co/functions/v1/gm-research-risk-gate");
   assert.equal(opts.headers.Authorization,"Bearer "+bearer);
   assert.equal(opts.body,input);
   return Response.json({schema:"geomacro.research-corridor-gate.v1",
    ok:false,decision:"PAUSE",reason:"VERIFIED_SIGNED_RESEARCH_STATE_UNAVAILABLE",
    execution_authorized:false,commercial_eligible:false,research_only:true
   },{status:503});
  }) as any});
 assert.equal(count,1);assert.equal(res.status,503);
 assert.equal((await res.json()).decision,"PAUSE");
 assert.equal(res.headers.get("cache-control"),"private, no-store");
});
test("explicit research-off switch and absent bearer never access the remote native gate",async()=>{
 let calls=0;
 const fetchImpl=(async()=>{calls++;throw Error("SHOULD_NOT_CALL")}) as any;
 for(const auth of ["","Bearer invalid"]){
  const r=await proxyIsolatedResearchRiskGate(new Request(
   "https://geomacro.live/api/research-risk-gate",{
    method:"POST",headers:{authorization:auth,"content-type":"application/json"},
    body:JSON.stringify({origin_country:"UKR",destination_country:"USA"})}),fetchImpl);
  assert.equal(r.status,401);
 }
 const r=await evaluateResearchRiskGate(new Request(
  "https://geomacro.live/api/research-risk-gate",{
   method:"POST",headers:{authorization:"Bearer "+"a".repeat(64),
    "content-type":"application/json"},body:"{}"
  }),{env:{GEOMACRO_RESEARCH_RISK_GATE_ENABLE:"0"} as NodeJS.ProcessEnv,
     fetchImpl});
 assert.equal(r.status,503);assert.equal(calls,0);
});
test("native proxy fails closed on corrupted research response or forged execution grant",async()=>{
 const req=()=>new Request("https://geomacro.live/api/research-risk-gate",{
  method:"POST",headers:{authorization:"Bearer "+"f".repeat(64),
   "content-type":"application/json"},
  body:JSON.stringify({origin_country:"UKR",destination_country:"USA"})
 });
 for(const bad of [
  {schema:"geomacro.research-corridor-gate.v1",ok:true,
   decision:"CONTINUE",verification_status:"PROVISIONAL_RESEARCH_ONLY",
   execution_authorized:true,commercial_eligible:false,research_only:true},
  {schema:"geomacro.research-corridor-gate.v1",ok:true,
   decision:"CONTINUE",verification_status:"UNVERIFIED",
   execution_authorized:false,commercial_eligible:false,research_only:true}
 ]){
  const out=await proxyIsolatedResearchRiskGate(req(),
    (async()=>Response.json(bad,{status:200})) as any);
  assert.equal(out.status,503);
  assert.equal((await out.json()).decision,"PAUSE");
 }
});


test("production enable=1 still routes a dedicated 256-bit Vault read token via isolated Edge",async()=>{
 let called=0;
 const token="a".repeat(64);
 const req=new Request("https://geomacro.live/api/research-risk-gate",{
  method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},
  body:JSON.stringify({origin_country:"UKR",destination_country:"USA"})
 });
 const remoteFetch=(async(url:unknown,opts:any)=>{
  called++;assert.equal(String(url),
   "https://ymjuwuvbialsevfawvvq.supabase.co/functions/v1/gm-research-risk-gate");
  assert.equal(opts.headers.Authorization,"Bearer "+token);
  return Response.json({
   schema:"geomacro.research-corridor-gate.v1",ok:false,decision:"PAUSE",
   reason:"VERIFIED_SIGNED_RESEARCH_STATE_UNAVAILABLE",
   research_only:true,execution_authorized:false,commercial_eligible:false
  },{status:503});
 }) as any;
 const result=await evaluateResearchRiskGate(req,{
  env:{GEOMACRO_RESEARCH_RISK_GATE_ENABLE:"1"} as NodeJS.ProcessEnv,
  fetchImpl:remoteFetch
 });
 assert.equal(result.status,503);
 assert.equal((await result.json()).reason,
  "VERIFIED_SIGNED_RESEARCH_STATE_UNAVAILABLE");
 assert.equal(called,1);
});
test("research relay diagnostics remain nonsecret and fail closed on transport, unexpected status and invalid JSON",async()=>{
 const req=()=>new Request("https://geomacro.live/api/research-risk-gate",{
  method:"POST",headers:{authorization:"Bearer "+"e".repeat(64),
   "content-type":"application/json"},body:"{}"
 });
 const {proxyIsolatedResearchRiskGate}=await import("../routes/api.research-risk-gate");
 for(const [remote,reason] of [
  [async()=>{throw Error("private network failed")},
   "RESEARCH_EDGE_RELAY_TRANSPORT_UNAVAILABLE"],
  [async()=>Response.json({message:"gateway failure"},{status:502}),
   "RESEARCH_EDGE_RELAY_UPSTREAM_STATUS"],
  [async()=>new Response("<html>not found</html>",{status:503}),
   "RESEARCH_EDGE_RELAY_INVALID_JSON"],
 ] as const){
  const output=await proxyIsolatedResearchRiskGate(req(),remote as any);
  assert.equal(output.status,503);
  const data=await output.json();
  assert.equal(data.reason,reason);
  assert.equal(data.execution_authorized,false);
  assert.equal(data.commercial_eligible,false);
  assert.equal(JSON.stringify(data).includes("private network failed"),false);
 }
});
