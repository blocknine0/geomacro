#!/usr/bin/env node
/**
 * Step3 physical inventory: bounded Shadow D1 provider metadata, isolated
 * Worker bindings, and private R2 bucket identity. Never touches production.
 * Presence and indexed sample are NOT genuine B2/R2 byte-parity proofs.
 */
import {writeFileSync,mkdirSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

const PINNED_SHADOW_DB="c4add153-229d-412a-b1bd-489526b7e02f";
const PINNED_PRODUCTION_DB="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const PINNED_ACCOUNT="fddd57d28199bad07a768445e7237693";
const NEW_HOST="geomacro-step3-shadow.daspallab202391.workers.dev";
const LEGACY_HOST="geomacro-step3-shadow-legacy.daspallab202391.workers.dev";
const SCHEMA_SQL="SELECT type,name FROM sqlite_schema WHERE name IN ("+
 "'phase2h_private_raw_news','phase2h_raw_object_refs_v1',"+
 "'idx_phase2h_retention_first_ingested','idx_phase2h_ref_ingest_clock_v1',"+
 "'_geomacro_migration_ledger') AND type IN ('table','index') ORDER BY name LIMIT 5";
const MAX_READ_ROWS=1000;
const MAX_QUERY_CALLS=3;
const LIMIT=24;
const fail=code=>{throw Error("STEP3_AUDIT_"+code)};
const passKey=x=>typeof x==="string"&&/^[a-z0-9][a-z0-9-]{2,62}$/u.test(x);
const timeBound=now=>new Date(now.getTime()-70*3600_000).toISOString();

export function assertShadowAuditIdentity(env){
 if(env.GITHUB_REF!=="refs/heads/main"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.CLOUDFLARE_ACCOUNT_ID!==PINNED_ACCOUNT||
    env.D1_DATABASE_ID!==PINNED_PRODUCTION_DB||
    env.GEOMACRO_D1_SHADOW_DATABASE_ID!==PINNED_SHADOW_DB||
    env.GEOMACRO_D1_SHADOW_DATABASE_ID===env.D1_DATABASE_ID||
    env.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST!==NEW_HOST||
    env.GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST!==LEGACY_HOST||
    !passKey(env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET)||
    !passKey(env.GEOMACRO_D1_RECOVERY_R2_BUCKET)||
    env.GEOMACRO_D1_RECOVERY_R2_BUCKET===env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET||
    typeof env.CLOUDFLARE_API_TOKEN!=="string"||
    env.CLOUDFLARE_API_TOKEN.length<20)
  fail("EXACT_SHADOW_ISOLATION_OR_AUTH_UNVERIFIED");
 return true;
}
function acceptableFetchUrl(url){
 return url.startsWith("https://api.cloudflare.com/client/v4/accounts/"+PINNED_ACCOUNT+"/");
}
async function provider(path,{fetchImpl,token,method="GET",sql}={}){
 const url="https://api.cloudflare.com/client/v4/accounts/"+PINNED_ACCOUNT+path;
 if(!acceptableFetchUrl(url))fail("PROVIDER_URL_UNSAFE");
 let response;
 try{
  response=await fetchImpl(url,{method,redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+token,"Cache-Control":"no-store",
    ...(sql?{"Content-Type":"application/json"}:{})},
   ...(sql?{body:JSON.stringify({sql,params:[]})}:{}),
   signal:AbortSignal.timeout(15000)});
 }catch{fail("PROVIDER_REQUEST_UNAVAILABLE")}
 if(!response||response.redirected||response.status<200||response.status>=300)
  fail("PROVIDER_REQUEST_REJECTED");
 let data;try{data=await response.json()}catch{fail("PROVIDER_JSON_INVALID")}
 if(data?.success!==true)fail("PROVIDER_NOT_SUCCESS");
 return data.result;
}
function parseD1Result(data,{maxRows}={}){
 const entries=Array.isArray(data)?data:[data];
 if(entries.length!==1||entries[0]?.success!==true||
    !Array.isArray(entries[0]?.results)||
    entries[0].results.length>maxRows||
    !Number.isSafeInteger(entries[0]?.meta?.rows_read)||
    !Number.isSafeInteger(entries[0]?.meta?.rows_written)||
    entries[0].meta.rows_written!==0||
    entries[0].meta.rows_read<0||
    entries[0].meta.rows_read>MAX_READ_ROWS)
   fail("D1_NATIVE_BILLING_OR_ROW_BOUND_UNVERIFIED");
 return {rows:entries[0].results,rows_read:entries[0].meta.rows_read};
}
function workerName(host){return host.split(".")[0]}
function verifySettings(data,{shadow,bucket,isModern}){
 const bindings=data?.bindings;
 if(!Array.isArray(bindings))fail("WORKER_SETTINGS_MISSING");
 const db=bindings.filter(x=>x.type==="d1"&&x.name==="DB");
 if(db.length!==1||String(db[0].database_id).toLowerCase()!==shadow)
  fail("WORKER_SHADOW_D1_BINDING_UNVERIFIED");
 if(isModern){
  const r2=bindings.filter(x=>x.type==="r2_bucket"&&x.name==="PHASE2H_PRIVATE_R2");
  if(r2.length!==1||r2[0].bucket_name!==bucket)fail("WORKER_PRIVATE_R2_BINDING_UNVERIFIED");
 }
 return "MATCHES_PINNED_SHADOW";
}
export async function auditShadowMetadata({env=process.env,now=new Date(),fetchImpl=fetch}={}){
 const report={schema:"geomacro.step3.shadow-provider-readonly-inventory.v1",
  status:"HOLD",scope:"SHADOW_PROVIDER_METADATA_ONLY",
  production_d1_queries:0,production_mutations:0,shadow_d1_mutations:0,
  r2_puts:0,b2_requests:0,payments:0,worker_deployments:0,
  real_b2_bytes_verified:false,r2_object_readback_verified:false,
  recovery_checkpoint_verified:false,stage1_physical_pass:false,
  inspected_at:now.toISOString(),provider_calls:0,d1_query_calls:0,
  shadow_d1_rows_read:0,shadow_d1_rows_written:0};
 try{
  assertShadowAuditIdentity(env);
  if(!Number.isFinite(now.getTime()))fail("CLOCK_INVALID");
  const token=env.CLOUDFLARE_API_TOKEN;
  const cf=async (path,o={})=>{
   if(report.provider_calls>=10)fail("PROVIDER_CALL_BUDGET_EXCEEDED");
   report.provider_calls++;
   return provider(path,{fetchImpl,token,...o});
  };
  const d1=async (sql,maxRows)=>{
   if(report.d1_query_calls>=MAX_QUERY_CALLS||
      !sql.startsWith("SELECT ")||/;|\b(?:UPDATE|DELETE|INSERT|DROP|ALTER|CREATE|REPLACE|PRAGMA|WITH)\b/iu.test(sql))
    fail("D1_READ_ONLY_SQL_REJECTED");
   report.d1_query_calls++;
   const parsed=parseD1Result(await cf("/d1/database/"+PINNED_SHADOW_DB+"/query",{
    method:"POST",sql}),{maxRows});
   report.shadow_d1_rows_read+=parsed.rows_read;
   if(report.shadow_d1_rows_read>MAX_READ_ROWS)fail("TOTAL_SHADOW_D1_ROW_BUDGET_EXCEEDED");
   return parsed.rows;
  };
  const schema=await d1(SCHEMA_SQL,5);
  const names=new Set(schema.filter(x=>typeof x.name==="string").map(x=>x.name));
  report.shadow_schema={
   raw_news_table:names.has("phase2h_private_raw_news"),
   pointer_table:names.has("phase2h_raw_object_refs_v1"),
   recent_news_index:names.has("idx_phase2h_retention_first_ingested"),
   pointer_index:names.has("idx_phase2h_ref_ingest_clock_v1"),
   step3_ledger:names.has("_geomacro_migration_ledger")};
  report.shadow_schema.readiness=report.shadow_schema.raw_news_table&&
   report.shadow_schema.recent_news_index?"BOUNDED_SOURCE_INSPECTION_POSSIBLE":
   "MISSING_REQUIRED_SHADOW_SCHEMA";
  if(report.shadow_schema.raw_news_table&&report.shadow_schema.recent_news_index){
   const sql="SELECT record_id,b2_object_sha256,b2_archived_at FROM "+
    "phase2h_private_raw_news INDEXED BY idx_phase2h_retention_first_ingested "+
    "WHERE first_ingested_at >= '"+timeBound(now)+"' "+
    "ORDER BY first_ingested_at DESC,record_id DESC LIMIT "+LIMIT;
   const rows=await d1(sql,LIMIT);
   const ack=rows.filter(x=>/^[a-f0-9]{64}$/u.test(x.record_id??"")&&
    /^[a-f0-9]{64}$/u.test(x.b2_object_sha256??"")&&
    typeof x.b2_archived_at==="string");
   report.recent_original_sample={sample_size:rows.length,
    b2_ack_in_bounded_sample:ack.length>0,
    status:ack.length?"CANDIDATE_ACK_METADATA_NOT_PHYSICAL_B2_PROOF":
     "NO_B2_ACK_IN_BOUNDED_RECENT_SAMPLE"};
  }else report.recent_original_sample={status:"NOT_CHECKED_MISSING_INDEX_OR_TABLE"};
  if(report.shadow_schema.pointer_table&&report.shadow_schema.pointer_index){
   const rows=await d1("SELECT record_id,pointer_hmac_sha256 FROM "+
    "phase2h_raw_object_refs_v1 INDEXED BY idx_phase2h_ref_ingest_clock_v1 "+
    "ORDER BY first_ingested_at DESC,record_id DESC LIMIT 1",1);
   report.pointer_sample={has_pointer_metadata:rows.length===1,
    status:rows.length?"PRESENT_NOT_HMAC_VERIFIED":"NO_POINTER_FOUND_IN_INDEXED_TOP1"};
  }else report.pointer_sample={status:"NOT_CHECKED_MISSING_INDEX_OR_TABLE"};
  const namesToCheck=[{name:workerName(NEW_HOST),modern:true},
   {name:workerName(LEGACY_HOST),modern:false}];
  report.shadow_workers=[];
  for(const w of namesToCheck){
   const settings=await cf("/workers/scripts/"+w.name+"/settings");
   report.shadow_workers.push({name:w.name,
    binding:verifySettings(settings,{shadow:PINNED_SHADOW_DB,
     bucket:env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET,isModern:w.modern})});
  }
  report.buckets=[];
  for(const bucket of [env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET,
                       env.GEOMACRO_D1_RECOVERY_R2_BUCKET]){
   const result=await cf("/r2/buckets/"+bucket);
   if(result?.name!==bucket)fail("PRIVATE_R2_BUCKET_IDENTITY_MISMATCH");
   report.buckets.push({name:bucket,metadata_verified:true,
    private_acl_verified:false,object_bytes_verified:false});
  }
  report.status="INVENTORY_COMPLETE_NOT_STAGE1_PASS";
  report.code=report.shadow_schema.readiness==="MISSING_REQUIRED_SHADOW_SCHEMA"?
   "SHADOW_SCHEMA_BOOTSTRAP_REQUIRED":"PHYSICAL_PROOFS_AND_AUTH_READBACK_PENDING";
 }catch(e){
  report.status="HOLD";
  report.code=/^STEP3_AUDIT_[A-Z0-9_]+$/u.test(e?.message??"")?
   e.message:"STEP3_AUDIT_UNEXPECTED_PROVIDER_ERROR";
 }
 return Object.freeze(report);
}
export async function runShadowMetadataAudit(opts={}){
 const result=await auditShadowMetadata(opts);
 const path="artifacts/release/step3-shadow-provider-readonly-inventory.json";
 mkdirSync(resolve(path,".."),{recursive:true,mode:0o700});
 writeFileSync(path,JSON.stringify(result,null,2)+"\n",{mode:0o600});
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const result=await runShadowMetadataAudit();
 console.log(JSON.stringify(result));
 if(result.status!=="INVENTORY_COMPLETE_NOT_STAGE1_PASS")process.exitCode=3;
}
