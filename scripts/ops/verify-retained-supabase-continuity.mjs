#!/usr/bin/env node
/**
 * Owner policy 2026-10-22: RETAIN, not retire, the old Supabase project.
 * This job is an inventory of non-sensitive aggregate counts only.
 * No B2, no Cloudflare mutation, no Supabase management delete, no SQL writes.
 * Historical immutable full database + original Storage backups stay at B2.
 */
import {spawnSync} from "node:child_process";
import {mkdirSync,writeFileSync} from "node:fs";
const REF="ldpwajisioljyjtojvfx";
const URL="https://"+REF+".supabase.co";
const OUTPUT="artifacts/legacy-exit/retained-supabase-continuity.json";
const baseline={storage_objects:23648,storage_bytes:57459939,
 live_structured_events:33138,commercial_payment_events:5,geomacro_risk_objects:21178};
const report={
 schema:"geomacro.retained-legacy-supabase-continuity.v1",
 source_project:REF,checked_at:new Date().toISOString(),
 owner_instruction:"KEEP_EXISTING_SUPABASE_ACTIVE_DO_NOT_DELETE",
 status:"SOURCE_READ_ONLY_UNVERIFIED",source_mutations:0,
 source_storage_deletions:0,d1_writes:0,b2_operations:0,real_payments:0,
 project_deletion_authorized:false,bucket_deletion_authorized:false,
 original_bytes_moved_from_supabase:false,
 historical_b2_database_and_storage_backup_independent_acceptance:true,
};
function emit(reason){
 report.reason=reason;
 mkdirSync("artifacts/legacy-exit",{recursive:true});
 writeFileSync(OUTPUT,JSON.stringify(report,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(report));
}
function fail(reason){report.status="BLOCKED_NO_MUTATION";emit(reason);process.exitCode=3}
function readConfig(value){
 try{
  const u=new URL(value);
  if(!["postgres:","postgresql:"].includes(u.protocol)||u.pathname!=="/postgres"||
   !u.password||u.search||u.hash)return null;
  const username=decodeURIComponent(u.username);
  const direct=u.hostname==="db."+REF+".supabase.co"&&username==="postgres";
  const pooler=u.hostname.endsWith(".pooler.supabase.com")&&username==="postgres."+REF;
  if(!direct&&!pooler)return null;
  const port=u.port||"5432";
  if(!/^[0-9]{1,5}$/.test(port))return null;
  return {host:u.hostname,port,user:username,password:decodeURIComponent(u.password)};
 }catch{return null}
}
const TABLES=[
 "agent_payments","commercial_api_credential_lifecycle_events",
 "commercial_api_credentials","commercial_credit_accounts",
 "commercial_credit_usage","commercial_entitlement_grants",
 "commercial_payment_events","commercial_principals",
 "testnet_api_request_bindings","testnet_developer_credentials",
 "testnet_tester_profiles","testnet_tester_sessions",
 "testnet_usdc_payment_claims","testnet_wallet_challenges"
];
function query(){
 const commercial=TABLES.map(name=>"'"+name+"',(SELECT count(*) FROM public."+name+")").join(",");
 // A single SELECT has no mutation path. Including profiles/credentials only
 // as integer COUNTS: no private row, address, hash, name or token leaves DB.
 return "SELECT json_build_object("+
  "'database_bytes',pg_database_size(current_database()),"+
  "'storage_objects',(SELECT count(*) FROM storage.objects),"+
  "'storage_bytes',(SELECT coalesce(sum((metadata->>'size')::bigint),0) FROM storage.objects),"+
  "'storage_bucket_count',(SELECT count(*) FROM storage.buckets),"+
  "'live_structured_events',(SELECT count(*) FROM public.live_structured_events),"+
  "'commercial_payment_events',(SELECT count(*) FROM public.commercial_payment_events),"+
  "'geomacro_risk_objects',(SELECT count(*) FROM public.geomacro_risk_objects),"+
  "'commercial_table_counts',json_build_object("+commercial+")"+
  ")::text";
}
function main(){
 if(process.env.APP_SUPABASE_URL!==URL)return fail("PINNED_OLD_SUPABASE_URL_REQUIRED");
 const db=readConfig(process.env.SUPABASE_DB_URL??"");
 if(!db)return fail("EXACT_LEGACY_POSTGRES_IDENTITY_REQUIRED");
 const x=spawnSync("psql",[
  "-h",db.host,"-p",db.port,"-U",db.user,"-d","postgres",
  "-X","-qAt","-v","ON_ERROR_STOP=1","-c",query()
 ],{env:{...process.env,PGPASSWORD:db.password,
     PGSSLMODE:"require",PGCONNECT_TIMEOUT:"15",
     PGOPTIONS:"-c default_transaction_read_only=on"},
   encoding:"utf8",timeout:60000,maxBuffer:500_000,
   stdio:["ignore","pipe","pipe"]});
 if(x.status!==0||x.error)return fail("READ_ONLY_EXISTING_SUPABASE_SOURCE_UNAVAILABLE");
 let data;try{data=JSON.parse(x.stdout.trim())}catch{return fail("READ_ONLY_AGGREGATE_RESULT_UNPARSABLE")}
 const keys=[...Object.keys(baseline),"database_bytes","storage_bucket_count"];
 if(keys.some(k=>!Number.isSafeInteger(Number(data[k]))||Number(data[k])<0))
  return fail("SOURCE_AGGREGATE_DATA_INVALID");
 const tableCounts=data.commercial_table_counts;
 if(!tableCounts||Object.keys(tableCounts).length!==TABLES.length||
   TABLES.some(t=>!Number.isSafeInteger(Number(tableCounts[t]))||Number(tableCounts[t])<0))
  return fail("CUSTOMER_TABLE_COUNT_INVENTORY_INCOMPLETE");
 report.live_counts=Object.fromEntries(keys.map(k=>[k,Number(data[k])]));
 report.customer_private_table_counts=Object.fromEntries(TABLES.map(k=>[k,Number(tableCounts[k])]));
 report.snapshot_lower_bounds=baseline;
 report.snapshot_count_drift=Object.fromEntries(Object.entries(baseline)
  .map(([k,v])=>[k,Number(data[k])-v]));
 report.source_sql_read_only_verified=true;
 // A live database is NOT the same thing as a current validated restore.
 report.historical_backup_is_point_in_time_not_live_replication=true;
 report.status="RETAINED_SUPABASE_SOURCE_READABLE_NO_MUTATION";
 emit(data.storage_objects<baseline.storage_objects||
      data.storage_bytes<baseline.storage_bytes
      ?"SOURCE_STORAGE_HAS_FEWER_ITEMS_THAN_ARCHIVED_POINT_IN_TIME":"RETENTION_CONTINUITY_OBSERVED");
}
main();
