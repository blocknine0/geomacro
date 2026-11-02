#!/usr/bin/env node
/** After canonical source D1 readbacks, stage EXACT private source-bound Risk Gate
 * evidence packs for the three existing-price variants. No new sales.
 */
import {createHmac} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {buildRiskGateSourcePack,RG_VARIANTS,RG_PRICE_CATALOG}
 from "../../lib/risk-gate-source-pack.mjs";
const ENDPOINT="https://geomacro-control-plane.daspallab202391.workers.dev";
export function riskGatePackFromPrivateSourceReceipts(receipt){
 if(!receipt||receipt.channel!=="CORRIDOR_ONLY"||
  !Array.isArray(receipt.news_candidates)||
  !Array.isArray(receipt.crypto_news_candidates)||
  !Array.isArray(receipt.official_reference_observations))
  throw Error("RG_INTAKE_SOURCE_RECEIPT_INVALID");
 // Deterministic limited evidence sample. Counts reflect ONLY sampled rows.
 // All observed metadata is already persisted by independently verified D1
 // writers in the preceding source-intake steps.
 const refs=[
  ...receipt.news_candidates.slice(0,6).map(r=>({
   id:r.id,kind:"NATIVE_RSS",source_id:r.source_id,source_period:r.published_at
  })),
  ...receipt.crypto_news_candidates.slice(0,6).map(r=>({
   id:r.id,kind:"CRYPTO_INDIVIDUAL",source_id:"cryptocompare_news",
   source_period:r.published_at
  })),
  ...receipt.official_reference_observations.filter(r=>
    // GDELT 15-minute export lengths/indices are transport batch metrics,
    // not country or corridor event evidence for a Risk Gate preflight.
    r.source_id!=="gdelt_v2_15m"&&
    r.metric_id!=="cryptocompare_24h_news_sample_count").slice(0,6).map(r=>({
   id:r.id,kind:"OFFICIAL_REFERENCE",source_id:r.source_id,
   source_period:r.observation_period
  }))
 ];
 return buildRiskGateSourcePack({checked_at:receipt.checked_at,refs});
}
export async function publishRiskGateSourcePacks({
 pack,rootToken,now=new Date(),fetchImpl=fetch,endpoint=ENDPOINT
}={}){
 if(!pack||pack.schema!=="geomacro.risk-gate-source-pack.v1"||
   pack.price_variants?.length!==RG_VARIANTS.length||
   pack.price_variants.some((v,i)=>v.price_variant!==RG_VARIANTS[i]||
     v.pricing_catalog_version!==RG_PRICE_CATALOG||v.eligible_for_quote!==false||
     v.action_decision!==null||v.execution_authorized!==false)||
   typeof rootToken!=="string"||rootToken.trim().length<32||
   typeof fetchImpl!=="function"||endpoint!==ENDPOINT||
   Math.abs(now.getTime()-Date.parse(pack.checked_at))>15*60000)
   throw Error("RG_SOURCE_PACK_PUBLISH_INVALID");
 const bearer=createHmac("sha256",rootToken.trim()).update(
  "geomacro-control-plane-v1").digest("hex");
 let response;
 for(let attempt=0;attempt<5;attempt++){
  try{response=await fetchImpl(endpoint+"/v1/internal/corridor-risk-gate-source-pack",{
   method:"PUT",redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+bearer,"Content-Type":"application/json"},
   body:JSON.stringify(pack),signal:AbortSignal.timeout(15000)
  });}catch{throw Error("RG_SOURCE_PACK_PUT_NETWORK_UNAVAILABLE")}
  if(response.status===200)break;
  if(![404,503].includes(response.status)||attempt===4)
   throw Error("RG_SOURCE_PACK_PUT_HTTP_"+response.status);
  await new Promise(resolve=>setTimeout(resolve,(attempt+1)*5000));
 }
 let written;try{written=await response.json()}catch{throw Error("RG_SOURCE_PACK_D1_ACK_INVALID")}
 if(written.ok!==true||written.verified!==1||
   written.pricing_variant_count!==3||written.three_variant_structure_verified!==true||
   written.reference_rows_crosschecked!==pack.source_refs.length||
   written.canonical_d1_source_provenance_checked!==true||
   written.independent_events_verified!==0||written.signed_gro_generated!==false||
   written.chargeable!==false||written.new_sales_enabled!==false||
   written.execution_authorized!==false||written.retention_hours!==72)
  throw Error("RG_SOURCE_PACK_D1_ACK_INVALID");
 const res=await fetchImpl(endpoint+"/v1/internal/corridor-risk-gate-source-pack?limit=3",{
  method:"GET",redirect:"error",cache:"no-store",
  headers:{Authorization:"Bearer "+bearer},signal:AbortSignal.timeout(15000)
 });
 if(res.status!==200)throw Error("RG_SOURCE_PACK_GET_HTTP_"+res.status);
 let got;try{got=await res.json()}catch{throw Error("RG_SOURCE_PACK_GET_INVALID")}
 if(got.ok!==true||got.count!==got.records?.length||
  got.new_sales_enabled!==false||got.chargeable!==false||
  got.execution_authorized!==false||
  !got.records.some(r=>r.snapshot_id===written.snapshot_id&&
   r.price_variants.length===3&&r.price_variants.every((x,i)=>
    x.variant===RG_VARIANTS[i]&&x.readiness==="EVIDENCE_ONLY_VERIFICATION_REQUIRED")))
  throw Error("RG_SOURCE_PACK_GET_READBACK_MISMATCH");
 return {schema:"geomacro.risk-gate-source-pack-production-acceptance.v1",
  checked_at:now.toISOString(),snapshot_id:written.snapshot_id,
  source_references_crosschecked:pack.source_refs.length,
  price_variants_provisioned:3,d1_put_readback:true,d1_get_readback:true,
  auto_data_creation:true,verified_risk_events:0,signed_gro_generated:false,
  paid_quote_enabled:false,chargeable:false,execution_authorized:false,
  website_intelligence_writes:0,predge_writes:0};
}
/**
 * Run post-source intake. Server selects and verifies the *same* canonical D1
 * data it materializes; the GitHub receipt is not an authoritative snapshot.
 * All authorizations and no-charge boundaries remain as before.
 */
export async function publishCanonicalRiskGateSourcePacks({
 rootToken,fetchImpl=fetch,endpoint=ENDPOINT
}={}){
 if(typeof rootToken!=="string"||rootToken.trim().length<32||
    typeof fetchImpl!=="function"||endpoint!==ENDPOINT)
  throw Error("RG_CANONICAL_SOURCE_INPUT_INVALID");
 const bearer="Bearer "+createHmac("sha256",rootToken.trim())
   .update("geomacro-control-plane-v1").digest("hex");
 let res;
 for(let attempt=0;attempt<5;attempt++){
  try{res=await fetchImpl(endpoint+"/v1/internal/corridor-risk-gate-source-pack",{
   method:"POST",redirect:"error",cache:"no-store",
   headers:{"Authorization":bearer},signal:AbortSignal.timeout(15000)
  });}catch{throw Error("RG_CANONICAL_D1_NETWORK_UNAVAILABLE")}
  if(res.status===200)break;
  if(![404,405,503].includes(res.status)||attempt===4)
   throw Error("RG_CANONICAL_D1_POST_HTTP_"+res.status);
  await new Promise(done=>setTimeout(done,(attempt+1)*5000));
 }
 let body;try{body=await res.json()}catch{throw Error("RG_CANONICAL_D1_ACK_UNPARSEABLE")}
 if(body.ok!==true||body.schema!=="geomacro.risk-gate-source-pack-d1-receipt.v1"||
   body.selection!=="CANONICAL_D1_SOURCE_LOCAL"||body.verified!==1||
   body.pricing_variant_count!==3||body.three_variant_structure_verified!==true||
   !Number.isInteger(body.reference_rows_crosschecked)||body.reference_rows_crosschecked<0||
   body.canonical_d1_source_provenance_checked!==true||
   body.independent_events_verified!==0||body.signed_gro_generated!==false||
   body.chargeable!==false||body.new_sales_enabled!==false||
   body.commercial_eligible!==false||body.execution_authorized!==false||
   body.predge_writes!==0||body.website_intelligence_writes!==0||
   body.retention_hours!==72)
  throw Error("RG_CANONICAL_D1_ACK_INVALID");
 let read;
 try{read=await fetchImpl(endpoint+"/v1/internal/corridor-risk-gate-source-pack?limit=3",{
  method:"GET",redirect:"error",cache:"no-store",
  headers:{"Authorization":bearer},signal:AbortSignal.timeout(15000)
 });}catch{throw Error("RG_CANONICAL_D1_GET_NETWORK_UNAVAILABLE")}
 if(read.status!==200)throw Error("RG_CANONICAL_D1_GET_HTTP_"+read.status);
 let json;try{json=await read.json()}catch{throw Error("RG_CANONICAL_D1_GET_INVALID")}
 if(json.ok!==true||!Array.isArray(json.records)||
   !json.records.some(x=>x.snapshot_id===body.snapshot_id&&
      x.price_variants?.length===RG_VARIANTS.length&&
      x.price_variants.every((v,i)=>v.variant===RG_VARIANTS[i]&&
        v.readiness==="EVIDENCE_ONLY_VERIFICATION_REQUIRED"))||
    json.chargeable!==false||json.new_sales_enabled!==false||
    json.execution_authorized!==false)
  throw Error("RG_CANONICAL_D1_GET_READBACK_MISMATCH");
 return {
  schema:"geomacro.risk-gate-canonical-source-production-acceptance.v1",
  checked_at:new Date().toISOString(),
  snapshot_id:body.snapshot_id,selection:body.selection,
  source_references_crosschecked:body.reference_rows_crosschecked,
  source_classes:body.source_classes,priced_variants_prepared:3,
  canonical_d1_put_readback:true,canonical_d1_get_readback:true,
  verified_events:0,signed_gro_generated:false,paid_quote_enabled:false,
  credits_debited:0,chargeable:false,execution_authorized:false,
  predge_writes:0,website_intelligence_writes:0
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
     process.env.GITHUB_REF!=="refs/heads/main"||
     !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
   throw Error("RG_SOURCE_PACK_MAIN_ONLY");
  const source=JSON.parse(readFileSync(
   "artifacts/direct-corridor-intake/receipt.json","utf8"));
  const pack=riskGatePackFromPrivateSourceReceipts(source);
  writeFileSync("artifacts/direct-corridor-intake/risk-gate-source-pack.json",
   JSON.stringify(pack,null,2)+"\n",{mode:0o600});
  const result=await publishCanonicalRiskGateSourcePacks({
   rootToken:process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN
  });
  writeFileSync("artifacts/direct-corridor-intake/risk-gate-source-d1-readback.json",
   JSON.stringify(result,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(result));
 }catch(e){console.error("::error::"+String(e?.message??"RG_UNKNOWN").slice(0,110));
  process.exitCode=2}
}
