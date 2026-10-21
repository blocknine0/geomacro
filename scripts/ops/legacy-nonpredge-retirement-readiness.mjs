#!/usr/bin/env node
/**
 * Read-only non-Predge old Supabase decommission risk census.
 * No source database or Storage DELETE, no B2 PUT and no payment calls.
 * A completed B2 backup is not equivalent to production read/write cutover.
 */
import {spawnSync} from "node:child_process";
import {mkdirSync,writeFileSync} from "node:fs";
const REF="ldpwajisioljyjtojvfx";
const ORIGIN="https://"+REF+".supabase.co";
const path="artifacts/legacy-exit/nonpredge-old-supabase-retirement-readiness.json";
const report={
 schema:"geomacro.old-primary-nonpredge-retirement-readiness.v1",
 source_project:REF,
 checked_at:new Date().toISOString(),
 source_database_writes:0,source_storage_removals:0,
 destination_writes:0,b2_deletions:0,payments:0,
 private_originals_exposed:false,
 predge_work_performed:false,
 verified_database_backup_run:"39598466442",
 verified_storage_full_restore_run:"39651599672",
 runtime_b2_historical_reads_accepted:false,
 nonpredge_payment_entitlement_runtime_accepted:false,
 deployed_edge_functions_runtime_cutover_accepted:false,
 legacy_storage_removal_authorized:false,
 old_supabase_project_deletion_authorized:false,
 status:"BLOCKED_NO_DELETION"
};
function emit(reason){
 report.blocker=reason;
 mkdirSync("artifacts/legacy-exit",{recursive:true});
 writeFileSync(path,JSON.stringify(report,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(report));
}
function pinned(input) {
 try {
  const u=new URL(input);
  const user=decodeURIComponent(u.username);
  return ["postgres:","postgresql:"].includes(u.protocol)&&
    u.pathname==="/postgres"&&!u.search&&!u.hash&&Boolean(u.password)&&
    (u.hostname==="db."+REF+".supabase.co"&&user==="postgres"||
     u.hostname.endsWith(".pooler.supabase.com")&&user==="postgres."+REF);
 } catch{return false}
}
if(process.env.APP_SUPABASE_URL!==ORIGIN||!pinned(process.env.SUPABASE_DB_URL??"")){
 emit("EXACT_OLD_PRIMARY_READONLY_DATABASE_URL_MISSING");
} else {
 const q = [
  "SELECT json_build_object(",
  "'storage_object_count',(SELECT count(*) FROM storage.objects),",
  "'storage_metadata_bytes',(SELECT coalesce(sum((metadata->>'size')::bigint),0) FROM storage.objects),",
  "'post_backup_modified_objects',(SELECT count(*) FROM storage.objects",
  " WHERE updated_at > timestamptz '2026-10-21T19:12:11Z'),",
  "'referenced_fragment_objects',(SELECT count(*) FROM public.live_fragment_manifest f",
  " JOIN storage.objects o ON o.bucket_id=f.storage_bucket AND o.name=f.object_path),",
  "'referenced_avatar_objects',(SELECT count(*) FROM public.testnet_tester_profiles p",
  " JOIN storage.objects o ON o.bucket_id='testnet-tester-avatars' AND o.name=p.avatar_path),",
  "'agent_payments',(SELECT count(*) FROM public.agent_payments),",
  "'commercial_payment_events',(SELECT count(*) FROM public.commercial_payment_events),",
  "'commercial_entitlement_grants',(SELECT count(*) FROM public.commercial_entitlement_grants),",
  "'commercial_credit_accounts',(SELECT count(*) FROM public.commercial_credit_accounts),",
  "'commercial_credit_usage',(SELECT count(*) FROM public.commercial_credit_usage),",
  "'live_structured_events',(SELECT count(*) FROM public.live_structured_events),",
  "'risk_objects',(SELECT count(*) FROM public.geomacro_risk_objects),",
  "'edge_management_secret_states_not_independently_verified',true",
  ")::text;"
 ].join(" ");
 const child=spawnSync("psql",[process.env.SUPABASE_DB_URL,"-X","-qAt",
   "-v","ON_ERROR_STOP=1","-c",q],{
   env:{...process.env,PGSSLMODE:"require",PGCONNECT_TIMEOUT:"15"},
   encoding:"utf8",timeout:35000,maxBuffer:15000,
   stdio:["ignore","pipe","pipe"],
 });
 if(child.status!==0||child.error){
  emit("READ_ONLY_OLD_SUPABASE_CENSUS_FAILED");
 } else {
  let data;
  try{data=JSON.parse(child.stdout.trim())}catch{
    data=null;
  }
  const fields=["storage_object_count","storage_metadata_bytes","post_backup_modified_objects",
   "referenced_fragment_objects","referenced_avatar_objects","agent_payments",
   "commercial_payment_events","commercial_entitlement_grants","commercial_credit_accounts",
   "commercial_credit_usage","live_structured_events","risk_objects"];
  if(!data||fields.some(k=>!Number.isSafeInteger(Number(data[k]))||Number(data[k])<0)){
   emit("OLD_SUPABASE_SOURCE_CENSUS_UNREADABLE");
  } else {
   report.source_counts=Object.fromEntries(fields.map(k=>[k,Number(data[k])]));
   report.source_matches_preserved_storage_baseline=
     report.source_counts.storage_object_count===23648&&
     report.source_counts.storage_metadata_bytes===57459939&&
     report.source_counts.post_backup_modified_objects===0;
   report.source_matches_previous_critical_db_backup_baseline=
     report.source_counts.live_structured_events===33138&&
     report.source_counts.risk_objects===21178&&
     report.source_counts.commercial_payment_events===5;
   report.open_nonpredge_dependencies=[
    "UNVERIFIED_PRODUCTION_HISTORICAL_FRAGMENT_B2_READ_CUTOVER",
    "UNVERIFIED_TESTER_AVATAR_PROFILE_AND_FILE_READ_CUTOVER",
    "UNVERIFIED_COMMERCIAL_PAYMENT_CREDIT_ENTITLEMENT_RUNTIME_CUTOVER",
    "UNVERIFIED_TEN_DEPLOYED_EDGE_FUNCTION_SOURCE_SECRETS_AND_CALLER_CUTOVER",
    "OLD_SUPABASE_STORAGE_STILL_PRESENT_DO_NOT_REMOVE_WITHOUT_READ_PATH_ACCEPTANCE",
    "OLD_SUPABASE_PROJECT_DELETION_NOT_AUTHORIZED"
   ];
   emit("NONPREDGE_LIVE_RUNTIME_CUTOVER_AND_DELETION_UNVERIFIED");
  }
 }
}
