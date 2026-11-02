#!/usr/bin/env node
/** Production-only, authenticated CryptoCompare individual five-part publisher. */
import {createHmac,createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {CRYPTO_NEWS_SCHEMA,cryptoIndividualRecord,validCryptoIndividual}
 from "../../lib/crypto-news-individual-structured.mjs";
const ENDPOINT="https://geomacro-control-plane.daspallab202391.workers.dev";
export async function publishPrivateCryptoIndividualNews({
 receipt,rootToken,now=new Date(),fetchImpl=fetch,endpoint=ENDPOINT
}={}){
 if(!receipt||receipt.schema!==CRYPTO_NEWS_SCHEMA||
    receipt.channel!=="CORRIDOR_ONLY"||
    !Array.isArray(receipt.items)||receipt.items.length>50||
    !Number.isFinite(Date.parse(receipt.checked_at))||
    now.getTime()-Date.parse(receipt.checked_at)>15*60000||
    now.getTime()<Date.parse(receipt.checked_at)||
    receipt.website_intelligence_enabled!==false||
    receipt.commercial_rights_verified!==false||
    typeof rootToken!=="string"||rootToken.trim().length<32||
    typeof fetchImpl!=="function"||endpoint!==ENDPOINT)
   throw Error("CRYPTO_INDIVIDUAL_PUBLISH_INPUT_INVALID");
 for(const {record,record_sha256} of receipt.items){
  if(!validCryptoIndividual(record?.candidate,now.getTime())||
     JSON.stringify(record)!==JSON.stringify(cryptoIndividualRecord(record.candidate))||
     createHash("sha256").update(JSON.stringify(record)).digest("hex")!==record_sha256)
   throw Error("CRYPTO_INDIVIDUAL_PUBLISH_PROVENANCE_INVALID");
 }
 const bearer=createHmac("sha256",rootToken.trim()).update("geomacro-control-plane-v1").digest("hex");
 const chunks=[];for(let i=0;i<receipt.items.length;i+=10)chunks.push(receipt.items.slice(i,i+10));
 if(!chunks.length)chunks.push([]);
 let calls=0,verified=0;
 for(const chunk of chunks){
  const payload={...receipt,checked_at:now.toISOString(),items:chunk};
  let response;
  for(let attempt=0;attempt<6;attempt++){
   try{
    response=await fetchImpl(endpoint+"/v1/internal/corridor-crypto-individual-research",{
     method:"PUT",redirect:"error",cache:"no-store",
     headers:{"Authorization":"Bearer "+bearer,"Content-Type":"application/json"},
     body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)
    });calls++;
   }catch{throw Error("CRYPTO_INDIVIDUAL_D1_NETWORK_UNAVAILABLE")}
   if(response.status===200)break;
   if(![404,503].includes(response.status)||attempt===5)
    throw Error("CRYPTO_INDIVIDUAL_D1_PUT_HTTP_"+response.status);
   await new Promise(done=>setTimeout(done,5000*(attempt+1)));
  }
  let result;try{result=await response.json()}catch{throw Error("CRYPTO_INDIVIDUAL_D1_ACK_UNPARSEABLE")}
  if(result.ok!==true||result.schema!=="geomacro.crypto-news-private-d1-receipt.v1"||
     result.submitted!==chunk.length||result.verified!==chunk.length||
     result.d1_individual_five_part_readback!==true||result.retention_hours!==72||
     result.verified_real_world_events!==0||result.signed_gro_generated!==false||
     result.customer_delivery_authorized!==false||
     result.commercial_eligible!==false||result.website_intelligence_writes!==0||
     result.predge_writes!==0||result.chargeable!==false||
     result.raw_publisher_content_stored!==false)
   throw Error("CRYPTO_INDIVIDUAL_D1_ACK_INVALID");
  verified+=result.verified;
 }
 if(verified!==receipt.items.length)throw Error("CRYPTO_INDIVIDUAL_D1_READBACK_MISMATCH");
 let response;
 try{response=await fetchImpl(endpoint+"/v1/internal/corridor-crypto-individual-research?limit=50",{
  method:"GET",redirect:"error",cache:"no-store",
  headers:{"Authorization":"Bearer "+bearer},signal:AbortSignal.timeout(15000)
 });calls++;}catch{throw Error("CRYPTO_INDIVIDUAL_D1_GET_NETWORK_UNAVAILABLE")}
 if(response.status!==200)throw Error("CRYPTO_INDIVIDUAL_D1_GET_HTTP_"+response.status);
 let readback;try{readback=await response.json()}catch{throw Error("CRYPTO_INDIVIDUAL_D1_GET_UNPARSEABLE")}
 if(readback.ok!==true||readback.schema!=="geomacro.crypto-news-private-read.v1"||
    !Array.isArray(readback.records)||readback.count!==readback.records.length||
    readback.customer_delivery_authorized!==false||
    readback.commercial_eligible!==false||readback.chargeable!==false)
  throw Error("CRYPTO_INDIVIDUAL_D1_GET_INVALID");
 const recent=new Map(readback.records.map(r=>[r.id,r]));
 const independentlyObserved=receipt.items.filter(({record,record_sha256})=>
   recent.get(record.candidate.id)?.record_sha256===record_sha256).length;
 return {
  schema:"geomacro.crypto-individual-five-part-production-acceptance.v1",
  checked_at:now.toISOString(),source_id:"cryptocompare_news",
  individual_candidates:receipt.items.length,
  d1_five_part_records_verified:verified,
  authenticated_put_exact_readback:true,authenticated_get_verified:true,
  recent_get_matching_records:independentlyObserved,
  recent_get_count:readback.count,requests:calls,retention_hours:72,
  event_claims_verified:0,paid_publication_authorized:false,
  website_intelligence_writes:0,predge_writes:0,signed_gro_generated:false,
  raw_publisher_content_stored:false
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
     process.env.GITHUB_REF!=="refs/heads/main"||
     !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
   throw Error("CRYPTO_INDIVIDUAL_MAIN_ONLY");
  const receipt=JSON.parse(readFileSync(
   "artifacts/direct-corridor-intake/crypto-individual-research.json","utf8"));
  const output=await publishPrivateCryptoIndividualNews({
   receipt,rootToken:process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN
  });
  writeFileSync("artifacts/direct-corridor-intake/crypto-individual-d1-readback.json",
   JSON.stringify(output,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(output));
 }catch(e){console.error("::error::"+String(e?.message??"UNKNOWN").slice(0,110));
  process.exitCode=2;}
}
