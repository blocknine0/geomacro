#!/usr/bin/env node
// Verify that two OLD private Supabase Storage originals are RESTORABLE
// using only private B2, without ANY Supabase API, DB or project credential.
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";

const env=process.env;
const PREFIX="geomacro-evidence/v1/legacy-supabase-safe-exit/storage/";
const B2_BUCKET="geomacro-private-archive";
const ENDPOINT="https://s3.us-east-005.backblazeb2.com";
const VERIFIED_ROOT_HASH_PREFIX="5eff883cadf814cd";
const dir=mkdtempSync(join(tmpdir(),"geomacro-old-b2-canary-"));
const path="artifacts/legacy-exit/legacy-b2-origin-free-recovery-canary.json";
const hash=x=>createHash("sha256").update(x).digest("hex");
const receipt={schema:"geomacro.legacy-b2-origin-free-restore-canary.v1",
  checked_at:new Date().toISOString(),source_project:"ldpwajisioljyjtojvfx",
  source_supabase_network_requests:0,source_supabase_writes:0,
  source_supabase_deletes:0,b2_writes:0,b2_deletes:0,payments:0,
  private_object_paths_exposed:false,customer_data_exposed:false,
  b2_independent_original_bucket_canaries_verified:0,
  old_supabase_deletion_authorized:false,
  status:"BLOCKED_NO_DELETION"};
function emit(reason){
 receipt.reason=reason;
 mkdirSync("artifacts/legacy-exit",{recursive:true});
 writeFileSync(path,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(receipt));
}
function block(s){emit(s);process.exitCode=3}
function call(cmd,args,auth={},maxBuffer=3_000_000,timeout=120000,encoding="utf8"){
 const r=spawnSync(cmd,args,{cwd:process.cwd(),env:{...env,...auth},
  encoding,maxBuffer,timeout,stdio:["ignore","pipe","pipe"]});
 return r.status===0&&!r.error?r.stdout:null;
}
function credentials(id,key){return{
 AWS_ACCESS_KEY_ID:id,AWS_SECRET_ACCESS_KEY:key,
 AWS_DEFAULT_REGION:"us-east-005",AWS_EC2_METADATA_DISABLED:"true",
 AWS_MAX_ATTEMPTS:"1",AWS_RETRY_MODE:"standard"}}
function aws(args,creds,max=10_000_000){return call("aws",
 ["--endpoint-url",ENDPOINT,"s3api",...args],creds,max,300000)}
async function main(){
 for(const key of ["B2_KEY_ID","B2_APPLICATION_KEY","B2_LEGACY_INVENTORY_KEY_ID",
  "B2_LEGACY_INVENTORY_APPLICATION_KEY","CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID","D1_DATABASE_ID"]){
  if(!env[key])return block("PRIVATE_B2_READ_ONLY_RECOVERY_CONFIG_INCOMPLETE");
 }
 // Explicitly no Supabase tokens, source URL, management API or postgres URL.
 const gov=createB2D1AccountGovernor({env:{
   ...env,B2_ACCOUNT_QUOTA_WORKFLOW_ID:"legacy_b2_origin_free_read"}});
 let quota;try{quota=await gov.status()}catch{return block("SHARED_B2_D1_QUOTA_UNAVAILABLE")}
 // One certified private index GET and ONE shared shard GET. Two independent
 // bucket originals chosen from the SAME already-verified B2 tar shard.
 if(!quota.ok||quota.used.GET+2>quota.limits.GET-5||
   quota.used.total+2>quota.limits.total-6)
  return block("SHARED_B2_ORIGIN_FREE_READ_QUOTA_RESERVED");
 const readCred=credentials(env.B2_LEGACY_INVENTORY_KEY_ID,
  env.B2_LEGACY_INVENTORY_APPLICATION_KEY);
 const writerCred=credentials(env.B2_KEY_ID,env.B2_APPLICATION_KEY);
 const list=aws(["list-objects-v2","--bucket",B2_BUCKET,"--prefix",
  PREFIX+"complete-","--output","json"],readCred);
 let roots;try{roots=(JSON.parse(list??"null").Contents||[]).map(x=>x.Key)}
 catch{return block("CERTIFIED_PRIVATE_INDEX_DISCOVERY_FAILED")}
 if(roots?.length!==1||
   !/^geomacro-evidence\/v1\/legacy-supabase-safe-exit\/storage\/complete-[a-f0-9]{24}\.json$/.test(roots[0]))
  return block("UNIQUE_CERTIFIED_PRIVATE_INDEX_NOT_FOUND");
 try{await gov.reserve("GET")}catch{return block("B2_ORIGIN_FREE_INDEX_GET_RESERVATION_DENIED")}
 const indexPath=join(dir,"complete.json");
 if(aws(["get-object","--bucket",B2_BUCKET,"--key",roots[0],
  indexPath,"--output","json"],writerCred)===null||
  !existsSync(indexPath))return block("B2_ORIGIN_FREE_PRIVATE_INDEX_GET_FAILED");
 const bytes=readFileSync(indexPath);
 if(hash(bytes).slice(0,16)!==VERIFIED_ROOT_HASH_PREFIX)
  return block("B2_ORIGIN_FREE_INDEX_HASH_NOT_PREVIOUSLY_CERTIFIED");
 let index;try{index=JSON.parse(bytes.toString("utf8"))}
 catch{return block("B2_ORIGIN_FREE_INDEX_FORMAT_INVALID")}
 if(index.schema!=="geomacro.legacy-storage-complete-restore-index.v1"||
    index.source_project!=="ldpwajisioljyjtojvfx"||
    index.verified_shards!==4||index.object_count!==23648||
    index.total_bytes!==57459939||index.objects?.length!==23648)
   return block("B2_ORIGIN_FREE_INDEX_RESTORE_SET_MISMATCH");
 // Read the OLD image bucket's verified member, then select an intelligence
 // member from that SAME immutable B2 bundle. Each shard contains thousands
 // of intelligence objects and the bundle's source-original SHA manifest
 // already passed full per-member independent restoration.
 const avatar=index.objects.find(x=>x.bucket==="testnet-tester-avatars");
 const intel=avatar?index.objects.find(x=>x.bucket==="geomacro-live-intelligence"&&
   x.archive_key===avatar.archive_key):null;
 const originals=[avatar,intel];
 if(!avatar||!intel||avatar.archive_key!==intel.archive_key)
   return block("SAME_VERIFIED_SHARD_TWO_BUCKET_CANARY_UNAVAILABLE");
 if(originals.some(x=>!x||!Number.isSafeInteger(x.size)||
  x.size<1||x.size>26214400||!/^[a-f0-9]{64}$/.test(x.sha256||"")||
  !/^geomacro-evidence\/v1\/legacy-supabase-safe-exit\/storage\/part-0[0-3]-[a-f0-9]{24}\.tar\.gz$/.test(x.archive_key||"")||
  typeof x.name!=="string"||!x.name.length))
  return block("B2_ORIGIN_FREE_CANARY_METADATA_INVALID");
 try{await gov.reserve("GET")}catch{
  return block("B2_ORIGIN_FREE_ARCHIVE_GET_RESERVATION_DENIED");
 }
 const archive=join(dir,"shared-shard.tar.gz");
 if(aws(["get-object","--bucket",B2_BUCKET,"--key",avatar.archive_key,
   archive,"--output","json"],writerCred)===null)
   return block("B2_ORIGIN_FREE_SHARD_DOWNLOAD_FAILED");
 const entries=call("tar",["-tzf",archive],{},8_000_000);
 if(!entries)return block("B2_ORIGIN_FREE_SHARD_TAR_INDEX_INVALID");
 const fileList=entries.trim().split("\n");
 if(fileList.some(x=>x.includes("..")||x.startsWith("/")||
   !/^(\.\/)?(files\/[a-f0-9]{64}|files\/|manifest\.json|\.\/?)$/.test(x)))
   return block("B2_ORIGIN_FREE_UNSAFE_TAR_ENTRY");
 for(const item of originals){
   const id=hash(item.bucket+"/"+item.name);
   const candidates=["./files/"+id,"files/"+id];
   const actual=fileList.filter(x=>candidates.includes(x));
   if(actual.length!==1)return block("B2_ORIGIN_FREE_PRIVATE_MEMBER_MISSING");
   const original=call("tar",["-xOzf",archive,"--",actual[0]],
      {},26_500_000,90000,null);
   if(!Buffer.isBuffer(original)||original.length!==item.size||
       hash(original)!==item.sha256)
     return block("B2_ORIGIN_FREE_PRIVATE_MEMBER_SHA256_MISMATCH");
   receipt.b2_independent_original_bucket_canaries_verified++;
 }
 if(receipt.b2_independent_original_bucket_canaries_verified!==2)
  return block("B2_ORIGIN_FREE_TWO_BUCKET_ACCEPTANCE_NOT_MET");
 receipt.status="B2_ORIGIN_FREE_BOTH_BUCKETS_ORIGINAL_BYTES_RESTORABLE";
 return emit("APP_AND_EDGE_FUNCTION_RUNTIME_CUTOVER_STILL_UNVERIFIED");
}
try{await main()}catch{block("B2_ORIGIN_FREE_RECOVERY_UNEXPECTED_FAILURE")}finally{
 rmSync(dir,{recursive:true,force:true});
}
