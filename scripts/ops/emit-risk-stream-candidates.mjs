#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {prepareRiskStreamCandidate,buildCandidate} from "../lib/risk-stream-candidate-builder.mjs";
import {pairRiskStreamOriginals} from "../lib/risk-stream-pairing.mjs";
import {eventFingerprint} from "../lib/risk-stream-event-fingerprint.mjs";
import {inspectRiskStreamCandidates,riskStreamOriginalClaims}
 from "../../workers/control-plane/src/risk-stream-pipeline.mjs";
import {validateAttesterKeys,verifyIndependentAttestations}
 from "../lib/risk-stream-shadow-attesters.mjs";

const fail=code=>{throw Error("RISK_STREAM_EMITTER_"+code)};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const parseJsonl=path=>readFileSync(path,"utf8").split(/\r?\n/u).filter(Boolean).map(line=>JSON.parse(line));
function retryAfter(response,attempt){
 const value=response.headers?.get?.("retry-after");
 if(value){
  const seconds=Number(value);
  if(Number.isFinite(seconds))return Math.min(60000,Math.max(0,seconds*1000));
  const date=Date.parse(value);
  if(Number.isFinite(date))return Math.min(60000,Math.max(0,date-Date.now()));
 }
 return Math.min(30000,500*2**attempt);
}
function validProof(proof){
 if(!proof||typeof proof!=="object"||
    typeof proof.facts_signature_b64!=="string"||typeof proof.rights_signature_b64!=="string")
  return false;
 for(const value of Object.values(proof)){
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value))return false;
  const bytes=Buffer.from(value,"base64");
  if(bytes.length!==64||bytes.toString("base64")!==value)return false;
 }
 return true;
}
async function requestJson(fetchImpl,url,options,{sleepImpl=wait,retries=5}={}){
 for(let attempt=0;attempt<=retries;attempt++){
  let response;
  try{response=await fetchImpl(url,{...options,redirect:"error"})}
  catch{if(attempt===retries)fail("HTTP_UNAVAILABLE");await sleepImpl(Math.min(30000,500*2**attempt));continue}
  if(response.ok){
   try{return await response.json()}catch{fail("HTTP_JSON_INVALID")}
  }
  let responseCode="";
  try{
   const body=await response.json();
   // Preserve complete labeled/status-qualified attester refusal codes.
   if(typeof body?.error==="string"&&
      /^(?:RISK_STREAM_[A-Z0-9_]+|ATTESTER_[A-Z0-9_]+|PRIVATE_CORROBORATION_[A-Z0-9_]+|D1_[A-Z0-9_]+|UNAUTHORIZED|CONTROL_PLANE_AUTH_UNCONFIGURED)$/u.test(body.error))
    responseCode=body.error;
  }catch{}
  // A configured fail-closed hold is not a transient edge failure. Surface
  // the actual deployment/binding reason instead of exhausting blind retries.
  if(responseCode==="RISK_STREAM_DISABLED")
   fail("HTTP_REJECTED_"+response.status+"_"+responseCode);
  if((response.status===429||response.status>=500)&&attempt<retries){
   await sleepImpl(retryAfter(response,attempt));continue;
  }
  fail("HTTP_REJECTED_"+response.status+(responseCode?"_"+responseCode:""));
 }
 fail("HTTP_RETRIES_EXHAUSTED");
}

/** Injectable network boundary for offline tests. */
export async function emitRiskStreamCandidates({originals,sourceRegistry,now=Date.now(),
 dryRun=true,controlPlaneUrl,controlPlaneToken,
 expectedControlPlaneSourceSha=process.env.GEOMACRO_EXPECTED_CONTROL_PLANE_SOURCE_SHA,
 factsPublicB64=process.env.RISK_STREAM_MACHINE_FACTS_SPKI_B64,
 rightsPublicB64=process.env.RISK_STREAM_MACHINE_RIGHTS_SPKI_B64,
 fetchImpl=fetch,sleepImpl=wait,rightsManifest}={}){
 // An excluded item must not poison an otherwise eligible batch, and must
 // never reach either attester or D1. Only item-license exclusions are
 // skippable here; structural, registry, event-identity, and clock failures
 // remain batch-fatal so callers cannot silently turn malformed inputs into
 // accepted production records.
 const prepared=[];let itemLicenseSkipped=0;
 for(const original of originals){
  try{prepared.push({original,candidate:
   prepareRiskStreamCandidate(original,sourceRegistry,now,{rightsManifest})})}
  catch(error){
   if(/^RISK_STREAM_ITEM_LICENSE_/u.test(String(error?.message??""))){
    itemLicenseSkipped++;continue;
   }
   throw error;
  }
 }
 const trustedRecords=prepared.map(({original,candidate},index)=>({...original,
  source_id:candidate.source_id,source_role:candidate.source_role,
  publisher_root_domain:candidate.publisher_root_domain,
  parent_media_entity:candidate.parent_media_entity,
  original_page_sha256:candidate.original_page_sha256,
  __risk_stream_candidate_index:index}));
 const pairing=pairRiskStreamOriginals(trustedRecords,now);
 const pairedRows=pairing.pairs.flatMap(pair=>pair.items.map(item=>{
  const row=prepared[item.__risk_stream_candidate_index];
  if(!row)fail("PAIR_MEMBER_LOOKUP_FAILED");return row;
 }));
 const pairedIndexes=new Set(pairedRows.map(row=>row.candidate));
 // Keep fresh, individually rights-approved observations flowing even before
 // a second public source arrives. The control-plane pipeline releases these
 // as Basic-only unless its own independent evidence or redacted corroboration
 // supports a higher tier.
 const unpairedFingerprints=new Set(pairing.unpaired_event_fingerprints);
 const basicRows=prepared.filter(row=>!pairedIndexes.has(row.candidate)&&
  unpairedFingerprints.has(eventFingerprint(row.original)));
 const acceptedRows=[...pairedRows,...basicRows].sort((left,right)=>
  Number(left.candidate.source_id==="gdelt_v2_factual_events")-
  Number(right.candidate.source_id==="gdelt_v2_factual_events"));
 const drafts=acceptedRows.map(row=>row.candidate);
 if(dryRun)return {status:"DRY_RUN",paired_events:pairing.pairs.length,
  candidate_count:drafts.length,contradictions:pairing.contradictions.length,
  item_license_skipped:itemLicenseSkipped,network_requests:0,posted_items:0};
 if(drafts.length===0)return {status:"NO_ELIGIBLE_ITEMS",paired_events:0,
  candidate_count:0,contradictions:pairing.contradictions.length,
  item_license_skipped:itemLicenseSkipped,network_requests:0,posted_items:0};
 if(typeof controlPlaneUrl!=="string"||!controlPlaneToken)fail("SEND_CONFIGURATION_MISSING");
 const runtime=await requestJson(fetchImpl,new URL("/v1/internal/risk-stream/runtime",controlPlaneUrl).href,
  {method:"GET",headers:{Authorization:"Bearer "+controlPlaneToken,
   Accept:"application/json"}},{sleepImpl});
 if(runtime?.schema!=="geomacro.risk-stream-runtime-status.v1"||runtime.ready!==true){
  const flags=runtime?.research_flags??{};
  const missing=[!flags.active&&"ACTIVE",!flags.ingestion_enabled&&"INGESTION",
   !flags.production_mode&&"MODE",!flags.hot50_research_enabled&&"RESEARCH",
   runtime?.queue_binding_present!==true&&"QUEUE",runtime?.d1_binding_present!==true&&"D1",
   runtime?.auth_configured!==true&&"AUTH"].filter(Boolean).join("_")||"STATUS";
  fail("CONTROL_PLANE_RUNTIME_NOT_READY_"+missing);
 }
 if(expectedControlPlaneSourceSha&&runtime.deployed_source_sha!==expectedControlPlaneSourceSha)
  fail("CONTROL_PLANE_DEPLOYMENT_STALE");
 let trustedAttesters;
 try{trustedAttesters=validateAttesterKeys(factsPublicB64,rightsPublicB64)}
 catch{fail("INDEPENDENT_TRUSTED_ATTESTER_KEYS_MISSING_OR_INVALID")}
 const attesterEndpoint=new URL("/v1/internal/risk-stream/attest",controlPlaneUrl);
 const endpoint=new URL("/v1/internal/risk-stream/events",controlPlaneUrl);
 if(attesterEndpoint.protocol!=="https:"||endpoint.protocol!=="https:"||
    attesterEndpoint.username||attesterEndpoint.password||attesterEndpoint.hash||
    endpoint.username||endpoint.password||endpoint.hash)
  fail("HTTPS_REQUIRED");
 const candidates=new Array(drafts.length);let nextDraft=0;
 const attestNext=async()=>{
  while(true){
   const index=nextDraft++;
   if(index>=drafts.length)return;
   const draft=drafts[index];
  const answer=await requestJson(fetchImpl,attesterEndpoint.href,{method:"POST",
   headers:{Authorization:"Bearer "+controlPlaneToken,"Content-Type":"application/json"},
   body:JSON.stringify({schema:"geomacro.risk-stream-attestation-request.v1",draft})},{sleepImpl});
  if(!validProof(answer?.proof))fail("ATTESTER_PROOF_INVALID");
  const row=acceptedRows.find(item=>item.candidate===draft);
  const original=row?.original;if(!original)fail("ORIGINAL_BINDING_LOST");
  const attestedOriginal=answer.risk_context?{...original,risk_context:answer.risk_context}:original;
  const built=buildCandidate(attestedOriginal,sourceRegistry,now,{proof:answer.proof,rightsManifest});
  try{verifyIndependentAttestations(built,trustedAttesters.keys)}
  catch{fail("ATTESTER_SIGNATURE_VERIFICATION_FAILED")}
  const current=now instanceof Date?now.getTime():typeof now==="number"?now:Date.parse(now);
  await inspectRiskStreamCandidates([built],current);
   candidates[index]=built;
  }
 };
 await Promise.all(Array.from({length:Math.min(5,drafts.length)},()=>attestNext()));
 for(let offset=0;offset<candidates.length;offset+=10){
  const items=candidates.slice(offset,offset+10);
  const receipt=await requestJson(fetchImpl,endpoint.href,{method:"POST",
   headers:{Authorization:"Bearer "+controlPlaneToken,"Content-Type":"application/json"},
   body:JSON.stringify({schema:"geomacro.risk-stream-ingest-batch.v1",items})},{sleepImpl});
  if(receipt?.ok!==true||receipt.accepted!==items.length||receipt.commercial_delivery!==false)
   fail("CONTROL_PLANE_RECEIPT_INVALID");
 }
 const observationIds=candidates.map(item=>createHash("sha256")
  .update(riskStreamOriginalClaims(item)).digest("hex"));
 const readbackUrl=new URL("/v1/internal/risk-stream/readback",controlPlaneUrl).href;
 for(let offset=0;offset<observationIds.length;offset+=100){
  const ids=observationIds.slice(offset,offset+100);
  for(let attempt=1;attempt<=90;attempt++){
   const readback=await requestJson(fetchImpl,readbackUrl,{method:"POST",
    headers:{Authorization:"Bearer "+controlPlaneToken,"Content-Type":"application/json"},
    body:JSON.stringify({schema:"geomacro.risk-stream-readback-request.v1",
     observation_ids:ids})},{sleepImpl});
   if(readback?.ok===true&&readback.readback_verified===true&&
      readback.requested===ids.length&&readback.readback_count===ids.length&&
      Array.isArray(readback.observation_ids)&&
      ids.every(id=>readback.observation_ids.includes(id)))break;
   if(attempt===90)fail("D1_READBACK_TIMEOUT");
   await sleepImpl(2000);
  }
 }
 return {status:"POSTED",paired_events:pairing.pairs.length,
  candidate_count:candidates.length,contradictions:pairing.contradictions.length,
  item_license_skipped:itemLicenseSkipped,posted_items:candidates.length,
  collector_acknowledged:true,d1_readback_verified:true,
  control_plane_source_sha:runtime.deployed_source_sha};
}

function argValue(args,name){const index=args.indexOf(name);return index<0?null:args[index+1]??null}
async function main(){
 const args=process.argv.slice(2),input=argValue(args,"--input"),registryPath=argValue(args,"--registry");
 const dryRun=!args.includes("--send");
 if(!input||!registryPath)fail("INPUT_AND_REGISTRY_REQUIRED");
 const originals=parseJsonl(input),registry=JSON.parse(readFileSync(registryPath,"utf8"));
 const result=await emitRiskStreamCandidates({originals,sourceRegistry:registry,
  dryRun,
  controlPlaneUrl:process.env.CONTROL_PLANE_URL,
  controlPlaneToken:process.env.CONTROL_PLANE_TOKEN});
 console.log(JSON.stringify(result));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(error=>{console.error(String(error?.message??"RISK_STREAM_EMITTER_FAILED").slice(0,100));process.exitCode=2});
