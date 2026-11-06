#!/usr/bin/env node
/**
 * Five-gate live acceptance; emit FAIL for missing evidence, never a dummy PASS.
 * No raw publisher text, key, response body or personal question is logged.
 * One optional bounded idempotent redrive and one approved D1 cache canary.
 */
import {createHash,createHmac,createPublicKey,verify as edVerify} from "node:crypto";
import {readFileSync} from "node:fs";
import {readAsk,readPublishedBuild} from "./verify-live-free-groq-ask.mjs";
const WORKER=String(process.env.GEOMACRO_CONTROL_PLANE_URL||
 "https://geomacro-control-plane.daspallab202391.workers.dev").replace(/\/+$/,"");
const SITE="https://geomacro.live";
const OWNER=String(process.env.CONTROL_PLANE_TOKEN??"");
const SHA=/^[a-f0-9]{64}$/;
const REQ_TIMEOUT=12000;
const sha=s=>createHash("sha256").update(s).digest("hex");
const sorted=v=>v===null||typeof v!=="object"?JSON.stringify(v):
 Array.isArray(v)?"["+v.map(sorted).join(",")+"]":
 "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+sorted(v[k])).join(",")+"}";
const checks=[];
function gate(name,pass,code,details={}){
 checks.push({name,status:pass?"PASS":"FAIL",code,...details});
}
async function call(path,{method="GET",body=null,token=null}={}){
 const headers={Accept:"application/json"};
 if(token)headers.Authorization="Bearer "+token;
 if(body!==null)headers["Content-Type"]="application/json";
 const r=await fetch(WORKER+path,{method,headers,body:body===null?undefined:JSON.stringify(body),
    redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(REQ_TIMEOUT)});
 if(r.redirected||r.status>=300&&r.status<400)throw Error("UNTRUSTED_REDIRECT");
 const data=await r.text();
 if(data.length>500000)throw Error("RESPONSE_OVERSIZED");
 return {status:r.status,headers:r.headers,json:JSON.parse(data)};
}
async function reviewedIndices(){
 const [r,k]=await Promise.all([
   call("/v1/public/reviewed-risk-indices"),
   call("/v1/public/risk-gate-decision-key")]);
 if(r.status!==200||k.status!==200||
    r.json.ok!==true||k.json.ok!==true)return false;
 const p=r.json.signed_payload;
 if(p?.schema!=="geomacro.reviewed-indices-issuer-delivery.v1"||
    p.reviewer_source!=="EXISTING_PROTECTED_GRI_V1_2_PUBLISHER"||
    p.signature_proves!=="ISSUER_DELIVERY_INTEGRITY_NOT_REVIEWER_IDENTITY"||
    r.json.signature_scheme!=="Ed25519"||
    k.json.scheme!=="Ed25519"||
    k.json.key_id!==r.json.signature_key_id||
    r.headers.get("x-geomacro-signature")!==r.json.signature_b64||
    r.headers.get("x-geomacro-payload-sha256")!==r.json.payload_sha256)
    return false;
 const key=createPublicKey({key:Buffer.from(k.json.public_key_spki_b64,"base64"),
   type:"spki",format:"der"});
 if(key.asymmetricKeyType!=="ed25519")return false;
 const bytes=Buffer.from(sorted(p));
 if(sha(bytes)!==r.json.payload_sha256||
    !edVerify(null,bytes,key,Buffer.from(r.json.signature_b64,"base64")))
    return false;
 const at=Date.parse(p.source_as_of),expiry=Date.parse(p.expires_at);
 const d=p.data;
 if(!Number.isFinite(at)||Date.now()-at>3600000||
    !Number.isFinite(expiry)||expiry<=Date.now()||
    d?.proofScope!=="verified-category-projection"||
    d?.parentMethodologyVersion!=="gri-v1.2.0"||
    !Array.isArray(d.indices)||d.indices.length!==3)return false;
 const cats=new Set(["geopolitics","macro","critical_minerals"]);
 for(const i of d.indices){
   if(!cats.delete(i.key)||i.status!=="available"||
      typeof i.score!=="number"||i.score<0||i.score>100)return false;
 }
 return cats.size===0;
}
async function d1Cache(){
 const apiKey=String(process.env.GROQ_API_KEY_FOR_ASK_CACHE??process.env.GROQ_API_KEY??"");
 if(apiKey.length<20)return {pass:false,reason:"GROQ_EXISTING_SECRET_UNAVAILABLE"};
 const token=createHmac("sha256",apiKey).update("geomacro-ask-public-model-cache-v1").digest("hex");
 const key=sha("hot50-no-funds-canary|"+String(process.env.GITHUB_RUN_ID??"local")+
   "|"+Date.now());
 const endpoint="/v1/internal/ask/public-model-cache";
 const get=()=>call(endpoint+"?key="+key,{token});
 const miss=await get();
 if(miss.status!==200||miss.json.ok!==true||miss.json.hit!==false)
   return {pass:false,reason:"D1_CACHE_COLD_MISS_UNPROVEN"};
 const fields={summary:"Inflation describes a general rise in prices.",
 what_changed:"This statement is timeless, not a current news release.",
 why_it_matters:"Higher prices can reduce purchasing power.",
 geomacro_view:"Compare official measures over equivalent periods."};
 const put=await call(endpoint,{method:"PUT",token,body:{
  key,fields,expires_at:Math.floor(Date.now()/1000)+300}});
 if(put.status!==200||put.json.ok!==true||put.json.stored!==true)
   return {pass:false,reason:"D1_CACHE_WRITE_UNPROVEN"};
 const hit=await get();
 if(hit.status!==200||hit.json.hit!==true||
   sorted(hit.json.fields)!==sorted(fields))
   return {pass:false,reason:"D1_CACHE_HIT_READBACK_UNPROVEN"};
 return {pass:true,reason:"EXACT_COLD_MISS_WRITE_HIT"};
}
async function providerQueueDepth(){
 const account=String(process.env.CLOUDFLARE_ACCOUNT_ID??"");
 const token=String(process.env.CLOUDFLARE_API_TOKEN??"");
 if(!/^[a-f0-9]{32}$/i.test(account)||token.length<25)
  return {verified:false,reason:"PROTECTED_CLOUDFLARE_QUEUE_METADATA_UNAVAILABLE"};
 const api="https://api.cloudflare.com/client/v4/accounts/"+account+"/queues";
 async function read(url){
  const r=await fetch(url,{method:"GET",redirect:"manual",
    headers:{Authorization:"Bearer "+token,Accept:"application/json"},
    signal:AbortSignal.timeout(9000)});
  if(r.status!==200||r.redirected)throw Error("PROVIDER_QUEUES_HTTP");
  const text=await r.text();if(text.length>100000)throw Error("PROVIDER_QUEUES_OVERSIZED");
  const data=JSON.parse(text);
  if(data?.success!==true)throw Error("PROVIDER_QUEUES_DENIED");
  return data;
 }
 const list=await read(api+"?per_page=100");
 if(list.result_info?.total_pages!==1||!Array.isArray(list.result))
  return {verified:false,reason:"PROVIDER_QUEUES_PAGINATION_INCOMPLETE"};
 const names=["geomacro-ingestion-spool","geomacro-ingestion-dead-letter",
   "geomacro-source-poll","geomacro-source-poll-dlq"];
 const refs=names.map(name=>list.result.find(q=>q.queue_name===name));
 if(refs.some(x=>!x||!/^[a-f0-9]{32}$/i.test(x.queue_id??"")))
  return {verified:false,reason:"PROVIDER_QUEUES_MISSING"};
 const readings=[];
 for(const ref of refs){
  const answer=await read(api+"/"+ref.queue_id+"/metrics");
  const count=answer?.result?.backlog_count;
  if(!Number.isSafeInteger(count)||count<0)
   return {verified:false,reason:"PROVIDER_BACKLOG_METRICS_INVALID"};
  readings.push({name:ref.queue_name,backlog:count});
 }
 return {verified:true,zero:readings.every(x=>x.backlog===0),
  readings,reason:"CLOUDFLARE_FOUR_QUEUES_BEST_EFFORT_SNAPSHOT"};
}
async function main(){
 let census=null,redrive=null;
 if(!SHA.test(OWNER)){gate("Backlog Census",false,"OWNER_TOKEN_UNAVAILABLE");
   gate("Hot 50 Coverage",false,"OWNER_TOKEN_UNAVAILABLE");}
 else {
   try {
     if(process.env.ACTIVATION_RUN_IDEMPOTENT_REDRIVE==="1"){
       const q=await call("/v1/internal/activation/redrive",{
        method:"POST",token:OWNER});
       redrive={status:q.status,outbox:q.json?.outbox?.status,
         fifo:q.json?.fifo?.status};
     }
     const result=await call("/v1/internal/activation/hot50-census",{token:OWNER});
     if(result.status!==200||result.json.ok!==true)throw Error("D1_COMPLETE_CENSUS_UNAVAILABLE");
     census=result.json;
     const b=census.backlog;
     let provider={verified:false,reason:"PROVIDER_METRIC_NOT_CHECKED"};
     try{provider=await providerQueueDepth()}catch{
       provider={verified:false,reason:"PROVIDER_METRIC_TRANSPORT_UNAVAILABLE"}}
     const zero=Number.isSafeInteger(b?.total_unhandled)&&b.total_unhandled===0&&
       b.exact_bundle_journal_mismatch===0&&provider.verified===true&&provider.zero===true;
     gate("Backlog Census",zero,
       zero?"D1_ZERO_AND_FOUR_QUEUE_BEST_EFFORT_ZERO":"UNHANDLED_OR_PROVIDER_QUEUE_NOT_PROVEN",
       {total_unhandled:b?.total_unhandled??null,
        provider_queue_backlog:b?.provider_queue_backlog??null,
        four_queue_metrics_verified:provider.verified===true,
        cloudflare_queues:provider.readings??[],
        provider_metrics_are_best_effort:true});
     const c=census.coverage;
     gate("Hot 50 Coverage",c?.complete_metadata_coverage===true&&
       c?.original_dated_cells===150&&c?.multi_publisher_cells===150,
       "MISSING_72H_ORIGINAL_OR_SAME_EVENT_CORROBORATION",
       {cells:c?.cells?.length??null,empty:c?.empty_cells??null,
        native_original:c?.original_dated_cells??null,
        two_publishers:c?.multi_publisher_cells??null,
        reviewer_certification_not_inferred:true});
   }catch(e){
     gate("Backlog Census",false,"CENSUS_HTTP_OR_SCHEMA_UNAVAILABLE");
     gate("Hot 50 Coverage",false,"COVERAGE_HTTP_OR_SCHEMA_UNAVAILABLE");
   }
 }
 // Full physical B2 listing + every GET+decrypt SHA is a separate budgeted
 // audit. A file can be supplied ONLY by that script, never manually marked.
 let parity=false;
 try{
   const path=String(process.env.B2_PARITY_VERIFIED_RECEIPT_JSON??"");
   if(path){
     const b=JSON.parse(readFileSync(path,"utf8"));
     parity=b.schema==="geomacro.hot50-storage-readback.v1"&&
       b.status==="PASS"&&b.bidirectional_parity_pass===true&&
       b.ingestion_zero_pending_pass===true&&
       b.checked_archived_bundles===b.d1_archived;
   }
 }catch{}
 gate("B2-D1 Parity",parity,parity?"PHYSICAL_B2_AND_D1_READBACK_VERIFIED":
   "FULL_B2_LIST_GET_SHA_AND_D1_PARITY_NOT_PROVEN");
 let cert=false;try{cert=await reviewedIndices()}catch{}
 gate("Index Signing",cert,cert?"THREE_CURRENT_REVIEWED_ED25519_SIGNED":
   "AUTHENTIC_CURRENT_REVIEWED_THREE_INDEX_PROOF_UNAVAILABLE");
 let cache={pass:false,reason:"D1_CACHE_NOT_CHECKED"},site=null;
 try{cache=await d1Cache()}catch{cache={pass:false,reason:"D1_CACHE_RUNTIME_ERROR"}}
 let ask=false;
 if(process.env.ACTIVATION_ALLOW_MODEL_PROBE==="1"){
   try{
     const build=await readPublishedBuild(SITE);
     const test=await readAsk(SITE,"What is inflation?");
     const second=await readAsk(SITE,"What is inflation?");
     const expected=String(process.env.GITHUB_SHA??"");
     ask=build.status==="VALID"&&/^[a-f0-9]{40}$/.test(expected)&&
       build.sha===expected&&test.rendering==="assisted"&&
       second.cache==="hit"&&second.scope==="distributed";
     site={model_assisted:test.rendering==="assisted",model_cache:second.cache,
       cache_scope:second.scope,published_sha_valid:build.status==="VALID",
       deployed_exact_head_verified:build.sha===expected};
   }catch{ask=false}
 }
 gate("Ask GeoMacro Retrieval",cache.pass&&ask,
  cache.pass&&ask?"D1_CACHE_MISS_HIT_AND_GROQ_REUSED":
  cache.pass?"D1_CACHE_HIT_MISS_PASS_GROQ_LIVE_NOT_PROVEN":
    cache.reason,{cache_miss_hit_verified:cache.pass,live_model:site});
 const pass=checks.every(x=>x.status==="PASS");
 console.log(JSON.stringify({schema:"geomacro.hot50-production-acceptance.v1",
  status:pass?"PASS":"FAIL",head_sha:process.env.GITHUB_SHA??null,
  redrive,checks,no_funds:true,groq_architecture_unchanged:true,
  certification_never_synthesized:true}));
 if(!pass)process.exitCode=2;
}
main().catch(e=>{
 console.error(JSON.stringify({status:"FAIL",code:"UNEXPECTED_ACCEPTANCE_ERROR",
  no_funds:true,certification_synthesized:false}));process.exitCode=2;
});
