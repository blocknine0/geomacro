#!/usr/bin/env node
// The source of each LIVE deployed Edge Function, not only repository copies.
// Protected runner, 10 exact slugs, encrypted private B2, independent readback.
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,readdirSync,lstatSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";
import {classifyDeployedSourceBody} from "./legacy-edge-source-body-format.mjs";
const ref="ldpwajisioljyjtojvfx",endpoint="https://s3.us-east-005.backblazeb2.com";
const bucket="geomacro-private-archive";
const prefix="geomacro-evidence/v1/legacy-supabase-safe-exit/edge-functions/";
const names=["live-gdelt-ingest","live-structure-intelligence","live-flash-ingest",
 "live-flash-corroborate","public-risk-indices","public-early-warning",
 "gro-archive-read","gro-archive-maintain","raw-snapshot-read","archive-verify-read"];
const hash=x=>createHash("sha256").update(x).digest("hex");
const env=process.env,tmp=mkdtempSync(join(tmpdir(),"geomacro-edges-"));
const readOnlyMgmtToken=String(env.SUPABASE_LEGACY_EDGE_READ_TOKEN||env.SUPABASE_ACCESS_TOKEN||"");
const output="artifacts/legacy-exit/deployed-edge-b2-verified.json";
const report={schema:"geomacro.legacy-deployed-edge-functions-v1",source_project:ref,
 fetched_from_live_management_api:0,verified_private_source_files:0,b2_verified:false,
 old_supabase_writes:0,old_supabase_deletes:0,b2_deletes:0,payments:0,
 old_supabase_deletion_authorized:false,status:"BLOCKED_NO_DELETION"};
function save(reason){report.reason=reason;mkdirSync("artifacts/legacy-exit",{recursive:true});
 writeFileSync(output,JSON.stringify(report,null,2)+"\n",{mode:0o600});console.log(JSON.stringify(report))}
function halt(s){save(s);process.exitCode=3}
function aws(args){const r=spawnSync("aws",["--endpoint-url",endpoint,"s3api",...args],{
 env:{...env,AWS_ACCESS_KEY_ID:env.B2_KEY_ID,
 AWS_SECRET_ACCESS_KEY:env.B2_APPLICATION_KEY,AWS_DEFAULT_REGION:"us-east-005",
 AWS_EC2_METADATA_DISABLED:"true",AWS_MAX_ATTEMPTS:"1"},encoding:"utf8",
 maxBuffer:15000,timeout:300000,stdio:["ignore","pipe","pipe"]});
 return r.status===0?r.stdout:null;
}
// Official Supabase CLI is the documented fallback when Management API
// /functions/{slug}/body responds with an opaque or empty body. Every byte
// stays only inside the protected ephemeral runner and the private B2 archive.
function downloadActualDeployedSourceWithCli(slug){
 if(!names.includes(slug))return null;
 const base=join(tmp,"cli-"+slug);
 const sourceDir=join(base,"supabase","functions",slug);
 mkdirSync(join(base,"supabase","functions"),{recursive:true,mode:0o700});
 const run=spawnSync("supabase",["functions","download",slug,"--project-ref",ref],{
   cwd:base,env:{...env,SUPABASE_ACCESS_TOKEN:readOnlyMgmtToken},
   encoding:"utf8",timeout:90000,maxBuffer:60000,stdio:["ignore","pipe","pipe"]});
 if(run.error||run.status!==0||!existsSync(sourceDir))return null;
 const files=[];
 let accumulated=0;
 function visit(folder,prefix="",depth=0){
  if(depth>5||files.length>49)throw Error("UNSAFE_PRIVATE_CLI_DOWNLOAD_STRUCTURE");
  for(const node of readdirSync(folder,{withFileTypes:true})){
   if(!/^[A-Za-z0-9_.-]{1,120}$/.test(node.name)||node.name===".."||
      node.name===".")throw Error("UNSAFE_PRIVATE_CLI_SOURCE_FILE_NAME");
   const path=join(folder,node.name),name=prefix+node.name;
   const stat=lstatSync(path);
   if(stat.isSymbolicLink())throw Error("PRIVATE_CLI_DOWNLOAD_SYMLINK_REJECTED");
   if(stat.isDirectory()){visit(path,name+"/",depth+1);continue}
   if(!stat.isFile()||stat.size<1||stat.size>2_000_000)
      throw Error("PRIVATE_CLI_SOURCE_FILE_SIZE_INVALID");
   const bytes=readFileSync(path);
   accumulated+=bytes.length;
   if(accumulated>3_000_000)throw Error("PRIVATE_CLI_SOURCE_TOTAL_BYTES_EXCEEDED");
   files.push({name:slug+"/"+name,content:bytes.toString("base64"),
     original_sha256:hash(bytes)});
  }
 }
 try{visit(sourceDir)}catch{return null}
 if(!files.length||files.length>49||
    !files.some(x=>x.name.endsWith("/index.ts")))return null;
 return Buffer.from(JSON.stringify({files,via:"supabase-cli-download-v1"}));
}
async function main(){
 if(env.SUPABASE_PROJECT_ID!==ref||!readOnlyMgmtToken||
 !env.B2_KEY_ID||!env.B2_APPLICATION_KEY||
 !env.CLOUDFLARE_API_TOKEN||!env.CLOUDFLARE_ACCOUNT_ID||
 !env.D1_DATABASE_ID)return halt("EXACT_OLD_MANAGEMENT_AND_B2_CONFIG_REQUIRED");
 const gov=createB2D1AccountGovernor({env:{...env,
  B2_ACCOUNT_QUOTA_WORKFLOW_ID:"legacy_edge_backup"}});
 let quota;try{quota=await gov.status()}catch{return halt("SHARED_B2_QUOTA_UNAVAILABLE")}
 if(quota.used.GET>=quota.limits.GET-4||
  quota.used.PUT>=quota.limits.PUT-2||
  quota.used.total>=quota.limits.total-6)return halt("B2_PROTECTED_GET_RESERVE_REQUIRED");
 const list=await fetch("https://api.supabase.com/v1/projects/"+ref+"/functions",{
  headers:{Authorization:"Bearer "+readOnlyMgmtToken},
  redirect:"error",signal:AbortSignal.timeout(15000)}).catch(()=>null);
 if(!list)return halt("OLD_EDGE_MANAGEMENT_NETWORK_UNAVAILABLE");
 if(list.status===401||list.status===403)
  return halt("OLD_EDGE_MANAGEMENT_TOKEN_NOT_AUTHORIZED");
 if(list.status===429)return halt("OLD_EDGE_MANAGEMENT_API_RATE_LIMITED");
 if(!list.ok)return halt("OLD_EDGE_MANAGEMENT_RESPONSE_NOT_OK");
 let metadata;try{metadata=await list.json()}catch{return halt("OLD_EDGE_MANAGEMENT_METADATA_INVALID")}
 if(!Array.isArray(metadata)||metadata.length!==10||
  metadata.some(f=>!names.includes(f.slug))||
  new Set(metadata.map(f=>f.slug)).size!==10)return halt("OLD_EDGE_DEPLOYED_FUNCTION_SET_DRIFT");
 const archived=[];
 for(const slug of names){
  const meta=metadata.find(x=>x.slug===slug);
  if(meta.status!=="ACTIVE"||!Number.isSafeInteger(meta.version)||
   typeof meta.ezbr_sha256!=="string")return halt("OLD_EDGE_DEPLOYED_METADATA_INCOMPLETE");
  const r=await fetch("https://api.supabase.com/v1/projects/"+ref+"/functions/"+
   encodeURIComponent(slug)+"/body",{
    headers:{Authorization:"Bearer "+readOnlyMgmtToken},
    redirect:"error",signal:AbortSignal.timeout(20000)}).catch(()=>null);
  if(!r)return halt("OLD_EDGE_SOURCE_BODY_NETWORK_UNAVAILABLE");
  if(r.status===401||r.status===403)return halt("OLD_EDGE_SOURCE_BODY_READ_PERMISSION_MISSING");
  if(r.status===429)return halt("OLD_EDGE_SOURCE_BODY_RATE_LIMITED");
  if(r.status!==200)return halt("OLD_EDGE_SOURCE_BODY_NOT_AVAILABLE");
  let bytes=Buffer.from(await r.arrayBuffer());
  const classification=classifyDeployedSourceBody(bytes,r.headers.get("content-type")||"");
  if(!classification.restorable){
   // The canonical documented CLI download is only a read of the pinned
   // deployed source. Never use GitHub main as a substitute for deployed code.
   const recovered=downloadActualDeployedSourceWithCli(slug);
   if(!recovered){
    report.first_unrecognized_source_body_format=classification.kind;
    return halt("OLD_EDGE_SOURCE_CLI_DOWNLOAD_NOT_RESTORABLE");
   }
   bytes=recovered;
   report.official_cli_fallback_functions=(report.official_cli_fallback_functions||0)+1;
  }
  archived.push({slug,version:meta.version,verify_jwt:meta.verify_jwt,
   original_bundle_sha256:meta.ezbr_sha256,actual_source_body:bytes.toString("base64"),
   downloaded_sha256:hash(bytes)});
  report.fetched_from_live_management_api++;
 }
 const payload=Buffer.from(JSON.stringify({
  schema:"geomacro.legacy-edge-source-bundle.v1",project:ref,
  current_versions:archived}));
 const file=join(tmp,"edge-function-versions.json"),downloaded=join(tmp,"roundtrip.json");
 writeFileSync(file,payload,{mode:0o600});
 const key=prefix+"all-10-"+hash(payload).slice(0,24)+".json";
 try{await gov.reserve("PUT")}catch{return halt("B2_EDGE_PUT_RESERVATION_DENIED")}
 const put=aws(["put-object","--bucket",bucket,"--key",key,"--body",file,
   "--server-side-encryption","AES256","--output","json"]);
 let ack;try{ack=JSON.parse(put)}catch{return halt("B2_PRIVATE_EDGE_ARCHIVE_FAILED")}
 if(ack.ServerSideEncryption!=="AES256")return halt("EDGE_B2_ENCRYPTION_NOT_PROVEN");
 try{await gov.reserve("GET")}catch{return halt("B2_EDGE_GET_RESERVATION_DENIED")}
 const get=aws(["get-object","--bucket",bucket,"--key",key,downloaded,"--output","json"]);
 if(!get||!existsSync(downloaded)||hash(readFileSync(downloaded))!==hash(payload))
  return halt("B2_EDGE_EXACT_FULL_BODY_READBACK_FAILED");
 let recovered;try{recovered=JSON.parse(readFileSync(downloaded,"utf8"))}
 catch{return halt("B2_EDGE_RESTORED_BUNDLE_INVALID")}
 if(recovered.current_versions?.length!==10||
 recovered.current_versions.some(x=>!names.includes(x.slug)||
 hash(Buffer.from(x.actual_source_body,"base64"))!==x.downloaded_sha256))
  return halt("B2_EDGE_INDEPENDENT_SOURCE_VERSION_MISMATCH");
 report.verified_private_source_files=10;report.b2_verified=true;
 report.status="TEN_DEPLOYED_FUNCTION_SOURCES_ARCHIVED_AND_READBACK_VERIFIED";
 save("EDGE_RUNTIME_SECRETS_AND_CUSTOMER_ROUTES_REQUIRE_SEPARATE_RECONCILIATION");
}
try{await main()}catch{halt("OLD_EDGE_PRESERVATION_FAILED_CLOSED")}finally{
 // Supabase CLI can create downloaded files and parent directories with
 // restricted permissions. Give only this ephemeral private tree owner write
 // permission before removing it. Never print original names or source bytes.
 const chmod=spawnSync("chmod",["-R","u+rwX",tmp],{
  encoding:"utf8",timeout:10000,maxBuffer:2000,stdio:["ignore","pipe","pipe"],
 });
 try{rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:50})}
 catch{
  // GitHub-hosted ephemeral runner is destroyed after the job; do not leak
  // untrusted path/OS error details or revoke a completed B2 byte attestation.
  report.runner_temporary_cleanup_incomplete=true;
  report.runner_cleanup_permission_repair_attempted=chmod.status===0;
  save("PRIVATE_B2_ARCHIVE_VERIFIED_EPHEMERAL_RUNNER_DISPOSAL_REQUIRED");
 }
}
