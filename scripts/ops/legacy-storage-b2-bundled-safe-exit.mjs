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
 const indexed=new Map(part.map(x=>[hash(x.bucket+"/"+x.name),x]));
 const wanted=[...indexed.keys()].sort();
 if(indexed.size!==part.length||JSON.stringify(actualNames)!==JSON.stringify(wanted))return false;
 const verified=new Set();
 for(const [id,digest] of data.hashes){
  if(!indexed.has(id)||verified.has(id)||typeof digest!=="string"||
     !/^[a-f0-9]{64}$/.test(digest))return false;
  const bytes=readFileSync(join(extract,"files",id));
  const meta=indexed.get(id);
  if(bytes.length!==meta.size||hash(bytes)!==digest)return false;
  verified.add(id);
 }
 if(verified.size!==part.length)return false;
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
 // Free-only archive admission: include ALL buckets and historic versions,
 // not just currently visible objects. Apply a 1 GiB reserve under B2's
 // advertised first-10-GiB free storage allowance. Inventory is READ ONLY.
 const accountList=aws(["list-buckets","--output","json"],inventoryCred,2_000_000);
 let names;
 try {names=JSON.parse(accountList??"null")?.Buckets?.map(x=>x.Name)}
 catch{return halt("B2_ACCOUNT_CAPACITY_INVENTORY_UNREADABLE")}
 if(!Array.isArray(names)||names.length<1||names.length>40||
    !names.includes(bucket)||names.some(x=>!/^[a-z0-9-]{3,63}$/.test(x)))
  return halt("B2_ACCOUNT_WIDE_FREE_STORAGE_CAPACITY_NOT_PROVEN");
 let usedStorageBytes=0;
 for(const inventoryBucket of names){
  const versions=aws(["list-object-versions","--bucket",inventoryBucket,
    "--output","json"],inventoryCred,60_000_000);
  let rows;
  try{rows=JSON.parse(versions??"null")?.Versions}
  catch{return halt("B2_HISTORIC_STORAGE_VERSIONS_INVENTORY_INVALID")}
  if(!Array.isArray(rows))return halt("B2_HISTORIC_STORAGE_VERSIONS_INVENTORY_MISSING");
  for(const version of rows){
   const size=version?.Size;
   if(!Number.isSafeInteger(size)||size<0)return halt("B2_ARCHIVE_VERSION_SIZE_INVALID");
   usedStorageBytes+=size;
   if(!Number.isSafeInteger(usedStorageBytes)||
      usedStorageBytes+total>9*1024*1024*1024)
    return halt("B2_FREE_ACCOUNT_WIDE_STORAGE_HEADROOM_TOO_SMALL");
  }
 }
 report.b2_account_free_storage_headroom_verified=true;
 const listing=aws(["list-objects-v2","--bucket",bucket,"--prefix",prefix,"--output","json"],inventoryCred);
 if(listing===null)return halt("B2_PRIVATE_STORAGE_LIST_UNAVAILABLE");
 let known;try{known=new Set((JSON.parse(listing).Contents||[]).map(x=>x.Key))}
 catch{return halt("B2_PRIVATE_STORAGE_LIST_INVALID")}
 const stem=n=>prefix+"part-"+String(n).padStart(2,"0")+"-"+ids[n];
 const complete=parts.map((p,n)=>known.has(stem(n)+".verified.json"));
 const n=complete.findIndex(x=>!x);
 report.verified_marker_shards=complete.filter(Boolean).length;report.remaining_shards=complete.filter(x=>!x).length;
 if(n===-1){
  // Never trust marker presence alone. Read back and verify ALL 4 bundles and
  // every original member in a separate final proof run.
  const gov=createB2D1AccountGovernor({env:{
   ...env,B2_ACCOUNT_QUOTA_WORKFLOW_ID:"legacy_storage_exit"}});
  let quota;try{quota=await gov.status()}catch{return halt("B2_D1_GOVERNOR_UNAVAILABLE")}
  // 2 GETs per shard (receipt + archive), then 1 GET for final private index,
  // while preserving 5 GETs for serving and safety recovery.
  if(quota.used.GET+9>quota.limits.GET-5||
   quota.used.PUT+1>quota.limits.PUT-3||
   quota.used.total+10>quota.limits.total-8)
   return halt("FINAL_FULL_RESTORE_B2_PROTECTED_HEADROOM_REQUIRED");
  const privateIndex=[];
  const writeCred=credentials(env.B2_KEY_ID,env.B2_APPLICATION_KEY);
  const rootKey=prefix+"complete-"+hash(JSON.stringify(parts.map(p=>hash(JSON.stringify(p))))).slice(0,24)+".json";
  for(let i=0;i<shards;i++){
   const restore=join(tmp,"final-"+String(i));mkdirSync(restore);
   const receiptPath=join(tmp,"marker-"+String(i)+".json");
   const archivePath=join(tmp,"bundle-"+String(i)+".tar.gz");
   try{await gov.reserve("GET")}catch{return halt("FINAL_MARKER_GET_QUOTA_DENIED")}
   if(aws(["get-object","--bucket",bucket,"--key",stem(i)+".verified.json",
        receiptPath,"--output","json"],writeCred)===null)return halt("FINAL_MARKER_NOT_READABLE");
   let receipt;try{receipt=JSON.parse(readFileSync(receiptPath,"utf8"))}
   catch{return halt("FINAL_MARKER_INVALID")}
   if(receipt.schema!=="geomacro.storage-shard-verified.v1"||
    receipt.source!==ref||receipt.shard!==i||receipt.part_manifest_hash!==ids[i]||
    receipt.items!==parts[i].length||!/^[a-f0-9]{64}$/.test(receipt.bundle_sha256||"")||
    receipt.original_bytes!==parts[i].reduce((a,b)=>a+b.size,0)||
    receipt.exact_full_body_b2_readback!==true||
    receipt.all_original_file_sha_verified!==true)
    return halt("FINAL_MARKER_CONTENT_DOES_NOT_MATCH_SOURCE");
   try{await gov.reserve("GET")}catch{return halt("FINAL_ARCHIVE_GET_QUOTA_DENIED")}
   if(aws(["get-object","--bucket",bucket,"--key",stem(i)+".tar.gz",
      archivePath,"--output","json"],writeCred)===null)return halt("FINAL_ARCHIVE_READBACK_FAILED");
   if(hash(readFileSync(archivePath))!==receipt.bundle_sha256)
    return halt("FINAL_ARCHIVE_BYTE_HASH_MISMATCH");
   const listing=command("tar",["-tzf",archivePath],{},5_000_000);
   if(listing===null||listing.trim().split("\n").some(x=>x.includes("..")||
       x.startsWith("/")||! /^(\.\/)?(files\/[a-f0-9]{64}|files\/?|manifest\.json|\.\/?)$/.test(x)))
    return halt("FINAL_ARCHIVE_LAYOUT_INVALID");
   if(command("tar",["-xzf",archivePath,"-C",restore])===null||
      !checkBundle(restore,parts[i],null))return halt("FINAL_RESTORED_ORIGINAL_FILE_HASH_FAILED");
   let manifest;try{manifest=JSON.parse(readFileSync(join(restore,"manifest.json"),"utf8"))}
   catch{return halt("FINAL_RESTORED_MANIFEST_INVALID")}
   const byId=new Map(manifest.hashes);
   for(const item of parts[i]){
     const id=hash(item.bucket+"/"+item.name);
     const digest=byId.get(id);
     if(!/^[a-f0-9]{64}$/.test(digest||""))return halt("FINAL_SOURCE_OBJECT_DIGEST_MISSING");
     privateIndex.push({...item,sha256:digest,shard:i,archive_key:stem(i)+".tar.gz"});
   }
   report.per_object_b2_sha_verified+=parts[i].length;
  }
  if(privateIndex.length!==rows.length||
   new Set(privateIndex.map(x=>x.bucket+"/"+x.name)).size!==rows.length)
   return halt("FINAL_ARCHIVE_ACCOUNT_WIDE_OBJECT_SET_INVALID");
  const finalManifest={
   schema:"geomacro.legacy-storage-complete-restore-index.v1",
   source_project:ref,object_count:rows.length,total_bytes:total,
   verified_shards:shards,objects:privateIndex,
   source_root_sha256:hash(JSON.stringify(parts.map(p=>hash(JSON.stringify(p))))),
  };
  const file=join(tmp,"final-index.json"),downloaded=join(tmp,"final-index-readback.json");
  writeFileSync(file,JSON.stringify(finalManifest),{mode:0o600});
  const expected=hash(readFileSync(file));
  if(!known.has(rootKey)){
   try{await gov.reserve("PUT")}catch{return halt("FINAL_INDEX_PUT_QUOTA_DENIED")}
   const put=aws(["put-object","--bucket",bucket,"--key",rootKey,
     "--body",file,"--server-side-encryption","AES256","--output","json"],writeCred);
   let ack;try{ack=JSON.parse(put)}catch{return halt("FINAL_PRIVATE_INDEX_UPLOAD_FAILED")}
   if(ack?.ServerSideEncryption!=="AES256")return halt("FINAL_INDEX_ENCRYPTION_NOT_PROVEN");
   report.b2_puts++;
  }
  try{await gov.reserve("GET")}catch{return halt("FINAL_INDEX_GET_QUOTA_DENIED")}
  if(aws(["get-object","--bucket",bucket,"--key",rootKey,
    downloaded,"--output","json"],writeCred)===null||
    hash(readFileSync(downloaded))!==expected)return halt("FINAL_INDEX_INDEPENDENT_READBACK_FAILED");
  report.b2_gets+=9;
  report.storage_fully_migrated=true;
  report.final_index_sha256_prefix=expected.slice(0,16);
  report.verified_marker_shards=shards;report.remaining_shards=0;
  report.status="ALL_OLD_STORAGE_ORIGINAL_BYTES_IN_PRIVATE_B2_RESTORED_AND_VERIFIED";
  return save("SUPABASE_STORAGE_RETRIEVAL_CUTOVER_AND_DELETION_STILL_PENDING");
 }
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
