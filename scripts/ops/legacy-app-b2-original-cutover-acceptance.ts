#!/usr/bin/env bun
/**
 * Protected, source-free, application-level B2 original reader acceptance.
 * Never uses Supabase URLs, Auth, Postgres, credentials or any customer requests.
 * Tests the actual app reader for both original Storage buckets; no public raw data.
 */
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";
import {readOldSupabaseStorageOriginal,originalStorageSelector} from "../../src/lib/legacy-storage-b2-original.server.ts";

const PREFIX="geomacro-evidence/v1/legacy-supabase-safe-exit/storage/";
const BUCKET="geomacro-private-archive";
const ENDPOINT="https://s3.us-east-005.backblazeb2.com";
const REF="ldpwajisioljyjtojvfx";
const EXPECTED_PREFIX="5eff883cadf814cd";
const sha=v=>createHash("sha256").update(v).digest("hex");
const dir=mkdtempSync(join(tmpdir(),"geomacro-live-app-read-"));
const out="artifacts/legacy-exit/app-b2-origin-free-read-acceptance.json";
const status={schema:"geomacro.legacy-application-b2-origin-free-read-acceptance.v1",
 checked_at:new Date().toISOString(),status:"BLOCKED_NO_DELETION",
 supabase_credentials_present:false,supabase_network_requests:0,
 application_original_reader_independent_originals_verified:0,
 original_intelligence_bytes_verified:false,original_avatar_bytes_verified:false,
 customer_identity_cutover_verified:false,protected_runtime_secrets_cutover_verified:false,
 legacy_edge_caller_cutover_verified:false,old_supabase_deletion_authorized:false,
 source_mutations:0,b2_puts:0,b2_deletes:0,real_money_transactions:0};
function result(reason){status.reason=reason;mkdirSync("artifacts/legacy-exit",{recursive:true});
 writeFileSync(out,JSON.stringify(status,null,2)+"\n",{mode:0o600});console.log(JSON.stringify(status))}
function stop(code){result(code);process.exitCode=3}
const requiredEmpty=["SUPABASE_URL","APP_SUPABASE_URL","SUPABASE_DB_URL",
 "SUPABASE_SERVICE_ROLE_KEY","APP_SUPABASE_SERVICE_ROLE_KEY","SUPABASE_ACCESS_TOKEN",
 "SUPABASE_ANON_KEY","APP_SUPABASE_ANON_KEY","APP_SUPABASE_JWT_SECRET"];
function aws(args,opts={}) {
 const p=spawnSync("aws",["--endpoint-url",ENDPOINT,"s3api",...args],{
  env:{...process.env,AWS_ACCESS_KEY_ID:opts.id,
   AWS_SECRET_ACCESS_KEY:opts.key,AWS_DEFAULT_REGION:"us-east-005",
   AWS_MAX_ATTEMPTS:"1",AWS_EC2_METADATA_DISABLED:"true"},
  encoding:"utf8",timeout:120000,maxBuffer:24_000_000,stdio:["ignore","pipe","pipe"]});
 return p.status===0&&!p.error?p.stdout:null;
}
async function main(){
 if(requiredEmpty.some(x=>Boolean(process.env[x])))return stop("SUPABASE_CREDENTIALS_MUST_BE_ABSENT");
 if(process.env.NODE_ENV!=="production"||
  process.env.GEOMACRO_SUPABASE_RUNTIME_MODE!=="standby"||
  process.env.GEOMACRO_LEGACY_B2_COLD_READ!=="enabled")return stop("PRODUCTION_STANDBY_SOURCE_FREE_MODE_REQUIRED");
 if(!process.env.B2_KEY_ID||!process.env.B2_APPLICATION_KEY||
  !process.env.B2_LEGACY_INVENTORY_KEY_ID||
  !process.env.B2_LEGACY_INVENTORY_APPLICATION_KEY||
  !process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID||
  !process.env.D1_DATABASE_ID)return stop("B2_D1_PRIVATE_RUNTIME_MISSING");
 const governor=createB2D1AccountGovernor({env:{
  ...process.env,B2_ACCOUNT_QUOTA_WORKFLOW_ID:"legacy_app_b2_cutover_acceptance"}});
 const q=await governor.status().catch(()=>null);
 // 1 index read from AWS and 3 read calls per selected original (index,marker,tar).
 if(!q?.ok||q.used.GET+7>q.limits.GET-4||
    q.used.total+7>q.limits.total-7||q.used.NATIVE_AUTH+2>q.limits.NATIVE_AUTH)
  return stop("B2_PROTECTED_ACCOUNT_QUOTA_HEADROOM_REQUIRED");
 const listing=aws(["list-objects-v2","--bucket",BUCKET,"--prefix",PREFIX+"complete-",
   "--output","json"],{id:process.env.B2_LEGACY_INVENTORY_KEY_ID,
    key:process.env.B2_LEGACY_INVENTORY_APPLICATION_KEY});
 let keys;try{keys=JSON.parse(listing??"null").Contents?.map(x=>x.Key)}
 catch{return stop("B2_CERTIFIED_COMPLETE_INDEX_LIST_UNREADABLE")}
 if(!Array.isArray(keys)||keys.length!==1||
  !/^geomacro-evidence\/v1\/legacy-supabase-safe-exit\/storage\/complete-[a-f0-9]{24}\.json$/.test(keys[0]))
  return stop("B2_CERTIFIED_SINGLE_COMPLETE_INDEX_REQUIRED");
 // Reserve every GET prior to network operations, including the six calls made
 // by the actual application B2 reader. NATIVE_AUTH contingency reserved twice.
 try{for(let i=0;i<7;i++)await governor.reserve("GET");
  for(let i=0;i<2;i++)await governor.reserve("NATIVE_AUTH")}
 catch{return stop("GLOBAL_B2_RESERVED_REQUEST_BUDGET_EXHAUSTED")}
 const archive=join(dir,"complete-index.json");
 if(aws(["get-object","--bucket",BUCKET,"--key",keys[0],archive,"--output","json"],
  {id:process.env.B2_KEY_ID,key:process.env.B2_APPLICATION_KEY})===null||
  !existsSync(archive))return stop("B2_CERTIFIED_COMPLETE_INDEX_GET_FAILED");
 const buf=readFileSync(archive);
 const digest=sha(buf);
 if(!digest.startsWith(EXPECTED_PREFIX))return stop("B2_INDEX_INDEPENDENTLY_ATTESTED_ROOT_MISMATCH");
 let index;try{index=JSON.parse(buf.toString("utf8"))}
 catch{return stop("B2_CERTIFIED_COMPLETE_INDEX_INVALID")}
 if(index.schema!=="geomacro.legacy-storage-complete-restore-index.v1"||
   index.source_project!==REF||index.verified_shards!==4||
   index.object_count!==23648||index.total_bytes!==57459939||
   !Array.isArray(index.objects)||index.objects.length!==23648)
  return stop("B2_INDEPENDENT_INDEX_SOURCE_ROSTER_PARITY_INVALID");
 const avatars=index.objects.filter(x=>x.bucket==="testnet-tester-avatars");
 const chosenAvatar=avatars[0];
 const chosenFragment=index.objects.find(x=>x.bucket==="geomacro-live-intelligence" &&
  x.archive_key===chosenAvatar?.archive_key);
 if(avatars.length!==4||!chosenAvatar||!chosenFragment)
  return stop("APP_TWO_BUCKET_SAME_SHARD_ORIGINALS_UNAVAILABLE");
 // The root digest is discovered from the independently source-free, known-root
 // B2 index, never supplied by Supabase or an unauthenticated user.
 process.env.GEOMACRO_LEGACY_B2_COMPLETE_INDEX_KEY=keys[0];
 process.env.GEOMACRO_LEGACY_B2_COMPLETE_INDEX_SHA256=digest;
 for(const x of [chosenFragment,chosenAvatar]){
  if(!/^[a-f0-9]{64}$/.test(x.sha256)||!Number.isSafeInteger(x.size)||
   !originalStorageSelector(x.bucket,x.name))return stop("APP_ORIGINAL_ENTRY_INVALID");
  let bytes;
  try{bytes=await readOldSupabaseStorageOriginal(x.bucket,x.name)}
  catch{return stop("ACTUAL_APPLICATION_PRIVATE_B2_READER_UNAVAILABLE")}
  if(bytes.length!==x.size||sha(bytes)!==x.sha256)
   return stop("ACTUAL_APPLICATION_ORIGINAL_BYTE_DIGEST_MISMATCH");
  status.application_original_reader_independent_originals_verified++;
  if(x.bucket==="testnet-tester-avatars")status.original_avatar_bytes_verified=true;
  else status.original_intelligence_bytes_verified=true;
 }
 if(status.application_original_reader_independent_originals_verified!==2||
  !status.original_intelligence_bytes_verified||!status.original_avatar_bytes_verified)
  return stop("APP_READ_TWO_BUCKET_ACCEPTANCE_FAILED");
 status.status="APPLICATION_B2_ORIGINAL_READER_BOTH_BUCKETS_VERIFIED";
 result("LIVE_CUSTOMER_AUTH_AND_EDGE_CALLER_MIGRATION_STILL_REQUIRED");
}
try{await main()}catch{stop("APP_SOURCE_FREE_ACCEPTANCE_FAILED_CLOSED")}
finally{rmSync(dir,{recursive:true,force:true})}
