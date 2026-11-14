import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign} from "node:crypto";
import {emitRiskStreamCandidates} from "../ops/emit-risk-stream-candidates.mjs";
import {riskStreamOriginalClaims} from "../../workers/control-plane/src/risk-stream-pipeline.mjs";

const now=Date.parse("2026-11-14T12:00:00.000Z");
const rightsManifest={schema:"geomacro.risk-stream-source-rights-reviewed.v1",entries:[
 ["wire_primary","wire.test","wire_parent","GOVERNMENT_WIRE"],
 ["regional_primary","regional.test","regional_parent","INDEPENDENT_REGIONAL"]
].map(([source_id,publisher_root_domain,parent_media_entity,source_role])=>({
 source_id,publisher_root_domain,parent_media_entity,source_role,categories:["GEOPOLITICS"],
 status:"APPROVED",rights_expire_at:"2027-10-01",
 rights_evidence:{licence_url:"https://"+publisher_root_domain+"/licence",
  terms_url:"https://"+publisher_root_domain+"/terms",reviewed_at:"2026-10-01T00:00:00.000Z",
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
 raw_payload:"Original private fixture page bytes from source "+source.source_id+".",
 derived:{what:"A measure was announced.",why:"It affects an institution.",
  market:"Market access could tighten.",watch:"Watch official implementation."},
 reporting_position:"confirms"}));

test("dry run validates pair and makes no HTTP request",async()=>{
 let calls=0;
 const result=await emitRiskStreamCandidates({originals,sourceRegistry,rightsManifest,now,
  fetchImpl:async()=>{calls++;throw Error("unexpected")}});
 assert.equal(result.status,"DRY_RUN");
 assert.equal(result.candidate_count,2);
 assert.equal(calls,0);
});

test("send mode obtains genuine stubbed signatures then posts exact worker batch",async()=>{
 const facts=generateKeyPairSync("ed25519"),rights=generateKeyPairSync("ed25519");
 const paths=[],batches=[],delays=[];let throttled=false;
 const fetchImpl=async(url,options)=>{
  paths.push(new URL(url).pathname);
  assert.equal(options.redirect,"error");
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
  const body=JSON.parse(options.body);batches.push(body);
  return {ok:true,status:202,json:async()=>({ok:true,accepted:body.items.length,commercial_delivery:false})};
 };
 const result=await emitRiskStreamCandidates({originals,sourceRegistry,rightsManifest,now,
  dryRun:false,
  controlPlaneUrl:"https://control.invalid",controlPlaneToken:"root-test-token",
 factsPublicB64:facts.publicKey.export({format:"der",type:"spki"}).toString("base64"),
 rightsPublicB64:rights.publicKey.export({format:"der",type:"spki"}).toString("base64"),
  fetchImpl,sleepImpl:async ms=>delays.push(ms)});
 assert.equal(result.status,"POSTED");
 assert.deepEqual(paths,["/v1/internal/risk-stream/attest","/v1/internal/risk-stream/attest",
  "/v1/internal/risk-stream/attest",
  "/v1/internal/risk-stream/events"]);
 assert.deepEqual(delays,[2000]);
 assert.equal(batches[0].schema,"geomacro.risk-stream-ingest-batch.v1");
 assert.equal(batches[0].items.length,2);
 assert.equal(batches[0].items[0].event_fingerprint,batches[0].items[1].event_fingerprint);
});
