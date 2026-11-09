#!/usr/bin/env bun
/** Genuine pinned original -> governed B2 PUT+GET -> Shadow D1 ACK -> B2 parity.
 * No real production originals, payments, signing, PREDGE, or canary mutations.
 */
import {createHash} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {collectRegisteredReusableNews} from "../lib/registered-reusable-news-source-collector.mjs";
import {firstPartyOriginalUrl} from "../lib/phase2h-original-metadata.mjs";
import {buildPhase2hPrivateRawRecords} from "../lib/phase2h-raw-original-records.mjs";
import {stageB2FirstPrivateOriginals} from "./phase2h-b2-first-private-raw.mjs";
import {verifyRealShadowB2Parity} from "../lib/d1-step3-real-shadow-proofs.mjs";
import {classifyAuthProbe} from "./sync-step3-shadow-bearer.mjs";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {deriveStatelessSignals} from "../../src/lib/stateless-intelligence-model.ts";

const HEX=/^[a-f0-9]{64}$/u, UUID=/^[a-f0-9-]{36}$/iu;
const NEW="geomacro-step3-shadow.daspallab202391.workers.dev";
const OLD="geomacro-step3-shadow-legacy.daspallab202391.workers.dev";
const PATH="artifacts/release/step3-shadow-real-b2-ack-seed.json";
const fail=code=>{throw Error("STEP3_SHADOW_SEED_"+code)};
const sha=x=>createHash("sha256").update(x).digest("hex");
export function assertScope(e){
 if(e.GITHUB_ACTIONS!=="true"||e.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    e.GITHUB_REF!=="refs/heads/main"||
    e.GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED!=="YES"||
    e.GEOMACRO_D1_SHADOW_TARGET_APPROVED!=="YES"||
    e.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST!==NEW||
    e.GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST!==OLD||
    !/^[a-f0-9]{32}$/iu.test(e.CLOUDFLARE_ACCOUNT_ID??"")||
    !UUID.test(e.D1_DATABASE_ID??"")||
    !UUID.test(e.GEOMACRO_D1_SHADOW_DATABASE_ID??"")||
    e.D1_DATABASE_ID===e.GEOMACRO_D1_SHADOW_DATABASE_ID||
    (e.CLOUDFLARE_API_TOKEN??"").length<20||
    (e.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN??"").length<32||
    e.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    e.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="registered_original_archive"||
    e.B2_REQUEST_BUDGET!=="12"||e.PHASE2H_PROVIDER_MAINTENANCE!=="true"||
    (e.B2_KEY_ID??"").length<12||(e.B2_APPLICATION_KEY??"").length<16||
    (e.B2_ARCHIVE_READ_KEY_ID??"").length<12||
    (e.B2_ARCHIVE_READ_APPLICATION_KEY??"").length<16)
  fail("EXACT_MAIN_SHADOW_AND_GOVERNOR_SCOPE_MISSING");
 return true;
}
async function getJson(url,token,{body=null}={}){
 let res;try{
  res=await fetch(url,{method:body?"POST":"GET",redirect:"error",
   headers:{Authorization:"Bearer "+token,
    ...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),
   signal:AbortSignal.timeout(15000)});
 }catch{fail("UPSTREAM_NETWORK_UNAVAILABLE")}
 if(!res||res.status!==200||res.redirected)fail("UPSTREAM_HTTP_UNVERIFIED");
 try{return await res.json()}catch{fail("UPSTREAM_JSON_INVALID")}
}
async function assertRealShadow(e){
 const base="https://api.cloudflare.com/client/v4/accounts/"+e.CLOUDFLARE_ACCOUNT_ID;
 for(const [id,name] of [
  [e.D1_DATABASE_ID,"geomacro-control-plane"],
  [e.GEOMACRO_D1_SHADOW_DATABASE_ID,"geomacro-d1-publisher-shadow"]
 ]){
  const d=await getJson(base+"/d1/database/"+id,e.CLOUDFLARE_API_TOKEN);
  if(d.success!==true||d.result?.name!==name||
     d.result?.uuid?.toLowerCase()!==id.toLowerCase())
   fail("PROVIDER_D1_UUID_OR_NAME_MISMATCH");
 }
 for(const [name,newWorker] of [
  ["geomacro-step3-shadow",true],["geomacro-step3-shadow-legacy",false]
 ]){
  const d=await getJson(base+"/workers/scripts/"+name+"/settings",
   e.CLOUDFLARE_API_TOKEN);
  const list=d.result?.bindings;
  if(d.success!==true||!Array.isArray(list)||
     list.filter(x=>x.type==="d1"&&x.name==="DB"&&
      x.database_id?.toLowerCase()===
       e.GEOMACRO_D1_SHADOW_DATABASE_ID.toLowerCase()).length!==1)
   fail("REAL_SHADOW_WORKER_BINDING_UNVERIFIED");
  if(newWorker&&list.filter(x=>x.type==="r2_bucket"&&
     x.name==="PHASE2H_PRIVATE_R2"&&
     x.bucket_name===e.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET).length!==1)
   fail("REAL_SHADOW_PRIVATE_R2_BINDING_UNVERIFIED");
  // Persistent preflight: never incur another governed B2 PUT when the
  // exact Shadow workers.dev ingress is disabled. This proves routing
  // metadata, not bearer auth or the underlying news event.
  const route=await getJson(base+"/workers/scripts/"+name+"/subdomain",
   e.CLOUDFLARE_API_TOKEN);
  if(route.success!==true||route.result?.enabled!==true)
   fail("SHADOW_WORKERSDEV_ROUTE_NOT_ENABLED");
 }
}
// Authenticate both existing Shadow inlets before ANY governed B2 write.
// Using an invalid query ensures the proof is free of D1 rows_read/written.
async function assertLiveShadowIngress(e){
 for(const host of [NEW,OLD]){
  let state;
  try{state=await classifyAuthProbe({host,
   token:e.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN})}
  catch(error){
   // Carry only the fixed uppercase diagnostic classification, never an
   // upstream HTTP body, token, host with query parameters, or source text.
   const m=/^STEP3_BEARER_([A-Z0-9_]+)$/u.exec(String(error?.message??""));
   fail("LIVE_INGRESS_"+(m?.[1]??"PROBE_UNCLASSIFIED"));
  }
  if(state!=="AUTHENTICATED")fail("SHADOW_LIVE_BEARER_NOT_AUTHENTICATED");
 }
}
async function readShadow(e,id){
 const url="https://api.cloudflare.com/client/v4/accounts/"+
  e.CLOUDFLARE_ACCOUNT_ID+"/d1/database/"+
  e.GEOMACRO_D1_SHADOW_DATABASE_ID+"/query";
 const d=await getJson(url,e.CLOUDFLARE_API_TOKEN,{body:{
  sql:"SELECT record_id,raw_sha256,raw_json,first_ingested_at,"+
   "b2_object_sha256,b2_archived_at FROM phase2h_private_raw_news "+
   "WHERE record_id=? LIMIT 1",params:[id]
 }});
 if(d.success!==true||d.result?.length!==1||
    d.result[0].success===false||!Array.isArray(d.result[0].results)||
    d.result[0].results.length>1)
  fail("SHADOW_D1_EXACT_QUERY_FAILED");
 return d.result[0].results[0]??null;
}
async function putShadow(e,body){
 let res;try{
  res=await fetch("https://"+NEW+"/v1/internal/phase2h-raw-news",{
   method:"PUT",redirect:"error",
   headers:{Authorization:"Bearer "+e.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN,
    "Content-Type":"application/json"},
   body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 }catch{fail("SHADOW_WORKER_UNAVAILABLE")}
 if(!res||res.redirected)fail("SHADOW_WORKER_UNEXPECTED_REDIRECT");
 if(res.status!==200){
  // Only a machine-safe error code may enter a CI artifact. Never persist
  // response bodies, headers, bearer values or original article payloads.
  let reason="UNCLASSIFIED";
  try{
   const rejected=await res.json();
   if(rejected?.ok===false&&/^[A-Z][A-Z0-9_]{2,90}$/u.test(rejected.error??""))
    reason=rejected.error;
  }catch{/* preserve HTTP status as the truthful diagnostic */}
  fail("SHADOW_WORKER_HTTP_"+res.status+"_"+reason);
 }
 let d;try{d=await res.json()}catch{fail("SHADOW_WORKER_JSON_INVALID")}
 if(d.ok!==true||d.payments!==0)fail("SHADOW_WORKER_RECEIPT_INVALID");
 return d;
}
function assertStored(source,record,b2sha){
 if(source?.record_id!==record.record_id||
    source?.raw_sha256!==record.raw_sha256||
    source?.b2_object_sha256!==b2sha||!HEX.test(b2sha??"")||
    !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(source.b2_archived_at??""))
  fail("B2_ACK_AND_SHADOW_D1_READBACK_DIVERGED");
 let archived;try{archived=JSON.parse(source.raw_json)}catch{fail("RAW_JSON_INVALID")}
 if(archived.record_id!==record.record_id||
    archived.raw_sha256!==record.raw_sha256||
    JSON.stringify(archived.original)!==JSON.stringify(record.original))
  fail("IMMUTABLE_ORIGINAL_DIVERGED");
}
async function seed(){
 const e=process.env,receipt={
  schema:"geomacro.step3.shadow-real-b2-ack-seed.v1",
  status:"NOT_YET_VERIFIED",code:"REAL_SHADOW_SOURCE_NOT_STARTED",
  reviewed_main_sha:e.GITHUB_SHA??null,shadow_only:true,
  production_original_table_mutated:false,
  production_global_b2_quota_ledger_reservations:true,
  source_page_verified:false,independent_event_verified:false,
  commercial_rights_verified:false,merchant_funds_authorized:false,
 };
 try{
  assertScope(e);
  await assertRealShadow(e);
  receipt.real_worker_and_d1_bindings_verified=true;
  // Prevent orphaned B2 objects from a 404 or mismatched Worker auth.
  await assertLiveShadowIngress(e);
  receipt.both_shadow_workers_auth_proven_before_b2=true;
  const candidates=[],ids=new Set(),now=new Date();
  const observed=await collectRegisteredReusableNews({
   now,perCategory:8,normalize:normalizeReusableNewsJson,
   allowRdfNativeDates:true,onOriginalCandidate:raw=>{
    if(candidates.length>=30||!raw||
       !["geopolitics","macro","rare_earth"].includes(raw.category))return;
    let sourceId;try{sourceId=new URL(raw.source_url).hostname}catch{return}
    const c={category:raw.category,title:raw.title,
     articleUrl:raw.article_url,publishedAt:raw.published_at,
     sourceUrl:raw.source_url,sourceId,credit:null};
    if(!firstPartyOriginalUrl(c))return;
    const key=c.category+"\n"+c.articleUrl+"\n"+c.publishedAt;
    if(ids.has(key))return;
    ids.add(key);candidates.push(c);
   },
  });
  receipt.registered_endpoints_checked=observed.summary.completed_source_endpoints;
  receipt.first_party_original_candidates=candidates.length;
  const built=buildPhase2hPrivateRawRecords(candidates,{
   now:new Date(),derive:deriveStatelessSignals});
  const fresh=[...built.records].sort((a,b)=>
   b.original.original_published_at.localeCompare(
    a.original.original_published_at))[0];
  if(!fresh)fail("NO_GENUINE_SOURCE_NATIVE_CLOCK");
  receipt.original_identity_sha256=sha(fresh.record_id);
  const prior=await readShadow(e,fresh.record_id);
  if(prior&&prior.raw_sha256!==fresh.raw_sha256)
   fail("EXISTING_IMMUTABLE_SHA_CONFLICT");
  if(prior?.b2_object_sha256&&prior.b2_archived_at){
   if(Date.now()-Date.parse(prior.first_ingested_at)>69*3600_000)
    fail("EXISTING_ARCHIVED_ORIGINAL_EXPIRED");
   assertStored(prior,fresh,prior.b2_object_sha256);
   const proof=await verifyRealShadowB2Parity({env:e,source:prior});
   if(proof.status!=="PASS_REAL_B2_BYTE_READBACK")
    fail("EXISTING_B2_INDEPENDENT_PARITY_FAILED");
   receipt.existing_genuine_b2_ack_reused=true;
   receipt.independent_b2_full_get_sha_verified=true;
  }else{
   let row=fresh;
   if(prior){
    try{row=JSON.parse(prior.raw_json)}catch{fail("EXISTING_PENDING_JSON_INVALID")}
    if(row.record_id!==fresh.record_id||
       row.raw_sha256!==fresh.raw_sha256||
       JSON.stringify(row.original)!==JSON.stringify(fresh.original))
     fail("EXISTING_PENDING_ORIGINAL_DIVERGED");
   }
   const b2=await stageB2FirstPrivateOriginals({rows:[row],env:e});
   if(b2.status!=="B2_FIRST_GZIP_PUT_TWO_GET_SHA256_VERIFIED"||
      b2.storage_confirmed!==true||b2.record_count!==1)
    fail("B2_GOVERNOR_OR_PHYSICAL_PUT_GET_HELD");
   receipt.b2_put_two_independent_get_sha_verified=true;
   if(!prior){
    const d=await putShadow(e,{schema:"geomacro.phase2h.private-raw-batch.v1",
     items:[row]});
    if(d.schema!=="geomacro.phase2h.private-d1-receipt.v1"||
       d.accepted!==1||d.unchanged!==0||
       d.d1_exact_readback_verified!==true||
       d.per_original_readback_verified!==true||
       d.per_original_verified_count!==1||
       d.all_submitted_five_parts_exact!==true||
       d.per_original_evidence?.[0]?.persisted_raw_sha256!==row.raw_sha256)
     fail("SHADOW_NEW_D1_ORIGINAL_READBACK_INVALID");
    receipt.new_shadow_original_written=true;
   }else receipt.existing_pending_shadow_original_preserved=true;
   const ack=await putShadow(e,{
    schema:"geomacro.phase2h.b2-archive-ack.v1",
    object_sha256:b2.object_sha256,
    items:[{record_id:row.record_id,raw_sha256:row.raw_sha256}],
   });
   if(ack.archived!==1||ack.independent_d1_archive_ack_verified!==true||
      ack.rights_verified!==false)
    fail("ATOMIC_B2_ARCHIVE_ACK_NOT_VERIFIED");
   const persisted=await readShadow(e,row.record_id);
   assertStored(persisted,row,b2.object_sha256);
   const verified=await verifyRealShadowB2Parity({env:e,source:persisted});
   if(verified.status!=="PASS_REAL_B2_BYTE_READBACK")
    fail("INDEPENDENT_B2_PARITY_UNVERIFIED");
   receipt.shadow_b2_ack_readback_verified=true;
   receipt.independent_b2_full_get_sha_verified=true;
  }
  receipt.status="PASS_REAL_SHADOW_B2_ACK_ORIGINAL";
  receipt.code="REAL_B2_PUT_GET_SHADOW_D1_ACK_AND_INDEPENDENT_GET";
 }catch(error){
  const code=String(error?.message??"");
  receipt.code=/^(?:STEP3_SHADOW_SEED_[A-Z0-9_]+|PHASE2H_B2_FIRST_[A-Z0-9_]+|PHASE2H_B2_72H_[A-Z0-9_]+|B2_GLOBAL_DAILY_QUOTA_EXHAUSTED)$/u.test(code)?
   code:"STEP3_SHADOW_SEED_UNKNOWN_PROVIDER_HOLD";
 }finally{
  receipt.completed_at=new Date().toISOString();
  mkdirSync("artifacts/release",{recursive:true,mode:0o700});
  writeFileSync(PATH,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(receipt));
 }
 if(receipt.status!=="PASS_REAL_SHADOW_B2_ACK_ORIGINAL")
  process.exitCode=3;
}
if(import.meta.main)await seed();
