#!/usr/bin/env node
/** Official native statistical / batch reference D1 publisher.
 * Never converts a statistical observation to a paid corridor event.
 */
import {createHmac} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
const ENDPOINT="https://geomacro-control-plane.daspallab202391.workers.dev";
export async function publishOfficialCorridorReferences({receipt,rootToken,now=new Date(),
 fetchImpl=fetch,endpoint=ENDPOINT}={}){
 if(!receipt||receipt.schema!=="geomacro.corridor-official-reference-intake.v1"||
   receipt.channel!=="CORRIDOR_ONLY"||receipt.website_intelligence_enabled!==false||
   receipt.commercial_rights_verified!==false||
   !Array.isArray(receipt.source_checks)||receipt.source_checks.length!==9||
   !Array.isArray(receipt.observations)||receipt.observations.length>60||
   receipt.observation_count!==receipt.observations.length||
   !Number.isFinite(Date.parse(receipt.checked_at))||
   !(now instanceof Date)||!Number.isFinite(now.getTime())||
   now.getTime()-Date.parse(receipt.checked_at)>15*60000||
   now.getTime()<Date.parse(receipt.checked_at)||
   typeof rootToken!=="string"||rootToken.trim().length<32||
   typeof fetchImpl!=="function"||endpoint!==ENDPOINT)
   throw Error("CORRIDOR_OFFICIAL_PUBLISH_INVALID");
 const token=createHmac("sha256",rootToken.trim()).update(
   "geomacro-control-plane-v1").digest("hex");
 // Production Workers deployment and Actions intake are independent jobs.
 // Bound retries only for rollout 404/503 (no redirects, never auth failures).
 const packet={schema:"geomacro.corridor-official-reference-batch.v1",
  channel:"CORRIDOR_ONLY",checked_at:now.toISOString(),
  observations:receipt.observations,commercial_rights_verified:false,
  website_intelligence_enabled:false};
 let response,attempts=0;
 for(let i=0;i<6;i++){
  attempts++;
  try{response=await fetchImpl(endpoint+"/v1/internal/corridor-official-reference",{
   method:"PUT",redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify(packet),signal:AbortSignal.timeout(15000)
  })}catch{throw Error("CORRIDOR_OFFICIAL_D1_NETWORK_UNAVAILABLE")}
  if(response.status===200)break;
  if(![404,503].includes(response.status)||i===5)
   throw Error("CORRIDOR_OFFICIAL_D1_PUT_HTTP_"+response.status);
  await new Promise(resolve=>setTimeout(resolve,5000*(i+1)));
 }

 let body;try{body=await response.json()}catch{throw Error("CORRIDOR_OFFICIAL_D1_ACK_INVALID")}
 if(body.ok!==true||body.schema!=="geomacro.corridor-official-reference-d1-receipt.v1"||
    body.channel!=="CORRIDOR_ONLY"||body.submitted!==receipt.observations.length||
    body.verified!==body.submitted||body.d1_readback_verified!==true||
    body.retention_hours!==72||body.website_intelligence_writes!==0||
    body.events_verified!==0||body.commercial_rights_verified!==false||
    body.signed_gro_generated!==false||body.chargeable!==false)
   throw Error("CORRIDOR_OFFICIAL_D1_ACK_INVALID");
 let read;try{
  read=await fetchImpl(endpoint+"/v1/internal/corridor-official-reference?limit=25",{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(15000)
  })
 }catch{throw Error("CORRIDOR_OFFICIAL_D1_GET_UNAVAILABLE")}
 if(read.status!==200)throw Error("CORRIDOR_OFFICIAL_D1_GET_HTTP_"+read.status);
 let second;try{second=await read.json()}catch{throw Error("CORRIDOR_OFFICIAL_D1_GET_INVALID")}
 if(second.ok!==true||second.schema!=="geomacro.corridor-official-reference-private-read.v1"||
   second.channel!=="CORRIDOR_ONLY"||!Array.isArray(second.observations)||
   second.count!==second.observations.length||second.commercial_eligible!==false||
   second.independent_events_verified!==false||second.chargeable!==false)
   throw Error("CORRIDOR_OFFICIAL_D1_GET_INVALID");
 return {schema:"geomacro.corridor-official-reference-production-acceptance.v1",
  channel:"CORRIDOR_ONLY",checked_at:now.toISOString(),
  sources_checked:receipt.source_checks.length,
  sources_with_observations:receipt.source_checks.filter(x=>x.observations>0).length,
  observations:receipt.observation_count,d1_records_verified:body.verified,
  authenticated_d1_put_readback:true,authenticated_d1_get_readback:true,
  recent_readback_count:second.count,retention_hours:72,requests:attempts+1,
  independent_events_verified:0,website_intelligence_writes:0,
  commercial_eligible:false,signed_gro_generated:false,payments:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    process.env.GITHUB_REF!=="refs/heads/main"||
    !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
    throw Error("CORRIDOR_OFFICIAL_MAIN_ONLY");
  const receipt=JSON.parse(readFileSync(
   "artifacts/direct-corridor-intake/official-references.json","utf8"));
  const output=await publishOfficialCorridorReferences({
    receipt,rootToken:process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN
  });
  writeFileSync("artifacts/direct-corridor-intake/official-d1-readback.json",
   JSON.stringify(output,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(output));
 }catch(e){
  console.error("::error::"+String(e.message).slice(0,120));
  process.exitCode=2;
 }
}
