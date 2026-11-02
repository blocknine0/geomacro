#!/usr/bin/env node
/** Main-only authenticated corridor native-news D1 publisher.
 * Publishes non-chargeable original link/time metadata and verifies D1 readback.
 */
import {readFileSync,writeFileSync} from "node:fs";
import {createHmac} from "node:crypto";
import {pathToFileURL} from "node:url";
const ENDPOINT="https://geomacro-control-plane.daspallab202391.workers.dev";
const SCHEMA="geomacro.corridor-native-news-d1-batch.v1";
export async function publishPrivateCorridorNews({
 receipt,rootToken,fetchImpl=fetch,now=new Date(),endpoint=ENDPOINT
}={}){
 if(!receipt||receipt.schema!=="geomacro.corridor-native-news-candidates.v1"||
   receipt.channel!=="CORRIDOR_ONLY"||receipt.source_count!==37||
   receipt.native_news_sources_polled!==6||
   !Array.isArray(receipt.news_candidates)||receipt.news_candidates.length>160||
   receipt.candidate_count!==receipt.news_candidates.length||
   receipt.website_intelligence_enabled!==false||
   receipt.commercial_rights_verified!==false||
   typeof rootToken!=="string"||rootToken.trim().length<32||
   typeof fetchImpl!=="function"||!(now instanceof Date)||
   !Number.isFinite(now.getTime())||
   !Number.isFinite(Date.parse(receipt.checked_at))||
   now.getTime()-Date.parse(receipt.checked_at)>15*60000||
   now.getTime()<Date.parse(receipt.checked_at)||
   endpoint!==ENDPOINT)
   throw Error("CORRIDOR_PRIVATE_PUBLISH_INPUT_INVALID");
 const bearer=createHmac("sha256",rootToken.trim()).update(
   "geomacro-control-plane-v1").digest("hex");
 const records=receipt.news_candidates;
 const chunks=[];
 for(let i=0;i<records.length;i+=40)chunks.push(records.slice(i,i+40));
 if(!chunks.length)chunks.push([]);
 let verified=0,requests=0;
 for(const chunk of chunks){
   const packet={schema:SCHEMA,channel:"CORRIDOR_ONLY",
     checked_at:now.toISOString(),items:chunk,
     website_intelligence_enabled:false,commercial_rights_verified:false};
   let response;
   try{response=await fetchImpl(endpoint+"/v1/internal/corridor-native-news",{
     method:"PUT",redirect:"error",cache:"no-store",
     headers:{"Authorization":"Bearer "+bearer,"Content-Type":"application/json"},
     body:JSON.stringify(packet),signal:AbortSignal.timeout(15000)
   });requests++}catch{throw Error("CORRIDOR_PRIVATE_D1_NETWORK_UNAVAILABLE")}
   if(response.status!==200)throw Error("CORRIDOR_PRIVATE_D1_PUT_HTTP_"+response.status);
   let body;try{body=await response.json()}catch{
     throw Error("CORRIDOR_PRIVATE_D1_ACK_INVALID")}
   if(body.ok!==true||body.channel!=="CORRIDOR_ONLY"||
      body.schema!=="geomacro.corridor-native-news-d1-receipt.v1"||
      body.submitted!==chunk.length||body.verified!==chunk.length||
      body.d1_readback_verified!==true||body.retention_hours!==72||
      body.website_intelligence_writes!==0||
      body.raw_upstream_stored!==false||body.publisher_title_stored!==false||
      body.paid_publication_authorized!==false||body.chargeable!==false)
     throw Error("CORRIDOR_PRIVATE_D1_ACK_INVALID");
   verified+=body.verified;
 }
 if(verified!==records.length)throw Error("CORRIDOR_PRIVATE_D1_ITEM_READBACK_MISMATCH");
 let response;
 try{response=await fetchImpl(endpoint+"/v1/internal/corridor-native-news?limit=25",{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{"Authorization":"Bearer "+bearer},
   signal:AbortSignal.timeout(15000)
 });requests++}catch{throw Error("CORRIDOR_PRIVATE_D1_GET_NETWORK_UNAVAILABLE")}
 if(response.status!==200)throw Error("CORRIDOR_PRIVATE_D1_GET_HTTP_"+response.status);
 let readback;
 try{readback=await response.json()}catch{throw Error("CORRIDOR_PRIVATE_D1_GET_INVALID")}
 if(readback.ok!==true||readback.channel!=="CORRIDOR_ONLY"||
    readback.schema!=="geomacro.corridor-native-news-private-read.v1"||
    !Array.isArray(readback.candidates)||readback.count!==readback.candidates.length||
    readback.website_intelligence_enabled!==false||
    readback.commercial_eligible!==false||readback.chargeable!==false)
   throw Error("CORRIDOR_PRIVATE_D1_GET_INVALID");
 return {schema:"geomacro.corridor-native-news-production-acceptance.v1",
   channel:"CORRIDOR_ONLY",checked_at:now.toISOString(),
   native_news_sources_polled:6,source_count:37,link_references:39,
   native_news_candidates_observed:records.length,
   d1_candidate_records_verified:verified,
   authenticated_d1_put_readback:true,authenticated_d1_get_readback:true,
   private_d1_recent_candidate_count:readback.count,
   provider_calls:requests,retention_hours:72,
   website_intelligence_writes:0,source_title_persisted:false,
   commercial_eligible:false,customer_delivery_authorized:false,
   signed_gro_generated:false,payments:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
     process.env.GITHUB_REF!=="refs/heads/main"||
     !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
    throw Error("CORRIDOR_PRIVATE_MAIN_ONLY");
  const receipt=JSON.parse(readFileSync(
    "artifacts/direct-corridor-intake/news-candidates.json","utf8"));
  const result=await publishPrivateCorridorNews({
    receipt,rootToken:process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN
  });
  writeFileSync("artifacts/direct-corridor-intake/d1-readback.json",
    JSON.stringify(result,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(result));
 }catch(e){
  console.error("::error::"+String(e.message).slice(0,120));
  process.exitCode=2;
 }
}
