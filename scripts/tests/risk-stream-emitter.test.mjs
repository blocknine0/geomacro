import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign,createHash} from "node:crypto";
import {emitRiskStreamCandidates} from "../ops/emit-risk-stream-candidates.mjs";
import {riskStreamOriginalClaims} from "../../workers/control-plane/src/risk-stream-pipeline.mjs";
import {normalizeRiskStreamInternalCorroboration} from "../../workers/control-plane/src/risk-stream-internal-corroboration.mjs";

const now=Date.parse("2026-11-14T12:00:00.000Z");
const rightsManifest={schema:"geomacro.risk-stream-source-rights-reviewed.v1",entries:[
 ["wire_primary","wire.test","wire_parent","GOVERNMENT_WIRE"],
 ["regional_primary","regional.test","regional_parent","INDEPENDENT_REGIONAL"]
].map(([source_id,publisher_root_domain,parent_media_entity,source_role])=>({
 source_id,publisher_root_domain,parent_media_entity,source_role,categories:["GEOPOLITICS"],
 status:"APPROVED",rights_expire_at:"2027-10-01",
 rights_evidence:{licence_url:"https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  terms_url:"https://www.gov.uk/help/terms-conditions",reviewed_at:"2026-10-01T00:00:00.000Z",
  reviewer:"owner-reviewer",notes:"Reviewed legal terms for derived use."}
}))};
const sourceRegistry=rightsManifest.entries.map(entry=>({...entry,enabled:1,commercial_rights_approved:1}));
const originals=rightsManifest.entries.map((source,index)=>({category:"GEOPOLITICS",country_iso3:"USA",
 event_identity:{country_iso3:"USA",event_type:"sanctions_policy",actor_id:"us_treasury",
  target_id:"foreign_bank",location_id:"washington_dc",occurred_at:"2026-11-14T10:00:00.000Z"},
 feed_origin:"RSS",source_id:source.source_id,source_role:source.source_role,
 publisher_root_domain:source.publisher_root_domain,parent_media_entity:source.parent_media_entity,
 source_url:"https://"+source.publisher_root_domain+"/item",
 published_at:"2026-11-14T11:"+(index?"05":"00")+":00.000Z",
 raw_payload:"Original private fixture factual record from source "+source.source_id+
  ". Open Government Licence v3 https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
 item_license_evidence:{license_id:"UK_OGL_V3",license_url:"https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  terms_url:"https://www.gov.uk/help/terms-conditions",item_url:"https://"+source.publisher_root_domain+"/item",
  item_license_marker:"Open Government Licence v3",publisher_owned_content_only:true,
  third_party_exceptions:false,non_commercial:false,restricted_material:false,
  factual_record_only:true,original_text_republished:false},
 derived:{what:"A measure was announced.",why:"It affects an institution.",
  market:"Market access could tighten.",watch:"Watch official implementation."},
 reporting_position:"confirms"}));
const makeDistinctOriginals=count=>Array.from({length:count},(_,index)=>({...originals[0],
 event_identity:{...originals[0].event_identity,target_id:`foreign_bank_${index}`,
  location_id:`washington_dc_${index}`},raw_payload:originals[0].raw_payload+` Event record ${index}.`}));

test("dry run validates pair and makes no HTTP request",async()=>{
 let calls=0;
 const originalsWithPrivate=[{...originals[0],risk_context:normalizeRiskStreamInternalCorroboration({
  source_kind:"PRIVATE_OSINT",country_iso3:"USA",category:"GEOPOLITICS",
  text:"Sanctions watch, private headline and URL https://osint.invalid/secret",
  severity_weight:61,corroboration_weight:.55,corridors:["USA>IND"]})},originals[1]];
 const result=await emitRiskStreamCandidates({originals:originalsWithPrivate,sourceRegistry,rightsManifest,now,
  fetchImpl:async()=>{calls++;throw Error("unexpected")}});
 assert.equal(result.status,"DRY_RUN");
 assert.equal(result.candidate_count,2);
 assert.equal(calls,0);
});

test("one current rights-approved original is emitted as a Basic-only candidate before a second wire arrives",async()=>{
 const [single]=originals.map((value,index)=>({...value,
  event_identity:{...value.event_identity,actor_id:"us_treasury"},
  published_at:"2026-11-14T11:00:00.000Z"})).slice(0,1);
 const result=await emitRiskStreamCandidates({originals:[single],sourceRegistry,
  rightsManifest,now,dryRun:true});
 assert.equal(result.status,"DRY_RUN");
 assert.equal(result.candidate_count,1);
 assert.equal(result.paired_events,0);
});

test("item-level noncommercial and third-party exceptions are skipped before either attester",async()=>{
 const blocked=[
  {...originals[0],item_license_evidence:{...originals[0].item_license_evidence,
   non_commercial:true}},
  {...originals[1],item_license_evidence:{...originals[1].item_license_evidence,
   third_party_exceptions:true}}
 ];
 let calls=0;
 const result=await emitRiskStreamCandidates({originals:[...originals,...blocked],
  sourceRegistry,rightsManifest,now,dryRun:true,
  factsPublicB64:"",rightsPublicB64:"",fetchImpl:async()=>{calls++;throw Error("unexpected")}});
 assert.equal(result.status,"DRY_RUN");
 assert.equal(result.candidate_count,2);
 assert.equal(result.item_license_skipped,2);
 assert.equal(calls,0);
});

test("a batch containing only excluded items stops without attestation or D1",async()=>{
 let calls=0;
 const result=await emitRiskStreamCandidates({originals:[
  {...originals[0],item_license_evidence:{...originals[0].item_license_evidence,
   non_commercial:true}}
 ],sourceRegistry,rightsManifest,now,dryRun:false,
  controlPlaneUrl:"https://control.invalid",controlPlaneToken:"root-test-token",
  fetchImpl:async()=>{calls++;throw Error("unexpected")}});
 assert.equal(result.status,"NO_ELIGIBLE_ITEMS");
 assert.equal(result.item_license_skipped,1);
 assert.equal(result.posted_items,0);
 assert.equal(calls,0);
});

test("collector does not spend attestations or retry a held Control Plane runtime",async()=>{
 const calls=[];
 await assert.rejects(emitRiskStreamCandidates({originals:[originals[0]],sourceRegistry,
  rightsManifest,now,dryRun:false,controlPlaneUrl:"https://control.invalid",
  controlPlaneToken:"root-test-token",fetchImpl:async(url)=>{
   calls.push(new URL(url).pathname);
   return {ok:true,status:200,json:async()=>({ok:true,
    schema:"geomacro.risk-stream-runtime-status.v1",ready:false,
    research_flags:{active:false,ingestion_enabled:false,production_mode:false,
     hot50_research_enabled:false},queue_binding_present:false,
    d1_binding_present:false,auth_configured:false})};
  }}),/CONTROL_PLANE_RUNTIME_NOT_READY_ACTIVE_INGESTION_MODE_RESEARCH_QUEUE_D1_AUTH/u);
 assert.deepEqual(calls,["/v1/internal/risk-stream/runtime"]);
});

test("send mode checks live runtime, obtains genuine signatures, gets Queue ACK and D1 receipt",async()=>{
 const facts=generateKeyPairSync("ed25519"),rights=generateKeyPairSync("ed25519");
 const paths=[],batches=[],delays=[];let throttled=false,readbackAttempts=0;
 const fetchImpl=async(url,options)=>{
  const path=new URL(url).pathname;paths.push(path);
  assert.equal(options.redirect,"error");
  if(path==="/v1/internal/risk-stream/runtime")return {ok:true,status:200,
   json:async()=>({ok:true,schema:"geomacro.risk-stream-runtime-status.v1",
    ready:true,deployed_source_sha:"a".repeat(40)})};
  if(new URL(url).pathname==="/v1/internal/risk-stream/attest"){
   assert.equal(options.headers.Authorization,"Bearer root-test-token");
   if(!throttled){throttled=true;return {ok:false,status:429,
    headers:{get:name=>name==="retry-after"?"2":null}}}
   const body=JSON.parse(options.body);
   assert.equal(body.schema,"geomacro.risk-stream-attestation-request.v1");
   assert.equal(body.draft.kind,"VERIFIED_ORIGINAL");
   const claim=riskStreamOriginalClaims(body.draft);
   return {ok:true,status:200,json:async()=>({proof:{
    facts_signature_b64:sign(null,Buffer.from("geomacro.machine-original-facts.v1\n"+claim),facts.privateKey).toString("base64"),
    rights_signature_b64:sign(null,Buffer.from("geomacro.machine-commercial-rights.v1\n"+claim),rights.privateKey).toString("base64")
   }})};
  }
  assert.equal(options.headers.Authorization,"Bearer root-test-token");
  if(path==="/v1/internal/risk-stream/events"){
   const body=JSON.parse(options.body);batches.push(body);
   return {ok:true,status:202,json:async()=>({ok:true,accepted:body.items.length,commercial_delivery:false})};
  }
  assert.equal(path,"/v1/internal/risk-stream/readback");
  const request=JSON.parse(options.body);
  const ids=batches.flatMap(batch=>batch.items).map(item=>
   createHash("sha256").update(riskStreamOriginalClaims(item)).digest("hex"));
  assert.deepEqual(request.observation_ids,ids);
  readbackAttempts++;
  if(readbackAttempts===1)return {ok:true,status:200,json:async()=>({ok:true,
   requested:ids.length,readback_count:0,readback_verified:false,observation_ids:[]})};
  return {ok:true,status:200,json:async()=>({ok:true,requested:ids.length,
   readback_count:ids.length,readback_verified:true,observation_ids:ids})};
 };
 const originalsWithPrivate=[{...originals[0],risk_context:normalizeRiskStreamInternalCorroboration({
  source_kind:"PRIVATE_OSINT",country_iso3:"USA",category:"GEOPOLITICS",
  text:"Sanctions watch, private headline and URL https://osint.invalid/secret",
  severity_weight:61,corroboration_weight:.55,corridors:["USA>IND"]})},originals[1]];
 const result=await emitRiskStreamCandidates({originals:originalsWithPrivate,sourceRegistry,rightsManifest,now,
  dryRun:false,
  controlPlaneUrl:"https://control.invalid",controlPlaneToken:"root-test-token",
 factsPublicB64:facts.publicKey.export({format:"der",type:"spki"}).toString("base64"),
 rightsPublicB64:rights.publicKey.export({format:"der",type:"spki"}).toString("base64"),
  fetchImpl,sleepImpl:async ms=>delays.push(ms)});
 assert.equal(result.status,"POSTED");
 assert.equal(result.collector_acknowledged,true);
 assert.equal(result.d1_readback_verified,true);
 assert.deepEqual(paths,["/v1/internal/risk-stream/runtime",
  "/v1/internal/risk-stream/attest","/v1/internal/risk-stream/attest",
  "/v1/internal/risk-stream/attest",
  "/v1/internal/risk-stream/events","/v1/internal/risk-stream/readback",
  "/v1/internal/risk-stream/readback"]);
 assert.deepEqual(delays,[2000,2000]);
 assert.equal(batches[0].schema,"geomacro.risk-stream-ingest-batch.v1");
 assert.equal(batches[0].items.length,2);
 assert.equal(batches[0].items[0].event_fingerprint,batches[0].items[1].event_fingerprint);
 const privateContext=batches[0].items.find(item=>item.risk_context)?.risk_context;
 assert.equal(privateContext?.origin_kind,"PRIVATE_OSINT");
 assert.equal(privateContext?.event_code,"SANCTIONS");
 assert.equal(privateContext?.raw_source_redacted,true);
 assert.doesNotMatch(JSON.stringify(batches),/osint\.invalid|private headline|secret/iu);
});

test("send mode chunks ingest batches at 10 and readback requests at 100 IDs",async()=>{
 const facts=generateKeyPairSync("ed25519"),rights=generateKeyPairSync("ed25519");
 const eventBatches=[],readbackChunks=[];
 const fetchImpl=async(url,options)=>{
  const path=new URL(url).pathname;
  if(path==="/v1/internal/risk-stream/runtime")return {ok:true,status:200,
   json:async()=>({ok:true,schema:"geomacro.risk-stream-runtime-status.v1",ready:true})};
  if(path==="/v1/internal/risk-stream/attest"){
   const draft=JSON.parse(options.body).draft,claim=riskStreamOriginalClaims(draft);
   return {ok:true,status:200,json:async()=>({proof:{
    facts_signature_b64:sign(null,Buffer.from("geomacro.machine-original-facts.v1\n"+claim),facts.privateKey).toString("base64"),
    rights_signature_b64:sign(null,Buffer.from("geomacro.machine-commercial-rights.v1\n"+claim),rights.privateKey).toString("base64")}})};
  }
  if(path==="/v1/internal/risk-stream/events"){
   const body=JSON.parse(options.body);eventBatches.push(body.items);
   return {ok:true,status:202,json:async()=>({ok:true,accepted:body.items.length,commercial_delivery:false})};
  }
  assert.equal(path,"/v1/internal/risk-stream/readback");
  const ids=JSON.parse(options.body).observation_ids;readbackChunks.push(ids);
  return {ok:true,status:200,json:async()=>({ok:true,requested:ids.length,
   readback_count:ids.length,readback_verified:true,observation_ids:ids})};
 };
 const result=await emitRiskStreamCandidates({originals:makeDistinctOriginals(105),sourceRegistry,
  rightsManifest,now,dryRun:false,controlPlaneUrl:"https://control.invalid",
  controlPlaneToken:"root-test-token",factsPublicB64:facts.publicKey.export({format:"der",type:"spki"}).toString("base64"),
  rightsPublicB64:rights.publicKey.export({format:"der",type:"spki"}).toString("base64"),
  fetchImpl,sleepImpl:async()=>{}});
 assert.equal(result.status,"POSTED");
 assert.equal(result.candidate_count,105);
 assert.deepEqual(eventBatches.map(batch=>batch.length),[10,10,10,10,10,10,10,10,10,10,5]);
 assert.ok(eventBatches.every(batch=>batch.length<=10));
 assert.deepEqual(readbackChunks.map(ids=>ids.length),[100,5]);
 assert.ok(readbackChunks.every(ids=>ids.length<=100));
 assert.equal(new Set(readbackChunks.flat()).size,105);
});

test("send mode fails before attestation when the live Queue consumer serves a stale Worker version",async()=>{
 let calls=0;
 await assert.rejects(emitRiskStreamCandidates({originals:[originals[0]],sourceRegistry,
  rightsManifest,now,dryRun:false,controlPlaneUrl:"https://control.invalid",
  controlPlaneToken:"root-test-token",expectedControlPlaneSourceSha:"a".repeat(40),
  fetchImpl:async(url)=>{
   calls++;
   assert.equal(new URL(url).pathname,"/v1/internal/risk-stream/runtime");
   return {ok:true,status:200,json:async()=>({ok:true,
    schema:"geomacro.risk-stream-runtime-status.v1",ready:true,
    deployed_source_sha:"b".repeat(40),research_flags:{active:true,
     ingestion_enabled:true,production_mode:true,hot50_research_enabled:true},
    queue_binding_present:true,d1_binding_present:true,auth_configured:true})};
  }}),/CONTROL_PLANE_DEPLOYMENT_STALE/u);
 assert.equal(calls,1);
});

test("503 surfaces attester, private corroboration, and D1 provider error codes",async()=>{
 for(const code of ["ATTESTER_REFUSED","PRIVATE_CORROBORATION_UNAVAILABLE","D1_WRITE_BUDGET_EXHAUSTED"]){
  const calls=[];
  await assert.rejects(emitRiskStreamCandidates({originals:[originals[0]],sourceRegistry,
   rightsManifest,now,dryRun:false,controlPlaneUrl:"https://control.invalid",
   controlPlaneToken:"root-test-token",sleepImpl:async()=>{},
   fetchImpl:async url=>{
    calls.push(new URL(url).pathname);
    return {ok:false,status:503,json:async()=>({error:code})};
   }}),new RegExp("RISK_STREAM_EMITTER_HTTP_REJECTED_503_"+code,"u"));
  assert.deepEqual(calls,Array(6).fill("/v1/internal/risk-stream/runtime"));
 }
});

test("full labeled attester refusal code is surfaced without retries",async()=>{
 const facts=generateKeyPairSync("ed25519"),rights=generateKeyPairSync("ed25519");
 const code="ATTESTER_REFUSED_RIGHTS_403_RIGHTS_BEARER_REJECTED";
 const calls=[];
 await assert.rejects(emitRiskStreamCandidates({originals:[originals[0]],sourceRegistry,
  rightsManifest,now,dryRun:false,controlPlaneUrl:"https://control.invalid",
  controlPlaneToken:"root-test-token",sleepImpl:async()=>{},
  factsPublicB64:facts.publicKey.export({format:"der",type:"spki"}).toString("base64"),
  rightsPublicB64:rights.publicKey.export({format:"der",type:"spki"}).toString("base64"),
  fetchImpl:async url=>{
   const path=new URL(url).pathname;calls.push(path);
   if(path==="/v1/internal/risk-stream/runtime")return {ok:true,status:200,
    json:async()=>({ok:true,schema:"geomacro.risk-stream-runtime-status.v1",ready:true})};
   assert.equal(path,"/v1/internal/risk-stream/attest");
   return {ok:false,status:403,json:async()=>({error:code})};
  }}),/RISK_STREAM_EMITTER_HTTP_REJECTED_403_ATTESTER_REFUSED_RIGHTS_403_RIGHTS_BEARER_REJECTED/u);
 assert.deepEqual(calls,["/v1/internal/risk-stream/runtime",
  "/v1/internal/risk-stream/attest"]);
});

test("D1 readback waits 90 times at two seconds before timing out",async()=>{
 const facts=generateKeyPairSync("ed25519"),rights=generateKeyPairSync("ed25519");
 const sleeps=[],paths=[];let readbackAttempts=0;
 await assert.rejects(emitRiskStreamCandidates({originals:[originals[0]],sourceRegistry,
  rightsManifest,now,dryRun:false,controlPlaneUrl:"https://control.invalid",
  controlPlaneToken:"root-test-token",sleepImpl:async ms=>sleeps.push(ms),
  factsPublicB64:facts.publicKey.export({format:"der",type:"spki"}).toString("base64"),
  rightsPublicB64:rights.publicKey.export({format:"der",type:"spki"}).toString("base64"),
  fetchImpl:async(url,options)=>{
   const path=new URL(url).pathname;paths.push(path);
   if(path==="/v1/internal/risk-stream/runtime")return {ok:true,status:200,
    json:async()=>({ok:true,schema:"geomacro.risk-stream-runtime-status.v1",ready:true})};
   if(path==="/v1/internal/risk-stream/attest"){
    const draft=JSON.parse(options.body).draft,claim=riskStreamOriginalClaims(draft);
    return {ok:true,status:200,json:async()=>({proof:{
     facts_signature_b64:sign(null,Buffer.from("geomacro.machine-original-facts.v1\n"+claim),facts.privateKey).toString("base64"),
     rights_signature_b64:sign(null,Buffer.from("geomacro.machine-commercial-rights.v1\n"+claim),rights.privateKey).toString("base64")}})};
   }
   if(path==="/v1/internal/risk-stream/events")return {ok:true,status:202,
    json:async()=>({ok:true,accepted:1,commercial_delivery:false})};
   assert.equal(path,"/v1/internal/risk-stream/readback");
   readbackAttempts++;
   return {ok:true,status:200,json:async()=>({ok:true,requested:1,readback_count:0,
    readback_verified:false,observation_ids:[]})};
  }}),/RISK_STREAM_EMITTER_D1_READBACK_TIMEOUT/u);
 assert.equal(readbackAttempts,90);
 assert.equal(paths.filter(path=>path==="/v1/internal/risk-stream/readback").length,90);
 assert.equal(sleeps.length,89);
 assert.ok(sleeps.every(ms=>ms===2000));
});
