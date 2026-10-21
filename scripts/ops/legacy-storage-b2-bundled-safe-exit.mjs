#!/usr/bin/env node
// NO DELETION, NO PUBLIC DATA: private, resumable, original-byte B2 shards.
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,readdirSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";
const ref="ldpwajisioljyjtojvfx", origin="https://"+ref+".supabase.co";
const bucket="geomacro-private-archive",endpoint="https://s3.us-east-005.backblazeb2.com";
const prefix="geomacro-evidence/v1/legacy-supabase-safe-exit/storage/";
// Four source-frozen immutable shards keep private B2 Class-B GETs low (four vs 24).
const output="artifacts/legacy-exit/legacy-storage-bundles.json",shards=4;
const env=process.env,tmp=mkdtempSync(join(tmpdir(),"geomacro-legacy-"));
const hash=x=>createHash("sha256").update(x).digest("hex");
const report={schema:"geomacro.legacy-storage-b2-bundles.v1",
 source_project:ref,checked_at:new Date().toISOString(),status:"BLOCKED_NO_DELETION",
 source_objects_downloaded:0,source_bytes_downloaded:0,per_object_b2_sha_verified:0,
 b2_gets:0,b2_puts:0,completed_shards_this_run:0,storage_fully_migrated:false,
 source_supabase_writes:0,source_supabase_deletes:0,b2_deletes:0,payments:0,
 old_supabase_deletion_authorized:false};
function save(reason){report.reason=reason;mkdirSync("artifacts/legacy-exit",{recursive:true});
 writeFileSync(output,JSON.stringify(report,null,2)+"\n",{mode:0o600});console.log(JSON.stringify(report))}
function halt(code){report.status="BLOCKED_NO_DELETION";save(code);process.exitCode=3}
function command(cmd,args,opts={},max=12_000_000,timeout=150000){
 const result=spawnSync(cmd,args,{env:{...env,...opts},encoding:"utf8",timeout,maxBuffer:max,
  stdio:["ignore","pipe","pipe"]});return result.status===0&&!result.error?result.stdout:null;
}
function postgresPinned(s){try{const u=new URL(s);return ["postgres:","postgresql:"].includes(u.protocol)&&u.pathname==="/postgres"&&
  !!u.password&&(u.hostname==="db."+ref+".supabase.co"&&u.username==="postgres"||
  u.hostname.endsWith(".pooler.supabase.com")&&decodeURIComponent(u.username)==="postgres."+ref)}
 catch{return false}}
function credentials(id,secret){return {AWS_ACCESS_KEY_ID:id,AWS_SECRET_ACCESS_KEY:secret,
 AWS_DEFAULT_REGION:"us-east-005",AWS_EC2_METADATA_DISABLED:"true",AWS_MAX_ATTEMPTS:"1"}}
function aws(args,auth,limit=5000000){return command("aws",
 ["--endpoint-url",endpoint,"s3api",...args],auth,limit,300000)}
function validate(x){return x&&/^[a-f0-9-]{36}$/i.test(x.id||"")&&
 ["geomacro-live-intelligence","testnet-tester-avatars"].includes(x.bucket)&&
 typeof x.name==="string"&&/^[A-Za-z0-9_./-]{1,1024}$/.test(x.name)&&
 !x.name.includes("..")&&!x.name.startsWith("/")&&typeof x.updated==="string"&&
 Number.isSafeInteger(x.size)&&x.size>=0&&x.size<=26214400}
function buildParts(rows){
 const result=Array.from({length:shards},()=>[]);
 for(const r of rows){const i=parseInt(hash(r.bucket+"/"+r.name).slice(0,2),16)%shards;result[i].push(r)}
 return result.map(r=>r.sort((a,b)=>(a.bucket+"/"+a.name).localeCompare(b.bucket+"/"+b.name)));
}
async function fetchOriginal(x,secret,folder){
 const url=origin+"/storage/v1/object/authenticated/"+encodeURIComponent(x.bucket)+"/"+
  x.name.split("/").map(encodeURIComponent).join("/");
 let response;
 for(let attempt=0;attempt<2;attempt++){
  try{response=await fetch(url,{redirect:"error",headers:{
   apikey:secret,Authorization:"Bearer "+secret},signal:AbortSignal.timeout(25000)})}
  catch{return null}
  if((response.status===429||response.status>=500)&&attempt===0){
    await new Promise(done=>setTimeout(done,1500));continue}
  break;
 }
 if(!response||response.status!==200)return null;
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length!==x.size)return null;
 const id=hash(x.bucket+"/"+x.name);writeFileSync(join(folder,id),bytes,{mode:0o600});
 report.source_objects_downloaded++;report.source_bytes_downloaded+=bytes.length;
 return [id,hash(bytes)];
}
function checkBundle(extract,part,expectedHashes){
 let data;try{data=JSON.parse(readFileSync(join(extract,"manifest.json"),"utf8"))}
 catch{return false}
 if(data.schema!=="geomacro.storage-original-bundle.v1"||data.source!==ref||
    JSON.stringify(data.objects)!==JSON.stringify(part)||data.hashes.length!==part.length)return false;
 const actualNames=readdirSync(join(extract,"files")).sort();
 const wanted=part.map(x=>hash(x.bucket+"/"+x.name)).sort();
 if(JSON.stringify(actualNames)!==JSON.stringify(wanted))return false;
 for(const [id,digest] of data.hashes){
  if(!wanted.includes(id)||typeof digest!=="string"||!/^[a-f0-9]{64}$/.test(digest))return false;
  const bytes=readFileSync(join(extract,"files",id));
  const meta=part.find(x=>hash(x.bucket+"/"+x.name)===id);
  if(!meta||bytes.length!==meta.size||hash(bytes)!==digest)return false;
 }
 if(expectedHashes&&JSON.stringify(data.hashes)!==JSON.stringify(expectedHashes))return false;
 return true;
}
async function main(){
 if(env.APP_SUPABASE_URL!==origin||!postgresPinned(env.SUPABASE_DB_URL||"")||
 !env.SUPABASE_SERVICE_ROLE_KEY)return halt("OLD_SOURCE_NOT_PINNED");
 for(const name of ["B2_KEY_ID","B2_APPLICATION_KEY","B2_LEGACY_INVENTORY_KEY_ID",
 "B2_LEGACY_INVENTORY_APPLICATION_KEY","CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID",
 "D1_DATABASE_ID"])if(!env[name])return halt("PROTECTED_B2_D1_CONFIG_MISSING");
 const query="SELECT row_to_json(x)::text FROM (SELECT id::text AS id,bucket_id AS bucket,"+
 "name,(metadata->>'size')::bigint AS size,updated_at::text AS updated FROM storage.objects "+
 "ORDER BY bucket_id,name) x";
 const raw=command("psql",[env.SUPABASE_DB_URL,"-X","-qAt","-v","ON_ERROR_STOP=1","-c",query],
 {PGSSLMODE:"require",PGCONNECT_TIMEOUT:"15"},16_000_000,60000);
 if(raw===null)return halt("READ_ONLY_SOURCE_STORAGE_INVENTORY_FAILED");
 let rows;try{rows=raw.trim().split("\n").map(x=>JSON.parse(x))}
 catch{return halt("SOURCE_STORAGE_INVENTORY_INVALID")}
 if(rows.length<23648||rows.some(x=>!validate(x))||
 new Set(rows.map(x=>x.bucket+"/"+x.name)).size!==rows.length)
 return halt("SOURCE_STORAGE_ROSTER_INCOMPLETE");
 const total=rows.reduce((n,x)=>n+x.size,0);
 if(total<57459939)return halt("SOURCE_BYTES_BELOW_CERTIFIED_BASELINE");
 report.source_metadata_count=rows.length;report.source_metadata_bytes=total;
 const parts=buildParts(rows),ids=parts.map(p=>hash(JSON.stringify(p)).slice(0,24));
 if(parts.some(p=>p.length===0||p.reduce((n,x)=>n+x.size,0)>60*1024*1024))
 return halt("STORAGE_BUNDLE_PART_UNBOUNDED");
 const inventoryCred=credentials(env.B2_LEGACY_INVENTORY_KEY_ID,
  env.B2_LEGACY_INVENTORY_APPLICATION_KEY);
 const listing=aws(["list-objects-v2","--bucket",bucket,"--prefix",prefix,"--output","json"],inventoryCred);
 if(listing===null)return halt("B2_PRIVATE_STORAGE_LIST_UNAVAILABLE");
 let known;try{known=new Set((JSON.parse(listing).Contents||[]).map(x=>x.Key))}
 catch{return halt("B2_PRIVATE_STORAGE_LIST_INVALID")}
 const stem=n=>prefix+"part-"+String(n).padStart(2,"0")+"-"+ids[n];
 const complete=parts.map((p,n)=>known.has(stem(n)+".verified.json"));
 const n=complete.findIndex(x=>!x);
 report.verified_marker_shards=complete.filter(Boolean).length;report.remaining_shards=complete.filter(x=>!x).length;
 if(n===-1){report.status="ALL_MARKERS_PRESENT_FINAL_AUDIT_PENDING";
  return save("COMPLETE_REVALIDATION_AND_RUNTIME_CUTOVER_NOT_DONE")}
 report.selected_shard=n;report.selected_shard_object_count=parts[n].length;
 let gov;try{gov=createB2D1AccountGovernor({env:{
  ...env,B2_ACCOUNT_QUOTA_WORKFLOW_ID:"legacy_storage_exit"}})}catch{return halt("B2_D1_GOVERNOR_MISSING")}
 let quota;try{quota=await gov.status()}catch{return halt("B2_D1_GOVERNOR_UNAVAILABLE")}
 if(quota.used.GET>=quota.limits.GET-5||quota.used.PUT>=quota.limits.PUT-3||
 quota.used.total>=quota.limits.total-8)return halt("B2_PROTECTED_HEADROOM_REQUIRED");
 const source=join(tmp,"source"),extract=join(tmp,"extracted");
 mkdirSync(join(source,"files"),{recursive:true});mkdirSync(extract);
 // Eight workers cap source-only reads. Race-free receipt counts run on one Node
 // event loop; each worker processes disjoint source paths. Any missing or
 // mismatched byte stops the entire shard BEFORE B2 is touched.
 const hashes=new Array(parts[n].length);
 let next=0;
 let failed=false;
 await Promise.all(Array.from({length:8},async()=>{
  while(!failed){
   const index=next++;
   if(index>=parts[n].length)return;
   const result=await fetchOriginal(parts[n][index],env.SUPABASE_SERVICE_ROLE_KEY,join(source,"files"));
   if(!result){failed=true;return}
   hashes[index]=result;
  }
 }));
 if(failed||hashes.some(x=>!x))return halt("OLD_STORAGE_AUTHENTICATED_BYTES_UNAVAILABLE");
 writeFileSync(join(source,"manifest.json"),JSON.stringify({
  schema:"geomacro.storage-original-bundle.v1",source:ref,shard:n,
  objects:parts[n],hashes}),{mode:0o600});
 const tar=join(tmp,"original.tar.gz");
 if(command("tar",["-czf",tar,"-C",source,"."])===null)
 return halt("PRIVATE_STORAGE_BUNDLE_BUILD_FAILED");
 const local=readFileSync(tar);
 if(local.length>60*1024*1024)return halt("PRIVATE_STORAGE_BUNDLE_EXCEEDS_LIMIT");
 const writeCred=credentials(env.B2_KEY_ID,env.B2_APPLICATION_KEY),object=stem(n)+".tar.gz";
 if(!known.has(object)){
  try{await gov.reserve("PUT")}catch{return halt("B2_BUNDLE_PUT_QUOTA_DENIED")}
  const response=aws(["put-object","--bucket",bucket,"--key",object,
   "--body",tar,"--server-side-encryption","AES256","--output","json"],writeCred);
  let put;try{put=JSON.parse(response)}catch{return halt("B2_BUNDLE_UPLOAD_FAILED")}
  if(put?.ServerSideEncryption!=="AES256")return halt("B2_ENCRYPTION_NOT_CONFIRMED");
  report.b2_puts++;
 }
 try{await gov.reserve("GET")}catch{return halt("B2_BUNDLE_GET_QUOTA_DENIED")}
 const downloaded=join(tmp,"b2-restored.tar.gz");
 if(aws(["get-object","--bucket",bucket,"--key",object,
   downloaded,"--output","json"],writeCred)===null||
  !existsSync(downloaded)||hash(readFileSync(downloaded))!==hash(local))
 return halt("B2_FULL_BYTE_READBACK_SHA_MISMATCH");
 report.b2_gets++;
 const entries=command("tar",["-tzf",downloaded],{},3_000_000);
 if(entries===null||entries.trim().split("\n").some(x=>x.includes("..")||
 x.startsWith("/")||!/^(\.\/)?(files\/[a-f0-9]{64}|files\/?|manifest\.json|\.\/?)$/.test(x)))
 return halt("B2_BUNDLE_UNSAFE_ARCHIVE_LAYOUT");
 if(command("tar",["-xzf",downloaded,"-C",extract])===null||
 !checkBundle(extract,parts[n],hashes))return halt("B2_RESTORED_ORIGINAL_OBJECT_HASH_MISMATCH");
 report.per_object_b2_sha_verified=parts[n].length;
 const marker=join(tmp,"receipt.json");
 writeFileSync(marker,JSON.stringify({
  schema:"geomacro.storage-shard-verified.v1",source:ref,shard:n,part_manifest_hash:ids[n],
  bundle_sha256:hash(local),items:parts[n].length,
  original_bytes:parts[n].reduce((sum,x)=>sum+x.size,0),
  exact_full_body_b2_readback:true,all_original_file_sha_verified:true
 }),{mode:0o600});
 try{await gov.reserve("PUT")}catch{return halt("B2_VERIFICATION_MARKER_QUOTA_DENIED")}
 const m=aws(["put-object","--bucket",bucket,"--key",stem(n)+".verified.json",
  "--body",marker,"--server-side-encryption","AES256","--output","json"],writeCred);
 let ack;try{ack=JSON.parse(m)}catch{return halt("B2_VERIFIED_MARKER_UPLOAD_FAILED")}
 if(ack?.ServerSideEncryption!=="AES256")return halt("B2_MARKER_NOT_ENCRYPTED");
 report.b2_puts++;report.completed_shards_this_run=1;
 report.verified_marker_shards++;report.remaining_shards--;
 report.status="ONE_COMPLETE_STORAGE_SHARD_BYTES_INDEPENDENTLY_VERIFIED";
 save("NEXT_SHARDS_AND_FINAL_WHOLE_ACCOUNT_AUDIT_REQUIRED");
}
try{await main()}catch{halt("STORAGE_EXIT_FAILED_CLOSED")}finally{rmSync(tmp,{recursive:true,force:true})}
