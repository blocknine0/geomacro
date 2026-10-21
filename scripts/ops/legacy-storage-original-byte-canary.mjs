#!/usr/bin/env node
// One original private Storage object from EACH old bucket, with real bytes.
// Read-only, no B2 requests, no disclosure of file name, hash or contents.
import {spawnSync} from "node:child_process";
import {mkdirSync,writeFileSync} from "node:fs";
const ref="ldpwajisioljyjtojvfx",origin="https://"+ref+".supabase.co",env=process.env;
const output="artifacts/legacy-exit/old-storage-byte-canary.json";
const receipt={schema:"geomacro.legacy-source-storage-original-byte-canary.v1",
 source_project:ref,status:"BLOCKED_NO_DELETION",
 original_source_objects_verified:0,
 original_bytes_read:0,object_contents_exposed:false,
 source_supabase_writes:0,source_supabase_deletes:0,b2_requests:0,
 old_project_deletion_authorized:false};
function emit(reason){receipt.reason=reason;mkdirSync("artifacts/legacy-exit",{recursive:true});
 writeFileSync(output,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(receipt))}
function fail(reason){emit(reason);process.exitCode=3}
function pinned(s){try{const u=new URL(s);return
 ["postgres:","postgresql:"].includes(u.protocol)&&u.pathname==="/postgres"&&
 !!u.password&&(u.hostname==="db."+ref+".supabase.co"&&u.username==="postgres"||
 u.hostname.endsWith(".pooler.supabase.com")&&decodeURIComponent(u.username)==="postgres."+ref)}
 catch{return false}}
async function main(){
 if(env.APP_SUPABASE_URL!==origin||!env.SUPABASE_SERVICE_ROLE_KEY||
 !pinned(env.SUPABASE_DB_URL??""))return fail("EXACT_OLD_STORAGE_PROJECT_CREDENTIALS_MISSING");
 const query="SELECT row_to_json(r)::text FROM "+
 "(SELECT DISTINCT ON (bucket_id) bucket_id AS bucket,name,"+
 "(metadata->>'size')::bigint AS size FROM storage.objects "+
 "WHERE bucket_id IN ('geomacro-live-intelligence','testnet-tester-avatars') "+
 "ORDER BY bucket_id,name) r";
 const res=spawnSync("psql",[env.SUPABASE_DB_URL,"-X","-qAt",
 "-v","ON_ERROR_STOP=1","-c",query],{encoding:"utf8",timeout:30000,
 maxBuffer:10000,env:{...env,PGSSLMODE:"require",PGCONNECT_TIMEOUT:"12"}});
 if(res.error||res.status!==0)return fail("ORIGINAL_STORAGE_READ_ONLY_SQL_FAILED");
 let rows;try{rows=res.stdout.trim().split("\n").map(x=>JSON.parse(x))}
 catch{return fail("ORIGINAL_STORAGE_CANARY_METADATA_INVALID")}
 if(rows.length!==2)return fail("ORIGINAL_STORAGE_TWO_BUCKETS_NOT_FOUND");
 for(const r of rows){
  if(!["geomacro-live-intelligence","testnet-tester-avatars"].includes(r.bucket)||
    !/^[A-Za-z0-9_./-]{1,1024}$/.test(r.name)||r.name.includes("..")||
    !Number.isSafeInteger(r.size)||r.size<=0||r.size>26214400)
    return fail("ORIGINAL_STORAGE_CANARY_METADATA_REJECTED");
  const url=origin+"/storage/v1/object/authenticated/"+encodeURIComponent(r.bucket)+
    "/"+r.name.split("/").map(encodeURIComponent).join("/");
  let response;try{response=await fetch(url,{redirect:"error",
    headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY},
    signal:AbortSignal.timeout(25000)})}catch{return fail("SOURCE_STORAGE_NETWORK_UNAVAILABLE")}
  if(response.status!==200)return fail("SOURCE_STORAGE_AUTHENTICATED_READ_DENIED");
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length!==r.size)return fail("SOURCE_STORAGE_ORIGINAL_BYTE_LENGTH_MISMATCH");
  receipt.original_source_objects_verified++;receipt.original_bytes_read+=bytes.length;
 }
 receipt.status="TWO_PRIVATE_BUCKETS_ORIGINAL_BYTES_READBACK_VERIFIED";
 emit("B2_BUNDLES_STILL_REQUIRE_QUOTA_AND_FULL_ORIGINAL_READBACK");
}
try{await main()}catch{fail("SOURCE_STORAGE_CANARY_FAILED_CLOSED")}
