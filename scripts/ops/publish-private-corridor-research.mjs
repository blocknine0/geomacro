#!/usr/bin/env node
/** Main-only private source-proof-backed GeoMacro five-part D1 publisher.
 * Source references must already pass independent canonical D1 readback.
 */
import {createHmac} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {hashStructuredEvidence} from "../lib/corridor-source-evidence-proof.mjs";
const ENDPOINT="https://geomacro-control-plane.daspallab202391.workers.dev";
export async function publishPrivateCorridorResearch({
 receipt,rootToken,now=new Date(),fetchImpl=fetch,endpoint=ENDPOINT
}={}){
 if(!receipt||receipt.schema!=="geomacro.corridor-private-structured-research.v1"||
    receipt.channel!=="CORRIDOR_ONLY"||
    !Array.isArray(receipt.structured_records)||receipt.structured_records.length>60||
    receipt.structured_record_count!==receipt.structured_records.length||
    !receipt.evidence_bundle||
    receipt.evidence_bundle.proof_count!==receipt.structured_record_count||
    receipt.source_article_candidates_not_converted<0||
    receipt.raw_api_response_persisted!==false||
    receipt.raw_article_text_persisted!==false||
    receipt.commercial_eligible!==false||
    receipt.customer_delivery_authorized!==false||
    receipt.website_intelligence_writes!==0||receipt.predge_writes!==0||
    receipt.evidence_bundle.independent_real_world_event_verified!==false||
    !Number.isFinite(Date.parse(receipt.generated_at))||
    !(now instanceof Date)||!Number.isFinite(now.getTime())||
    now.getTime()<Date.parse(receipt.generated_at)||
    now.getTime()-Date.parse(receipt.generated_at)>15*60000||
    typeof rootToken!=="string"||rootToken.trim().length<32||
    typeof fetchImpl!=="function"||endpoint!==ENDPOINT)
   throw Error("CORRIDOR_DERIVED_PUBLISH_INPUT_INVALID");
 const proofMap=new Map(receipt.evidence_bundle.proofs.map(x=>[x.source_reference_id,x]));
 if(proofMap.size!==receipt.structured_records.length)
   throw Error("CORRIDOR_DERIVED_PUBLISH_PROOF_PARITY");
 const items=receipt.structured_records.map(record=>{
  const proof=proofMap.get(record.source_reference_id);
  if(!proof||proof.proof_sha256!==record.source_proof_sha256)
   throw Error("CORRIDOR_DERIVED_PUBLISH_PROOF_MISSING");
  return {record,proof,record_sha256:hashStructuredEvidence(record)};
 });
 const bearer=createHmac("sha256",rootToken.trim()).update(
  "geomacro-control-plane-v1").digest("hex");
 const packets=[];
 for(let i=0;i<items.length;i+=12)packets.push(items.slice(i,i+12));
 if(!packets.length)packets.push([]);
 let verified=0,calls=0;
 for(const chunk of packets){
  const payload={schema:"geomacro.corridor-private-research-d1-batch.v1",
   channel:"CORRIDOR_ONLY",checked_at:now.toISOString(),
   items:chunk,website_intelligence_enabled:false,
   commercial_rights_verified:false};
  let response;
  for(let attempt=0;attempt<6;attempt++){
   try{
    response=await fetchImpl(endpoint+"/v1/internal/corridor-private-research",{
     method:"PUT",redirect:"error",cache:"no-store",
     headers:{Authorization:"Bearer "+bearer,"Content-Type":"application/json"},
     body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)
    });calls++;
   }catch{throw Error("CORRIDOR_DERIVED_D1_NETWORK_UNAVAILABLE")}
   if(response.status===200)break;
   if(![404,503].includes(response.status)||attempt===5)
    throw Error("CORRIDOR_DERIVED_D1_PUT_HTTP_"+response.status);
   await new Promise(resolve=>setTimeout(resolve,5000*(attempt+1)));
  }
  let b;try{b=await response.json()}catch{
   throw Error("CORRIDOR_DERIVED_D1_ACK_UNPARSEABLE")}
  if(b.ok!==true||b.schema!=="geomacro.corridor-private-research-d1-receipt.v1"||
     b.channel!=="CORRIDOR_ONLY"||b.submitted!==chunk.length||
     b.verified!==chunk.length||b.d1_source_fact_readback_verified!==true||
     b.d1_derived_readback_verified!==true||b.retention_hours!==72||
     b.independent_real_world_event_verified!==false||
     b.website_intelligence_writes!==0||b.predge_writes!==0||
     b.signed_gro_generated!==false||b.commercial_eligible!==false||
     b.chargeable!==false||b.raw_publisher_content_stored!==false)
   throw Error("CORRIDOR_DERIVED_D1_ACK_INVALID");
  verified+=b.verified;
 }
 if(verified!==items.length)throw Error("CORRIDOR_DERIVED_D1_ITEM_READBACK_MISMATCH");
 let response;
 try{response=await fetchImpl(endpoint+
  "/v1/internal/corridor-private-research?limit=12",{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+bearer},signal:AbortSignal.timeout(15000)
  });calls++}catch{throw Error("CORRIDOR_DERIVED_D1_GET_NETWORK_UNAVAILABLE")}
 if(response.status!==200)throw Error("CORRIDOR_DERIVED_D1_GET_HTTP_"+response.status);
 let got;try{got=await response.json()}catch{
  throw Error("CORRIDOR_DERIVED_D1_GET_INVALID")}
 if(got.ok!==true||got.schema!=="geomacro.corridor-private-research-private-read.v1"||
   got.channel!=="CORRIDOR_ONLY"||!Array.isArray(got.records)||
   got.records.length!==got.count||got.commercial_eligible!==false||
   got.customer_delivery_authorized!==false||got.chargeable!==false||
   got.independent_real_world_event_verified!==false)
  throw Error("CORRIDOR_DERIVED_D1_GET_INVALID");
 return {schema:"geomacro.corridor-private-research-production-acceptance.v1",
  channel:"CORRIDOR_ONLY",checked_at:now.toISOString(),
  source_proof_records_checked:receipt.structured_record_count,
  d1_five_part_records_verified:verified,
  source_d1_fact_equality_checked:true,d1_derived_exact_readback:true,
  authenticated_d1_get_verified:true,private_recent_count:got.count,
  api_calls:calls,retention_hours:72,verified_real_world_events:0,
  customer_delivery_authorized:false,commercial_eligible:false,
  signed_gro_generated:false,website_intelligence_writes:0,predge_writes:0,
  raw_publisher_content_stored:false,payments:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    process.env.GITHUB_REF!=="refs/heads/main"||
    !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
    throw Error("CORRIDOR_DERIVED_MAIN_ONLY");
  const receipt=JSON.parse(readFileSync(
   "artifacts/direct-corridor-intake/structured-research.json","utf8"));
  const output=await publishPrivateCorridorResearch({
   receipt,rootToken:process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN
  });
  writeFileSync("artifacts/direct-corridor-intake/research-d1-readback.json",
   JSON.stringify(output,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(output));
 }catch(e){
  console.error("::error::"+String(e.message).slice(0,115));
  process.exitCode=2;
 }
}
