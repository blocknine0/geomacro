#!/usr/bin/env node
/**
 * One-off privately governed old-primary PostgreSQL data preservation.
 * Source DB: READ ONLY via pg_dump. Destination: dedicated private B2 key.
 * AWS S3 SSE AES256, exact full B2 GET/SHA/TOC readback, NO GitHub data artifact.
 * B2 source/billing headroom and global D1 request reservations must pass.
 * NEVER attempts source writes, storage mutation, role rotation or deletion.
 */
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdirSync,statSync,createReadStream,writeFileSync,readFileSync,rmSync} from "node:fs";
import {resolve} from "node:path";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";

const OLD_REF="ldpwajisioljyjtojvfx";
const BUCKET="geomacro-private-archive";
const ENDPOINT="https://s3.us-east-005.backblazeb2.com";
const DIR=resolve("artifacts/private-legacy-preservation");
const REPORT=resolve("artifacts/legacy-exit/primary-db-b2-readback.json");
const MAX=850*1024*1024,MAX_B2_FREE_SAFETY=9*1024*1024*1024;
const env=process.env;
const now=new Date().toISOString();
let output={schema:"geomacro.legacy-primary-db-b2-preservation.v1",
 checked_at:now,source_project:OLD_REF,copy_completed:false,
 full_source_database_dump_sha256_verified:false,
 b2_exact_full_body_sha256_readback_verified:false,
 sse_b2_aes256_confirmed:false,
 physical_restore_into_disposable_postgres_verified:false,
 all_storage_objects_copied:false,all_edge_function_settings_preserved:false,
 all_customer_ledger_reconciled:false,project_deletion_authorized:false,
 source_db_writes:0,source_storage_deletes:0,payments:0,
 status:"BLOCKED_NO_DELETION",reason:"NOT_STARTED"};
const receipt=()=>{
 mkdirSync(resolve("artifacts/legacy-exit"),{recursive:true});
 writeFileSync(REPORT,JSON.stringify(output,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(output));
};
const blocked=(reason)=>{
 output.status="BLOCKED_NO_DELETION";output.reason=reason;
 receipt();process.exitCode=0;
};
const shaFile=async path=>new Promise((resolvePromise,reject)=>{
 const h=createHash("sha256");
 const r=createReadStream(path);
 r.on("data",bytes=>h.update(bytes));
 r.on("error",reject);
 r.on("end",()=>resolvePromise(h.digest("hex")));
});
function run(binary,args,extraEnv={},timeout=60000,maxBuffer=8192){
 const child=spawnSync(binary,args,{
  cwd:process.cwd(),env:{...env,...extraEnv},
  encoding:"utf8",timeout,maxBuffer,
 });
 if(child.status!==0||child.error)return null;
 return child.stdout;
}
function pinnedDb(value){
 try{
 const u=new URL(value);
 const username=decodeURIComponent(u.username);
 const direct=u.hostname==="db."+OLD_REF+".supabase.co";
 const pooler=u.hostname.endsWith(".pooler.supabase.com")&&
   username==="postgres."+OLD_REF;
 if(!["postgres:","postgresql:"].includes(u.protocol)||u.pathname!=="/postgres"||
    (!direct&&!pooler)||!u.password||u.search||u.hash)return null;
 return {host:u.hostname,port:u.port||(direct?"5432":"5432"),
  username,password:decodeURIComponent(u.password)};
 }catch{return null}
}
async function main(){
 const info=pinnedDb(env.SUPABASE_DB_URL??"");
 if(!info||env.APP_SUPABASE_URL!=="https://"+OLD_REF+".supabase.co")
  return blocked("EXACT_LEGACY_DATABASE_AUTHORIZATION_NOT_AVAILABLE");
 if(!env.B2_KEY_ID||!env.B2_APPLICATION_KEY||
    !env.CLOUDFLARE_ACCOUNT_ID||!env.CLOUDFLARE_API_TOKEN||
    !env.D1_DATABASE_ID)return blocked("B2_SHARED_QUOTA_OR_STORAGE_CREDENTIALS_MISSING");
 if(!run("docker",["--version"])||!run("aws",["--version"]))
  return blocked("DOCKER_POSTGRES17_OR_AWS_S3_CLIENT_NOT_AVAILABLE");
 const awsEnv={
  AWS_ACCESS_KEY_ID:env.B2_KEY_ID,
  AWS_SECRET_ACCESS_KEY:env.B2_APPLICATION_KEY,
  AWS_DEFAULT_REGION:"us-east-005",
  AWS_EC2_METADATA_DISABLED:"true",
  AWS_MAX_ATTEMPTS:"1",AWS_RETRY_MODE:"standard",
 };
 const b2Args=["--endpoint-url",ENDPOINT];
 const bucketsRaw=run("aws",["s3api","list-buckets",...b2Args,"--output","json"],awsEnv,30000,2_000_000);
 if(!bucketsRaw)return blocked("B2_ACCOUNT_WIDE_FREE_STORAGE_INVENTORY_INACCESSIBLE");
 let buckets;
 try{buckets=JSON.parse(bucketsRaw)?.Buckets?.map(x=>x.Name)}catch{return blocked("B2_ACCOUNT_BUCKET_LIST_INVALID")}
 if(!Array.isArray(buckets)||!buckets.includes(BUCKET)||buckets.some(x=>!/^[-a-z0-9]{3,63}$/u.test(x)))
  return blocked("B2_ARCHIVE_BUCKET_INVENTORY_INVALID");
 let bytesUsed=0;
 for(const bucket of buckets){
   // Versions include retained historical objects, not just the current keys.
   const raw=run("aws",["s3api","list-object-versions",...b2Args,
     "--bucket",bucket,"--output","json"],awsEnv,120000,60_000_000);
   if(!raw)return blocked("B2_VERSIONED_ACCOUNT_STORAGE_USAGE_NOT_VERIFIABLE");
   try{
    const versions=JSON.parse(raw)?.Versions;
    if(!Array.isArray(versions))return blocked("B2_ACCOUNT_STORAGE_VERSIONS_INCOMPLETE");
    for(const x of versions){
     if(!Number.isSafeInteger(x.Size)||x.Size<0)return blocked("B2_ACCOUNT_OBJECT_BYTES_INVALID");
     bytesUsed+=x.Size;
     if(!Number.isSafeInteger(bytesUsed)||bytesUsed>=MAX_B2_FREE_SAFETY)
      return blocked("B2_FREE_STORAGE_HEADROOM_TOO_SMALL");
    }
   }catch{return blocked("B2_ACCOUNT_STORAGE_USAGE_UNREADABLE")}
 }
 output.archive_current_visible_version_bytes=bytesUsed;
 const quota=await createB2D1AccountGovernor({env:{
  ...env,B2_ACCOUNT_QUOTA_WORKFLOW_ID:"legacy_primary_preserve",
 }}).status().catch(()=>null);
 if(!quota?.ok)return blocked("SHARED_D1_B2_QUOTA_NOT_VERIFIABLE");
 // Preserve three shared GET tickets for real-time public risk/Intelligence.
 if(quota.used.GET+1>quota.limits.GET-3 ||
    quota.used.PUT+1>quota.limits.PUT ||
    quota.used.total+2>quota.limits.total-5)
  return blocked("SHARED_B2_VERIFIED_BACKUP_HEADROOM_INSUFFICIENT");
 output.quota_guard_verified=true;
 mkdirSync(DIR,{recursive:true,mode:0o700});
 const local=resolve(DIR,"primary.pgcustom");
 const verify=resolve(DIR,"primary-from-b2.pgcustom");
 const dbEnv={PGHOST:info.host,PGPORT:info.port,PGUSER:info.username,
  PGPASSWORD:info.password,PGSSLMODE:"require",PGCONNECT_TIMEOUT:"20"};
 const mount=DIR+":/backup";
 const image="postgres:17-alpine";
 const cmd=["run","--rm","--network","host",
  "-e","PGHOST","-e","PGPORT","-e","PGUSER","-e","PGPASSWORD",
  "-e","PGSSLMODE","-e","PGCONNECT_TIMEOUT",
  "-v",mount,image,"pg_dump","-d","postgres",
  "--format=custom","--compress=6","--no-owner","--no-privileges",
  "--lock-wait-timeout=15000","--file=/backup/primary.pgcustom"];
 if(run("docker",cmd,dbEnv,40*60*1000,50000)===null)
  return blocked("POSTGRES17_FULL_LOGICAL_DUMP_FAILED");
 if(!statSync(local).isFile()||statSync(local).size<1024*1024||
    statSync(local).size>MAX)
  return blocked("FULL_DB_CUSTOM_DUMP_BYTES_INVALID");
 const listDump=path=>run("docker",["run","--rm","--network","none",
  "-v",mount,image,"pg_restore","--list","/backup/"+path],{},90_000,8_000_000);
 const toc=listDump("primary.pgcustom");
 if(!toc)return blocked("DB_DUMP_TOC_UNREADABLE");
 const publicDefs=toc.split("\n").filter(x=>/; .* TABLE public /u.test(x)).length;
 const authDefs=toc.split("\n").filter(x=>/; .* TABLE auth /u.test(x)).length;
 const storageDefs=toc.split("\n").filter(x=>/; .* TABLE storage /u.test(x)).length;
 if(publicDefs<139||authDefs<20||storageDefs<5)
  return blocked("DB_DUMP_MISSING_REQUIRED_APPLICATION_OR_MANAGED_SCHEMAS");
 const size=statSync(local).size;
 if(bytesUsed+size>MAX_B2_FREE_SAFETY)
  return blocked("B2_VERSIONED_FREE_STORAGE_RESERVE_INSUFFICIENT");
 output.dump_size_bytes=size;output.db_schema_table_counts={
  public:publicDefs,auth:authDefs,storage:storageDefs};
 const initialSha=await shaFile(local);
 const key="geomacro-evidence/v1/legacy-supabase-safe-exit/db-"+initialSha.slice(0,20)+
  "-"+String(env.GITHUB_RUN_ID??"offline").replace(/[^0-9a-z]/gu,"")+".pgcustom";
 const gov=createB2D1AccountGovernor({env:{
  ...env,B2_ACCOUNT_QUOTA_WORKFLOW_ID:"legacy_primary_preserve",
 }});
 await gov.reserve("PUT");
 const put=run("aws",["s3api","put-object",...b2Args,
   "--bucket",BUCKET,"--key",key,"--body",local,
   "--server-side-encryption","AES256","--output","json"],
   awsEnv,30*60*1000,16000);
 if(!put)return blocked("GOVERNED_SSE_B2_PUT_UNAVAILABLE_NO_ARCHIVE_CLAIM");
 let putEncryption;
 try{putEncryption=JSON.parse(put)?.ServerSideEncryption}catch{/* fail closed */}
 if(putEncryption!=="AES256")return blocked("B2_SSE_AES256_NOT_ATTESTED");
 output.sse_b2_aes256_confirmed=true;
 await gov.reserve("GET");
 const get=run("aws",["s3api","get-object",...b2Args,
   "--bucket",BUCKET,"--key",key,verify,"--output","json"],
   awsEnv,30*60*1000,16000);
 if(!get||!statSync(verify).isFile())
  return blocked("B2_FULL_DOWNLOAD_UNAVAILABLE_UNVERIFIED_ARCHIVE");
 const downloaded=await shaFile(verify);
 if(initialSha!==downloaded||statSync(verify).size!==size)
  return blocked("B2_FULL_ARCHIVE_SHA256_BYTES_MISMATCH");
 output.b2_exact_full_body_sha256_readback_verified=true;
 const restoredToc=listDump("primary-from-b2.pgcustom");
 if(restoredToc!==toc)return blocked("B2_DOWNLOADED_POSTGRES_TOC_MISMATCH");
 output.full_source_database_dump_sha256_verified=true;
 output.copy_completed=true;
 output.status="B2_DB_BYTES_COPIED_AND_SHA_TOC_VERIFIED_RESTORE_PENDING";
 output.reason="RESTORE_AND_ALL_STORAGE_AND_COMMERCIAL_DEPENDENCIES_STILL_REQUIRED";
 output.original_project_preserved=true;
 output.source_database_fully_backed_up_into_b2=true;
 receipt();
}
try{await main()}catch{
 blocked("PRESERVATION_EXCEPTION_FAIL_CLOSED");
}finally{
 // Data in ephemeral runner only. No DB backup in publicly downloadable CI.
 try{rmSync(DIR,{recursive:true,force:true})}catch{/* Protected runner destroyed */}
}
