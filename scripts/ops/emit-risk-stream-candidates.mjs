#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {prepareRiskStreamCandidate,buildCandidate} from "../lib/risk-stream-candidate-builder.mjs";
import {pairRiskStreamOriginals} from "../lib/risk-stream-pairing.mjs";
import {inspectRiskStreamCandidates} from "../../workers/control-plane/src/risk-stream-pipeline.mjs";
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
  catch(error){if(attempt===retries)fail("HTTP_UNAVAILABLE");await sleepImpl(Math.min(30000,500*2**attempt));continue}
  if(response.ok){
   try{return await response.json()}catch{fail("HTTP_JSON_INVALID")}
  }
  if((response.status===429||response.status>=500)&&attempt<retries){
   await sleepImpl(retryAfter(response,attempt));continue;
  }
  fail("HTTP_REJECTED_"+response.status);
 }
 fail("HTTP_RETRIES_EXHAUSTED");
}

/** Injectable network boundary for offline tests. */
export async function emitRiskStreamCandidates({originals,sourceRegistry,now=Date.now(),
 dryRun=true,controlPlaneUrl,controlPlaneToken,
 factsPublicB64=process.env.RISK_STREAM_MACHINE_FACTS_SPKI_B64,
 rightsPublicB64=process.env.RISK_STREAM_MACHINE_RIGHTS_SPKI_B64,
 fetchImpl=fetch,sleepImpl=wait,rightsManifest}={}){
 const prepared=originals.map(original=>({original,candidate:
  prepareRiskStreamCandidate(original,sourceRegistry,now,{rightsManifest})}));
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
 const drafts=pairedRows.map(row=>row.candidate);
 if(dryRun)return {status:"DRY_RUN",paired_events:pairing.pairs.length,
  candidate_count:drafts.length,contradictions:pairing.contradictions.length,
  network_requests:0,posted_items:0};
 if(typeof controlPlaneUrl!=="string"||!controlPlaneToken)fail("SEND_CONFIGURATION_MISSING");
 let trustedAttesters;
 try{trustedAttesters=validateAttesterKeys(factsPublicB64,rightsPublicB64)}
 catch{fail("INDEPENDENT_TRUSTED_ATTESTER_KEYS_MISSING_OR_INVALID")}
 const attesterEndpoint=new URL("/v1/internal/risk-stream/attest",controlPlaneUrl);
 const endpoint=new URL("/v1/internal/risk-stream/events",controlPlaneUrl);
 if(attesterEndpoint.protocol!=="https:"||endpoint.protocol!=="https:"||
    attesterEndpoint.username||attesterEndpoint.password||attesterEndpoint.hash||
    endpoint.username||endpoint.password||endpoint.hash)
  fail("HTTPS_REQUIRED");
 const candidates=[];
 for(const draft of drafts){
  const answer=await requestJson(fetchImpl,attesterEndpoint.href,{method:"POST",
   headers:{Authorization:"Bearer "+controlPlaneToken,"Content-Type":"application/json"},
   body:JSON.stringify({schema:"geomacro.risk-stream-attestation-request.v1",draft})},{sleepImpl});
  if(!validProof(answer?.proof))fail("ATTESTER_PROOF_INVALID");
  const row=pairedRows.find(item=>item.candidate===draft);
  const original=row?.original;if(!original)fail("ORIGINAL_BINDING_LOST");
  const built=buildCandidate(original,sourceRegistry,now,{proof:answer.proof,rightsManifest});
  try{verifyIndependentAttestations(built,trustedAttesters.keys)}
  catch{fail("ATTESTER_SIGNATURE_VERIFICATION_FAILED")}
  const current=now instanceof Date?now.getTime():typeof now==="number"?now:Date.parse(now);
  await inspectRiskStreamCandidates([built],current);
  candidates.push(built);
 }
 for(let offset=0;offset<candidates.length;offset+=100){
  const items=candidates.slice(offset,offset+100);
  const receipt=await requestJson(fetchImpl,endpoint.href,{method:"POST",
   headers:{Authorization:"Bearer "+controlPlaneToken,"Content-Type":"application/json"},
   body:JSON.stringify({schema:"geomacro.risk-stream-ingest-batch.v1",items})},{sleepImpl});
  if(receipt?.ok!==true||receipt.accepted!==items.length||receipt.commercial_delivery!==false)
   fail("CONTROL_PLANE_RECEIPT_INVALID");
 }
 return {status:"POSTED",paired_events:pairing.pairs.length,
  candidate_count:candidates.length,contradictions:pairing.contradictions.length,
  posted_items:candidates.length};
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
