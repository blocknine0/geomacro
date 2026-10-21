#!/usr/bin/env node
/**
 * No-funds, read-only acceptance probe BEFORE attempting an old Supabase
 * preservation run. No dataset values, credentials, source URLs, archive keys
 * or encrypted backup leave the protected GitHub runner.
 *
 * This probe DOES NOT transfer data and is NOT a deletion certificate.
 */
import {spawnSync} from "node:child_process";
import {mkdirSync,writeFileSync} from "node:fs";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";

const PROJECT="ldpwajisioljyjtojvfx";
const OUTPUT="artifacts/legacy-exit/preservation-preflight.json";
const env=process.env;
const safeFailure=(reason,details={})=>({
 schema:"geomacro.legacy-primary-preservation-preflight.v1",
 checked_at:new Date().toISOString(),source_project:PROJECT,
 status:"BLOCKED_NO_DELETION",blocker:reason,
 ...details,source_db_writes:0,storage_deletes:0,
 b2_writes:0,payments:0,all_bytes_exported:false,
 independent_restoration_verified:false,project_deletion_authorized:false,
});
function emit(body){
 mkdirSync("artifacts/legacy-exit",{recursive:true});
 writeFileSync(OUTPUT,JSON.stringify(body,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(body));
}
function sourceMatches(url){
 try{
  const u=new URL(url);
  const username=decodeURIComponent(u.username);
  const direct=u.hostname==="db."+PROJECT+".supabase.co";
  const pooler=/^(?:aws-[a-z0-9-]+\.)?pooler\.supabase\.com$/u.test(u.hostname) &&
    username==="postgres."+PROJECT;
  return (u.protocol==="postgresql:"||u.protocol==="postgres:")&&
    u.pathname==="/postgres"&&(direct||pooler)&&
    !u.hash;
 }catch{return false}
}
const publicOrigin="https://"+PROJECT+".supabase.co";
const sourceUrl=String(env.APP_SUPABASE_URL??"").trim();
const dbUrl=String(env.SUPABASE_DB_URL??"").trim();
const storageKey=String(env.SUPABASE_SERVICE_ROLE_KEY??"").trim();
const allExisting=Boolean(dbUrl&&storageKey&&sourceUrl);
if(!allExisting||sourceUrl!==publicOrigin||!sourceMatches(dbUrl)){
 emit(safeFailure("PRIMARY_SOURCE_SECRETS_MISSING_OR_WRONG_PROJECT",{
  primary_db_secret_present:dbUrl.length>0,
  primary_storage_secret_present:storageKey.length>0,
  primary_public_origin_pinned:sourceUrl===publicOrigin,
  exact_primary_db_project_identity_verified:sourceMatches(dbUrl),
 }));process.exit(0);
}
const sql="BEGIN READ ONLY; SELECT current_database(),(SELECT count(*) FROM public.live_structured_events),(SELECT count(*) FROM storage.objects),(SELECT count(*) FROM public.commercial_payment_events); ROLLBACK;";
const pg=spawnSync("psql",[dbUrl,"-X","-A","-q","-t","-v","ON_ERROR_STOP=1","-c",sql],{
 env:{...env,PGSSLMODE:"require",PGCONNECT_TIMEOUT:"12"},encoding:"utf8",
 timeout:25000,maxBuffer:2048,
});
if(pg.error||pg.status!==0){
 emit(safeFailure("PRIMARY_SOURCE_DATABASE_READ_ONLY_ACCESS_UNAVAILABLE",{
  primary_source_secrets_present:true,
  connection_error_details_suppressed:true,
 }));process.exit(0);
}
const match=pg.stdout.match(/postgres\|\d+\|\d+\|\d+/u);
if(!match){
 emit(safeFailure("PRIMARY_SOURCE_READ_ONLY_COUNTS_MISMATCH",{
  primary_source_secrets_present:true,db_result_private:true,
 }));process.exit(0);
}
const fields=match[0].split("|").map((v,i)=>i===0?v:Number(v));
if(fields[1]===0||fields[2]===0||fields.some((x,i)=>i>0&&!Number.isSafeInteger(x))){
 emit(safeFailure("PRIMARY_SOURCE_ROWS_UNEXPECTED",{
  table_probes_independently_read:true,
 }));process.exit(0);
}
const b2CredentialsPresent=Boolean(env.B2_KEY_ID&&env.B2_APPLICATION_KEY);
const cloudflarePresent=Boolean(env.CLOUDFLARE_API_TOKEN&&env.CLOUDFLARE_ACCOUNT_ID);
if(!b2CredentialsPresent||!cloudflarePresent){
 emit(safeFailure("ARCHIVE_OR_SHARED_QUOTA_SECRETS_NOT_CONFIGURED",{
  primary_source_read_only_verified:true,
  source_structured_rows:fields[1],source_storage_object_rows:fields[2],
  source_payment_event_rows:fields[3],
  b2_archive_credentials_present:b2CredentialsPresent,
  cloudflare_quota_credentials_present:cloudflarePresent,
 }));process.exit(0);
}
try {
 const account=String(env.CLOUDFLARE_ACCOUNT_ID);
 const response=await fetch("https://api.cloudflare.com/client/v4/accounts/"+
  account+"/d1/database?per_page=100",{
  headers:{Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN},
  redirect:"error",signal:AbortSignal.timeout(15000)});
 const data=await response.json();
 const id=data?.result?.find(x=>x.name==="geomacro-control-plane")?.uuid;
 if(!response.ok||data.success!==true||
    !/^[a-f0-9-]{36}$/u.test(id??""))throw Error("D1_UNAVAILABLE");
 const status=await createB2D1AccountGovernor({env:{
  ...env,D1_DATABASE_ID:id,B2_ACCOUNT_QUOTA_WORKFLOW_ID:"legacy_exit_preflight",
 }}).status();
 if(status.ok!==true)throw Error("B2_LEDGER_UNAVAILABLE");
 emit({
  schema:"geomacro.legacy-primary-preservation-preflight.v1",
  checked_at:new Date().toISOString(),source_project:PROJECT,
  status:"SOURCE_READABLE_ARCHIVE_LEDGER_READABLE_TRANSFER_NOT_STARTED",
  primary_source_read_only_verified:true,
  source_structured_rows:fields[1],
  source_storage_object_rows:fields[2],
  source_payment_event_rows:fields[3],
  archived_original_bytes_verified:0,
  source_secret_values_never_logged:true,
  archive_credentials_present:true,
  b2_destination_access_verified_by_actual_put_get:false,
  quota_status:status,
  recommended_next_step:"GOVERNED_ENCRYPTED_EXPORT_AND_INDEPENDENT_RESTORE",
  source_db_writes:0,storage_deletes:0,b2_writes:0,
  payments:0,all_bytes_exported:false,independent_restoration_verified:false,
  project_deletion_authorized:false,
 });
}catch{
 emit(safeFailure("SHARED_B2_D1_QUOTA_UNAVAILABLE",{
  primary_source_read_only_verified:true,
  source_structured_rows:fields[1],source_storage_object_rows:fields[2],
  source_payment_event_rows:fields[3],
  b2_archive_credentials_present:true,
  quota_details_suppressed:true,
 }));
}
