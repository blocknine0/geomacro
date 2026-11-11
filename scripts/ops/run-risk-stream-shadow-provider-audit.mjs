#!/usr/bin/env node
/**
 * One-run, isolated provider-backed shadow audit.
 * Requires protected GitHub production environment credentials, but may
 * ONLY mutate named shadow resources. No production D1 migration/Worker edit.
 * GDELT inputs are INDEX_ONLY: no original rights, signing or commercial claim.
 */
import {execFileSync,spawnSync} from "node:child_process";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createHash,createHmac,createPrivateKey,createPublicKey} from "node:crypto";
import {discoverShadowArticles} from "../lib/risk-stream-shadow-discovery.mjs";
import {validateAttesterKeys} from "../lib/risk-stream-shadow-attesters.mjs";
const SHA="39bf93c5a48a187f0653cae9558a99ba71c58792";
const DB="geomacro-risk-stream-shadow",BUCKET="geomacro-risk-stream-shadow-private";
const QUEUE="geomacro-risk-stream-shadow",DLQ="geomacro-risk-stream-shadow-dlq";
const CONFIG="workers/risk-stream-shadow/wrangler.shadow.runtime.jsonc";
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID||"",TOKEN=process.env.CLOUDFLARE_API_TOKEN||"";
const ROOT=process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN||"";
const W="wrangler@4.136.3",kind=process.argv[2]||"";
const hash=v=>createHash("sha256").update(v).digest("hex");
const fail=s=>{throw Error("SHADOW_PROVIDER_HOLD_"+s)};
const ok=(cond,s)=>{if(!cond)fail(s)};
function wrangler(args,{input}={}){
 const r=spawnSync("npx",["-y",W,...args],{
  encoding:"utf8",timeout:110000,input:input??undefined,
  env:process.env,maxBuffer:2*1024*1024});
 if(r.error||r.status!==0){
  const err=String(r.stderr||"").replaceAll(TOKEN,"[MASKED_CF_TOKEN]");
  fail("WRANGLER_"+args.slice(0,3).join("_").replace(/[^A-Za-z0-9_]/g,"_")+
    "_FAILED_"+String(r.status)+"_"+err.slice(-250).replace(/[\r\n]+/g," "));
 }
 return r.stdout;
}
async function cf(method,path,body){
 ok(ACCOUNT.match(/^[a-f0-9]{32}$/iu)&&TOKEN.length>=20,"CLOUDFLARE_IDENTITY_MISSING");
 const response=await fetch("https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+path,{
  method,headers:{Authorization:"Bearer "+TOKEN,Accept:"application/json",
   ...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000),
  redirect:"error",cache:"no-store"});
 const data=await response.json().catch(()=>null);
 if(!response.ok||data?.success!==true)
  fail("CLOUDFLARE_API_"+method+"_"+response.status+"_ERROR");
 return data.result;
}
function secret(name,value){
 ok(typeof value==="string"&&value.length>0,"MISSING_SECRET_"+name);
 wrangler(["secret","put",name,"--config",CONFIG],{input:value});
}
const scoped=purpose=>createHmac("sha256",ROOT).update(
 "geomacro-shadow-risk-stream-20261111/"+purpose).digest();
function runtime(dbId){
 ok(/^[a-f0-9-]{36}$/iu.test(dbId),"SHADOW_D1_ID_INVALID");
 const text=readFileSync("workers/risk-stream-shadow/wrangler.shadow.example.jsonc","utf8")
  .replace(/^\s*\/\/[^\n]*$/gmu,"");
 const cfg=JSON.parse(text);
 ok(cfg.name===DB&&cfg.vars.STREAM_MODE==="SHADOW_AUDIT"&&
  cfg.vars.RISK_STREAM_ACTIVE==="0"&&
  cfg.vars.STREAM_INGESTION_ENABLED==="false"&&
  cfg.d1_databases.length===1&&cfg.d1_databases[0].database_name===DB&&
  cfg.r2_buckets.length===1&&cfg.r2_buckets[0].bucket_name===BUCKET&&
  cfg.queues.producers.length===1&&cfg.queues.producers[0].queue===QUEUE&&
  cfg.queues.consumers.length===1&&
  cfg.queues.consumers[0].queue===QUEUE&&
  cfg.queues.consumers[0].dead_letter_queue===DLQ&&
  !cfg.routes,"CONFIG_NOT_ISOLATED");
 cfg.d1_databases[0].database_id=dbId;
 writeFileSync(CONFIG,JSON.stringify(cfg,null,2),{mode:0o600});
}
async function provision(){
 ok(process.env.GITHUB_REPOSITORY==="blocknine0/geomacro"&&
  process.env.GITHUB_REF==="refs/heads/main","GITHUB_PROTECTED_MAIN_ONLY");
 wrangler(["--version"]);
 const main=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
 ok(/^[a-f0-9]{40}$/u.test(main),"GITHUB_HEAD_INVALID");
 execFileSync("git",["merge-base","--is-ancestor",SHA,"HEAD"]);
 const ids=JSON.parse(wrangler(["d1","list","--json"]));
 ok(Array.isArray(ids),"SHADOW_D1_LIST_INVALID");
 let row=ids.find(x=>x.name===DB);
 if(!row){
  wrangler(["d1","create",DB,"--location","apac"]);
  const after=JSON.parse(wrangler(["d1","list","--json"]));
  row=after.find(x=>x.name===DB);
  console.log("SHADOW_D1_CREATED");
 }else console.log("SHADOW_D1_EXISTS");
 ok(row&&(row.uuid||row.id),"SHADOW_D1_READBACK_MISSING");
 runtime(row.uuid||row.id);
 const bucketList=await cf("GET","/r2/buckets?per_page=1000");
 ok(Array.isArray(bucketList?.buckets),"SHADOW_R2_LIST_INVALID");
 if(!bucketList.buckets.some(x=>x.name===BUCKET)){
  await cf("POST","/r2/buckets",{name:BUCKET});
  console.log("SHADOW_R2_CREATED");
 }else console.log("SHADOW_R2_EXISTS");
 const bucketVerify=await cf("GET","/r2/buckets?per_page=1000");
 ok(bucketVerify.buckets?.some(x=>x.name===BUCKET),"SHADOW_R2_READBACK_FAILED");
 for(const q of [DLQ,QUEUE]){
  const exists=spawnSync("npx",["-y",W,"queues","info",q],{
   env:process.env,encoding:"utf8",timeout:45000});
  if(exists.status!==0){wrangler(["queues","create",q]);console.log("SHADOW_QUEUE_CREATED",q);}
  wrangler(["queues","info",q]);
 }
 for(const file of ["workers/control-plane/migrations/0214_risk_stream_event_driven.sql",
  "workers/risk-stream-shadow/sql/0001_shadow_audit.sql"]){
  wrangler(["d1","execute",DB,"--remote","--config",CONFIG,"--file",file]);
  console.log("SHADOW_MIGRATION_APPLIED",file);
 }
 const check=JSON.parse(wrangler(["d1","execute",DB,"--remote","--json",
  "--config",CONFIG,"--command","SELECT name FROM sqlite_schema WHERE type='table' "+
   "AND name IN ('risk_stream_sources','risk_stream_evidence','risk_stream_signed_gro',"+
   "'risk_stream_delivery_outbox','risk_stream_shadow_audit_receipts') ORDER BY name"]));
 const names=check?.[0]?.results?.map(x=>x.name)??[];
 ok(names.length===5,"SHADOW_D1_SCHEMA_READBACK_FAILED");
 const time=wrangler(["d1","time-travel","info",DB,"--json"]);
 ok(time.includes("bookmark")||time.includes("Bookmark"),"SHADOW_D1_TIME_TRAVEL_UNVERIFIED");
 console.log("SHADOW_D1_TIME_TRAVEL_AND_SCHEMA_VERIFIED");
 ok(ROOT.length>=32,"PROTECTED_ROOT_LEDGER_MISSING");
 const admin=scoped("admin-bearer").toString("hex");
 const aes=scoped("aes256-gcm-key").toString("base64");
 const seed=scoped("gro-ed25519-private-seed");
 const pkcs8=createPrivateKey({key:Buffer.concat([
  Buffer.from("302e020100300506032b657004220420","hex"),seed]),
  format:"der",type:"pkcs8"});
 const groPrivate=pkcs8.export({type:"pkcs8",format:"der"}).toString("base64");
 const groPublic=createPublicKey(pkcs8).export({type:"spki",format:"der"}).toString("base64");
 const attesters=["RISK_STREAM_MACHINE_FACTS_SPKI_B64","RISK_STREAM_MACHINE_RIGHTS_SPKI_B64"];
 let attesterReady=attesters.every(k=>typeof process.env[k]==="string"&&
  Buffer.from(process.env[k],"base64").length===44);
 if(attesterReady)attesterReady=process.env[attesters[0]]!==process.env[attesters[1]];
 if(attesterReady){
  for(const key of attesters)secret(key,process.env[key]);
  console.log("SHADOW_INDEPENDENT_ATTESTER_PUBLIC_KEYS_CONFIGURED");
 }else console.log("SHADOW_ORIGINAL_EVIDENCE_ATTESTER_KEYS_MISSING_HOLD");
 // Do not put any private key, AES material or admin bearer into logs/artifacts.
 const deployReceipt=wrangler(["deploy","--config",CONFIG]);
 const deployedUrl=deployReceipt.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/iu)?.[0];
 ok(!!deployedUrl,"SHADOW_WORKERS_DEV_URL_NOT_VERIFIED");
 for(const [k,v] of [
  ["STREAM_SHADOW_ADMIN_BEARER",admin],["RISK_STREAM_AES256_KEY_B64",aes],
  ["RISK_STREAM_GRO_SIGN_PKCS8_B64",groPrivate],
  ["RISK_STREAM_GRO_VERIFY_SPKI_B64",groPublic]])secret(k,v);
 console.log("SHADOW_ONLY_WORKER_DEPLOYED_NO_CUSTOMER_ROUTES");
 mkdirSync(".shadow-audit",{recursive:true});
 writeFileSync(".shadow-audit/worker-url.txt",deployedUrl+"\n");
 writeFileSync(".shadow-audit/metadata.json",JSON.stringify({
  schema:"geomacro.shadow-provider-provision.v1",source_commit:SHA,
  executed_commit:main,shadow_db:DB,shadow_bucket:BUCKET,shadow_queue:QUEUE,
  shadow_dlq:DLQ,mode:"SHADOW_AUDIT",risk_stream_active:false,
  stream_ingestion_enabled:false,commercial_delivery:false,
  independent_attester_keys:attesterReady,gro_public_spki_b64:groPublic,
  evidence_status:attesterReady?"PENDING_REAL_ORIGINALS":"INDEX_ONLY"
 },null,2));
 console.log("SHADOW_PROVISION_SUCCESS_SAFETY_HOLDS_RETAINED");
}
function parsedDate(s){
 if(typeof s!=="string")return null;
 const m=s.match(/^(\d{4})(\d\d)(\d\d)T?(\d\d)(\d\d)(\d\d)Z?$/u);
 if(!m)return null;
 const t=new Date(m[1]+"-"+m[2]+"-"+m[3]+"T"+m[4]+":"+m[5]+":"+m[6]+"Z");
 return Number.isFinite(t.getTime())?t:null;
}
async function ingest(){
 ok(ROOT.length>=32,"PROTECTED_ROOT_LEDGER_MISSING");
 const rootURL=String(process.env.GEOMACRO_SHADOW_WORKERS_DEV_URL||"");
 ok(/^https:\/\/[a-z0-9.-]+\.workers\.dev$/u.test(rootURL),
  "SHADOW_WORKERS_DEV_HOST_NOT_PROVISIONED");
 const start=new Date();
 const articles=await discoverShadowArticles();
 const seen=new Set(),items=[];
 for(const art of articles){
  if(items.length>=30)break;
  let u;try{u=new URL(art.url)}catch{continue}
  if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
     !/^[a-z0-9.-]{3,253}$/u.test(u.hostname))continue;
  const dt=art.feed_origin==="RSS"?new Date(art.pubDate):parsedDate(art.seendate);
  if(!dt||!Number.isFinite(dt.getTime())||dt>start||start-dt>72*3600_000||
    u.href.length>2048||seen.has(u.href))continue;
  seen.add(u.href);
  const country=Array.isArray(art.countries)?art.countries[0]:null;
  if(!/^[A-Z]{3}$/u.test(country??""))continue;
  const digest=hash(u.href),origin=art.feed_origin==="RSS"?"RSS":"GDELT",
   eventKey=origin+"_"+digest.slice(0,16).toUpperCase();
  const entities=["COUNTRY:"+country,"EVENT:"+digest.slice(0,12).toUpperCase()].sort();
  const sourceId=origin.toLowerCase()+"_"+hash(u.hostname).slice(0,16);
  const fingerprint=hash(JSON.stringify([country,"GEOPOLITICS",eventKey,entities]));
  items.push({schema:"geomacro.risk-stream-candidate.v1",
   kind:"INDEX_ONLY",country_iso3:country,category:"GEOPOLITICS",
   feed_origin:art.feed_origin==="RSS"?"RSS":"GDELT_INDEX",event_key:eventKey,entities,
   event_fingerprint:fingerprint,source_id:sourceId,source_url:u.href,
   publisher_root_domain:u.hostname,parent_media_entity:sourceId,
   source_role:"INDEPENDENT_REGIONAL",published_at:dt.toISOString(),
   // Index-only observation identity hash; NOT original-page hash proof.
   original_page_sha256:hash("INDEX_ONLY_URL_IDENTITY:"+u.href),
   derived:{
    what:"An external news index discovered a country-associated article URL",
    why:"This index item has not passed independent publisher or facts verification",
    market:"No validated market consequence can be inferred from this index hint",
    watch:"Seek independent original publications before creating any risk verdict"},
   proof:null,raw_payload:null});
 }
 ok(items.length>=20&&items.length<=30,"SHADOW_REAL_INDEX_OBSERVATIONS_INSUFFICIENT_"+items.length);
 const admin=scoped("admin-bearer").toString("hex");
 const h={Authorization:"Bearer "+admin,"Content-Type":"application/json"};
 const q=await fetch(rootURL+"/v1/internal/shadow/events",{
  method:"POST",headers:h,redirect:"error",signal:AbortSignal.timeout(30000),
  body:JSON.stringify({schema:"geomacro.risk-stream-ingest-batch.v1",items})});
 const queued=await q.json().catch(()=>null);
 ok(q.status===202&&queued?.accepted===items.length&&
  queued?.commercial_delivery===false,"QUEUE_INGRESS_RECEIPT_MISSING_"+q.status);
 console.log("SHADOW_GDELT_LIVE_INDEX_EVENTS_QUEUED",items.length);
 let rows=[],complete=false;
 for(let n=0;n<36;n++){
  await new Promise(resolve=>setTimeout(resolve,5000));
  const rr=await fetch(rootURL+"/v1/internal/shadow/receipts",{
   headers:h,redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!rr.ok)continue;
  const res=await rr.json().catch(()=>({}));
  rows=(res.rows||[]).filter(x=>Date.parse(x.started_at)>=start.getTime()-3000);
  if(rows.reduce((acc,x)=>acc+x.event_count,0)>=items.length){complete=true;break}
 }
 ok(complete,"SHADOW_QUEUE_D1_RECEIPTS_INCOMPLETE");
 const observed503=rows.reduce((n,x)=>n+x.d1_503_observed,0);
 const submitted=items.length,signed=rows.reduce((n,x)=>n+x.corroborated_and_signed,0);
 const latency=rows.map(x=>x.d1_write_p95_ms).filter(Number.isFinite);
 const report={schema:"geomacro.shadow-live-observation-audit.v1",source_commit:SHA,
  event_source:"REAL_GDELT_OR_RSS_INDEX_ONLY",submitted_events:submitted,
  canonical_batch_receipts:rows.length,acknowledged_events:
   rows.reduce((n,x)=>n+x.event_count,0),
  signed_gro_count:signed,d1_observed_503:observed503,
  max_observed_batch_d1_write_p95_ms:latency.length?Math.max(...latency):null,
  global_d1_write_p95_ms:null,
  zero_503_global_provider_logs_verified:false,
  independent_signed_gro_acceptance:false,private_original_r2_readback:false,
  b2_policy_live_parity_verified:false,commercial_canary_cleared:false,
  status:observed503===0?"INDEX_ONLY_D1_RECEIPTS_PASS_SIGNER_HOLD":"HOLD_503_OBSERVED"};
 mkdirSync(".shadow-audit",{recursive:true});
 writeFileSync(".shadow-audit/live-telemetry.json",JSON.stringify(report,null,2));
 console.log("SHADOW_LIVE_REPORT",JSON.stringify(report));
 if(observed503)fail("REAL_D1_HTTP_503_OBSERVED_"+observed503);
}
try{
 if(kind==="provision")await provision();
 else if(kind==="ingest")await ingest();
 else fail("INVALID_PHASE");
}catch(e){console.error(String(e?.message||e).slice(0,550));process.exitCode=1}
