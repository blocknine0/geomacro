import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {attestRiskStreamOriginal} from "../../workers/control-plane/src/risk-stream-attester-bridge.mjs";

test("control-plane bridge calls each private service binding with its own bearer and returns both proofs",async()=>{
 const calls=[];
 const candidate={schema:"geomacro.risk-stream-candidate.v1",kind:"VERIFIED_ORIGINAL",proof:null};
 const signature=Buffer.alloc(64).toString("base64");
 const binding=(name,field)=>({async fetch(request){
  const body=await request.json();
  calls.push({name,authorization:request.headers.get("authorization"),body});
  return Response.json({ok:true,proof:{[field]:signature}});
 }});
 const request=new Request("https://control.internal/v1/internal/risk-stream/attest",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({schema:"geomacro.risk-stream-attestation-request.v1",draft:candidate})
 });
 const response=await attestRiskStreamOriginal(request,{
  RISK_STREAM_FACTS_ATTESTER:binding("facts","facts_signature_b64"),
  RISK_STREAM_RIGHTS_ATTESTER:binding("rights","rights_signature_b64"),
  RISK_STREAM_FACTS_ATTESTER_BEARER_TOKEN:"facts-bearer-test-token-0123456789",
  RISK_STREAM_RIGHTS_ATTESTER_BEARER_TOKEN:"rights-bearer-test-token-0123456789"
 });
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).proof,{
  facts_signature_b64:signature,rights_signature_b64:signature
 });
 assert.deepEqual(calls.map(call=>call.name).sort(),["facts","rights"]);
 assert.notEqual(calls[0].authorization,calls[1].authorization);
 assert.ok(calls.every(call=>call.body.proof===null&&call.body.raw_payload===undefined));
});

test("enabled internal corroboration reads only bounded private features and signs a redacted context",async()=>{
 const calls=[],signature=Buffer.alloc(64).toString("base64");
 const item={schema:"geomacro.reusable-news-json.v1",id:"news-"+"a".repeat(64),
  id_is_cryptographic_proof:false,category:"geopolitics",country_iso3:"USA",
  source:{publisher_name:null,original_url:null,original_published_at:new Date(Date.now()-60000).toISOString()},
  facts:{event_types:["sanctions"],action_terms:["sanctions"],named_organizations:[],
   numeric_mentions:[],fact_extraction_status:"MACHINE_EXTRACTED_UNVERIFIED"},
  usage_rights:{declared_source_license:"unknown",declaration_is_verified:false,
   article_specific_permission_verified:false,commercial_reuse_authorized:false,
   attribution_and_scope_review_required:true,factual_analysis_only:true},
  verification:{original_page_verified:false,independent_event_verified:false,
   facts_reviewed:false,source_licence_verified:false},
  delivery:{raw_article_included:false,raw_headline_included:false,
   downstream_paid_product_authorized:false,signing_authorized:false,user_submission_persisted:false}};
 const binding=(name,field)=>({async fetch(request){
  const body=await request.json();calls.push({name,body});
  return Response.json({ok:true,proof:{[field]:signature}});
 }});
 const draft={schema:"geomacro.risk-stream-candidate.v1",kind:"VERIFIED_ORIGINAL",
  country_iso3:"USA",category:"GEOPOLITICS",derived:{what:"Verified sanctions action"},proof:null};
 const makeRequest=()=>new Request("https://control.internal/v1/internal/risk-stream/attest",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({schema:"geomacro.risk-stream-attestation-request.v1",draft})});
 const env={RISK_STREAM_PRIVATE_OSINT_CORROBORATION_ENABLED:"1",
  RISK_STREAM_FACTS_ATTESTER:binding("facts","facts_signature_b64"),
  RISK_STREAM_RIGHTS_ATTESTER:binding("rights","rights_signature_b64"),
  RISK_STREAM_FACTS_ATTESTER_BEARER_TOKEN:"facts-bearer-test-token-0123456789",
  RISK_STREAM_RIGHTS_ATTESTER_BEARER_TOKEN:"rights-bearer-test-token-0123456789",
  DB:{prepare(sql){return {bind(...args){
   assert.equal(args[0],"USA");assert.equal(args[1],"geopolitics");return this;
  },all:async()=>sql.includes("private_osint_news_25h")?
   ({results:[{projection_json:JSON.stringify(item)}]}):({results:[]})}}}};
 const response=await attestRiskStreamOriginal(makeRequest(),env);
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.risk_context.origin_kind,"PRIVATE_OSINT");
 assert.equal(body.risk_context.event_code,"SANCTIONS");
 assert.equal(body.risk_context.raw_source_redacted,true);
 assert.ok(calls.every(call=>call.body.risk_context.event_code==="SANCTIONS"));
 assert.doesNotMatch(JSON.stringify({body,calls}),/publisher\.name|headline|private title|https?:\/\//iu);
 draft.derived.what="Verified inflation update";
 const unrelated=await attestRiskStreamOriginal(makeRequest(),env);
 assert.equal((await unrelated.json()).risk_context,null,
  "country/category-only overlap must not qualify unrelated private context");
});

test("Telegram watch metadata never enters GRO corroboration or tier context",async()=>{
 const signature=Buffer.alloc(64).toString("base64");
 const binding=field=>({async fetch(){return Response.json({ok:true,proof:{[field]:signature}})}});
 const draft={schema:"geomacro.risk-stream-candidate.v1",kind:"VERIFIED_ORIGINAL",
  country_iso3:"USA",category:"GEOPOLITICS",derived:{what:"Sanctions action"},proof:null};
 const env={RISK_STREAM_PRIVATE_OSINT_CORROBORATION_ENABLED:"1",
  RISK_STREAM_FACTS_ATTESTER:binding("facts_signature_b64"),
  RISK_STREAM_RIGHTS_ATTESTER:binding("rights_signature_b64"),
  RISK_STREAM_FACTS_ATTESTER_BEARER_TOKEN:"facts-bearer-test-token-0123456789",
  RISK_STREAM_RIGHTS_ATTESTER_BEARER_TOKEN:"rights-bearer-test-token-0123456789",
  DB:{prepare(sql){return {bind(){return this},all:async()=>({results:
   sql.includes("telegram_research_json")?[{watch_event:"sanctions"}]:[]})}}}};
 const response=await attestRiskStreamOriginal(new Request("https://control.internal/v1/internal/risk-stream/attest",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({schema:"geomacro.risk-stream-attestation-request.v1",draft})}),env);
 const body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.risk_context,null);
 assert.doesNotMatch(JSON.stringify(body),/TELEGRAM_WATCH|SANCTIONS/u);
 assert.doesNotMatch(JSON.stringify(body),/headline|channel_name|https?:\/\//iu);
});

test("bridge preserves a safe labeled attester refusal code and its client status",async()=>{
 const candidate={schema:"geomacro.risk-stream-candidate.v1",kind:"VERIFIED_ORIGINAL",proof:null};
 const signature=Buffer.alloc(64).toString("base64");
 const makeRequest=()=>new Request("https://control.internal/v1/internal/risk-stream/attest",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({schema:"geomacro.risk-stream-attestation-request.v1",draft:candidate})
 });
 const cases=[
  {label:"FACTS",status:400,error:"FACTS_CANDIDATE_INVALID",expectedStatus:400},
  {label:"RIGHTS",status:401,error:"RIGHTS_BEARER_REJECTED",expectedStatus:401},
  {label:"FACTS",status:403,error:"FACTS_POLICY_DENIED",expectedStatus:403},
  {label:"RIGHTS",status:413,error:"RIGHTS_REQUEST_TOO_LARGE",expectedStatus:413},
  {label:"FACTS",status:500,error:"FACTS_ATTESTER_FAILURE",expectedStatus:503},
  {label:"RIGHTS",status:502,error:"lowercase provider detail",expectedStatus:503},
  {label:"FACTS",status:503,error:null,expectedStatus:503}
 ];
 for(const refusal of cases){
  const binding=(label,field)=>({async fetch(){
   if(refusal.label===label){
    if(refusal.error===null)return new Response("unavailable",{status:refusal.status});
    return Response.json({error:refusal.error},{status:refusal.status});
   }
   return Response.json({ok:true,proof:{[field]:signature}});
  }});
  const response=await attestRiskStreamOriginal(makeRequest(),{
   RISK_STREAM_FACTS_ATTESTER:binding("FACTS","facts_signature_b64"),
   RISK_STREAM_RIGHTS_ATTESTER:binding("RIGHTS","rights_signature_b64"),
   RISK_STREAM_FACTS_ATTESTER_BEARER_TOKEN:"facts-bearer-test-token-0123456789",
   RISK_STREAM_RIGHTS_ATTESTER_BEARER_TOKEN:"rights-bearer-test-token-0123456789"
  });
  const suffix=refusal.error&&/^[A-Z0-9_]{1,64}$/u.test(refusal.error)?"_"+refusal.error:"";
  assert.equal(response.status,refusal.expectedStatus);
  assert.deepEqual(await response.json(),{ok:false,
   error:"ATTESTER_REFUSED_"+refusal.label+"_"+refusal.status+suffix});
 }
});

test("bridge refuses missing bindings, invalid request, or malformed signatures",async()=>{
 const candidate={schema:"geomacro.risk-stream-candidate.v1",kind:"VERIFIED_ORIGINAL",proof:null};
 const makeRequest=draft=>new Request("https://control.internal/v1/internal/risk-stream/attest",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({schema:"geomacro.risk-stream-attestation-request.v1",draft})
 });
 const absent=await attestRiskStreamOriginal(makeRequest(candidate),{});
 assert.equal(absent.status,503);
 const malformed=await attestRiskStreamOriginal(makeRequest({...candidate,proof:{}}),{});
 assert.equal(malformed.status,400);
 const forgedContext=await attestRiskStreamOriginal(makeRequest({...candidate,
  risk_context:{schema:"geomacro.risk-stream-internal-corroboration.v1",
   country_iso3:"USA",category:"GEOPOLITICS",event_code:"SANCTIONS",
   severity_weight_0_100:100,corroboration_weight_0_1:1,origin_kind:"TELEGRAM_WATCH",
   corridors:[],raw_source_redacted:true}}),{});
 assert.equal(forgedContext.status,400);
 const badSignature=await attestRiskStreamOriginal(makeRequest(candidate),{
  RISK_STREAM_FACTS_ATTESTER:{fetch:async()=>Response.json({ok:true,
   proof:{facts_signature_b64:"bad"}})},
  RISK_STREAM_RIGHTS_ATTESTER:{fetch:async()=>Response.json({ok:true,
   proof:{rights_signature_b64:Buffer.alloc(64).toString("base64")}})},
  RISK_STREAM_FACTS_ATTESTER_BEARER_TOKEN:"facts-bearer-test-token-0123456789",
  RISK_STREAM_RIGHTS_ATTESTER_BEARER_TOKEN:"rights-bearer-test-token-0123456789"
 });
 assert.equal(badSignature.status,502);
});

test("deployed attesters remain private and control-plane bindings target both distinct workers",()=>{
 const facts=JSON.parse(readFileSync(new URL("../../workers/risk-stream-facts-attester/wrangler.jsonc",import.meta.url),"utf8"));
 const rights=JSON.parse(readFileSync(new URL("../../workers/risk-stream-rights-attester/wrangler.jsonc",import.meta.url),"utf8"));
 const control=JSON.parse(readFileSync(new URL("../../workers/control-plane/wrangler.example.jsonc",import.meta.url),"utf8"));
 assert.notEqual(facts.name,rights.name);
 for(const config of [facts,rights]){
  assert.equal(config.workers_dev,false);
  assert.equal(config.preview_urls,false);
  assert.equal(config.routes,undefined);
 }
 const services=new Map(control.services.map(item=>[item.binding,item.service]));
 assert.equal(services.get("RISK_STREAM_FACTS_ATTESTER"),facts.name);
 assert.equal(services.get("RISK_STREAM_RIGHTS_ATTESTER"),rights.name);
 assert.notEqual(services.get("RISK_STREAM_FACTS_ATTESTER"),
  services.get("RISK_STREAM_RIGHTS_ATTESTER"));
});
