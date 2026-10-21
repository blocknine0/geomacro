#!/usr/bin/env node
// Single read-only source-side export probe, independent of B2 Class-B quotas.
// NO production writes, NO deletions, NO customer bytes or paths in receipts.
import {spawnSync} from "node:child_process";
import {mkdirSync,writeFileSync} from "node:fs";
const REF="ldpwajisioljyjtojvfx";
const ORIGIN="https://"+REF+".supabase.co";
const FILE="artifacts/legacy-exit/supabase-original-byte-read-access.json";
const e=process.env;
const receipt={
 schema:"geomacro.old-supabase-original-byte-read-access.v1",
 source_project:REF,
 checked_at:new Date().toISOString(),
 classification:"UNAVAILABLE",
 original_storage_bytes_read_verified:false,
 storage_metadata_rows:null,
 source_database_bytes:null,
 http_status:null,
 source_database_writes:0,source_storage_deletes:0,
 b2_requests:0,real_money_transactions:0,
 project_deletion_authorized:false,
 source_data_or_file_paths_published:false,
};
function output(label){
 receipt.classification=label;
 mkdirSync("artifacts/legacy-exit",{recursive:true});
 writeFileSync(FILE,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(receipt));
 if(label!=="AUTHENTICATED_ORIGINAL_STORAGE_BYTES_READ_VERIFIED")process.exitCode=3;
}
function validUrl(raw){
 try{
  const u=new URL(raw);
  return ["postgres:","postgresql:"].includes(u.protocol)&&
   u.pathname==="/postgres"&&!!u.password&&
   (u.hostname==="db."+REF+".supabase.co"&&u.username==="postgres"||
   u.hostname.endsWith(".pooler.supabase.com")&&
   decodeURIComponent(u.username)==="postgres."+REF);
 }catch{return false}
}
async function main(){
 if(e.APP_SUPABASE_URL!==ORIGIN||!e.SUPABASE_SERVICE_ROLE_KEY||
    !validUrl(e.SUPABASE_DB_URL??"")){
  output("EXACT_LEGACY_READ_CREDENTIALS_NOT_CONFIGURED");return;
 }
 const query="SELECT row_to_json(x)::text FROM ("+
  "SELECT (SELECT pg_database_size(current_database()))::bigint AS db_bytes,"+
  "(SELECT count(*) FROM storage.objects)::bigint AS total_storage_objects,"+
  "bucket_id AS bucket,name,(metadata->>'size')::bigint AS object_bytes "+
  "FROM storage.objects ORDER BY object_bytes,bucket_id,name LIMIT 1) x";
 const result=spawnSync("psql",[e.SUPABASE_DB_URL,"-X","-qAt",
   "-v","ON_ERROR_STOP=1","-c",query],{
  env:{...e,PGSSLMODE:"require",PGCONNECT_TIMEOUT:"12"},
  encoding:"utf8",maxBuffer:8192,timeout:30_000,
  stdio:["ignore","pipe","pipe"],
 });
 if(result.error||result.status!==0){output("READ_ONLY_SQL_SOURCE_UNAVAILABLE");return}
 let row;
 try{row=JSON.parse(result.stdout.trim())}catch{
  output("READ_ONLY_SQL_SOURCE_RESPONSE_INVALID");return;
 }
 if(!row||!Number.isSafeInteger(row.db_bytes)||row.db_bytes<0||
  !Number.isSafeInteger(row.total_storage_objects)||row.total_storage_objects<23648||
  !["geomacro-live-intelligence","testnet-tester-avatars"].includes(row.bucket)||
  typeof row.name!=="string"||row.name.length<1||row.name.length>1024||
  !/^[A-Za-z0-9_./-]+$/u.test(row.name)||row.name.includes("..")||
  !Number.isSafeInteger(row.object_bytes)||row.object_bytes<0||
  row.object_bytes>1024*1024){
  output("READ_ONLY_SQL_SOURCE_MANIFEST_NOT_SAFE");return;
 }
 receipt.source_database_bytes=row.db_bytes;
 receipt.storage_metadata_rows=row.total_storage_objects;
 const path=row.name.split("/").map(encodeURIComponent).join("/");
 let response;
 try{
  response=await fetch(ORIGIN+"/storage/v1/object/authenticated/"+
    encodeURIComponent(row.bucket)+"/"+path,{
    method:"GET",
    headers:{apikey:e.SUPABASE_SERVICE_ROLE_KEY,
      authorization:"Bearer "+e.SUPABASE_SERVICE_ROLE_KEY},
    redirect:"error",signal:AbortSignal.timeout(20_000),
  });
 }catch{output("STORAGE_AUTHENTICATED_GET_NETWORK_OR_TIMEOUT");return}
 receipt.http_status=response.status;
 if(response.status===402){output("SUPABASE_ORGANIZATION_BILLING_OR_QUOTA_402_RESTRICTION");return}
 if(response.status===401||response.status===403){
  output("STORAGE_PRIVATE_READ_AUTHORIZATION_REJECTED");return;
 }
 if(response.status===404){output("STORAGE_OBJECT_METADATA_CONTENT_INCONSISTENT");return}
 if(response.status===429){output("STORAGE_PRIVATE_READ_RATE_LIMITED");return}
 if(response.status!==200){output("STORAGE_PRIVATE_READ_HTTP_UNAVAILABLE");return}
 let blob;
 try{blob=Buffer.from(await response.arrayBuffer())}catch{
  output("STORAGE_PRIVATE_READ_BODY_INTERRUPTED");return}
 if(blob.length!==row.object_bytes){
  output("STORAGE_PRIVATE_READ_BYTE_LENGTH_MISMATCH");return;
 }
 receipt.original_storage_bytes_read_verified=true;
 output("AUTHENTICATED_ORIGINAL_STORAGE_BYTES_READ_VERIFIED");
}
try{await main()}catch{output("OLD_SOURCE_PROBE_FAILED_CLOSED")}
