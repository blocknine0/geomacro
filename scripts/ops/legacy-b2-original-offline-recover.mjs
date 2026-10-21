#!/usr/bin/env node
/**
 * Fully offline single-original file recovery from the already verified old
 * Supabase Storage --> private B2 four-bundle backup. This tool has NO fetch,
 * database, Supabase SDK, Cloudflare or AWS calls. The operator must first
 * obtain THREE private files from B2: complete index, one verified marker,
 * one corresponding immutable tar.gz archive. No customer bytes printed.
 */
import {createHash} from "node:crypto";
import {readFileSync,openSync,writeSync,closeSync,constants} from "node:fs";
import {spawnSync} from "node:child_process";

const REF="ldpwajisioljyjtojvfx";
const PREFIX="geomacro-evidence/v1/legacy-supabase-safe-exit/storage/";
const SOURCE_HASH_PREFIX="5eff883cadf814cd";
const VALID_BUCKETS=new Set(["geomacro-live-intelligence","testnet-tester-avatars"]);
const sha=value=>createHash("sha256").update(value).digest("hex");
const readLimited=(p,max)=>{
 const bytes=readFileSync(p);
 if(!bytes.length||bytes.length>max)throw Error("PRIVATE_BACKUP_FILE_SIZE_INVALID");
 return bytes;
};
function strictPaths(names) {
 const lines=names.trim().split("\n");
 if(!lines.length||lines.length>10000||lines.some(x=>
  x.includes("..")||x.startsWith("/")||
  !/^(\.\/)?(files\/[a-f0-9]{64}|files\/?|manifest\.json|\.\/?)$/.test(x)))
  throw Error("PRIVATE_TAR_PATH_INVALID");
 return lines;
}
function extractTarMember(archive,member,maxBytes){
 const x=spawnSync("tar",["-xOzf",archive,"--",member],
  {encoding:null,timeout:60000,maxBuffer:maxBytes+1024,
   stdio:["ignore","pipe","pipe"]});
 if(x.error||x.status!==0||!Buffer.isBuffer(x.stdout)||
    x.stdout.length>maxBytes)throw Error("PRIVATE_TAR_MEMBER_EXTRACTION_FAILED");
 return x.stdout;
}
export function verifyPrivateLegacyOriginal(
 {indexBytes,markerBytes,archivePath,bucket,name,expectedRootSha256},
 {strictProduction=true}={},
){
 if(!VALID_BUCKETS.has(bucket)||typeof name!=="string"||
    !/^[A-Za-z0-9_./-]{1,1024}$/.test(name)||name.includes("..")||
    name.startsWith("/"))throw Error("PRIVATE_ORIGINAL_SELECTOR_INVALID");
 if(!/^[a-f0-9]{64}$/.test(expectedRootSha256??"")||
    sha(indexBytes)!==expectedRootSha256||
    strictProduction&&!expectedRootSha256.startsWith(SOURCE_HASH_PREFIX))
   throw Error("PRIVATE_COMPLETE_INDEX_SHA256_UNTRUSTED");
 let index,marker;
 try{index=JSON.parse(indexBytes.toString("utf8"));
     marker=JSON.parse(markerBytes.toString("utf8"))}
 catch{throw Error("PRIVATE_ARCHIVE_JSON_INVALID")}
 if(index?.schema!=="geomacro.legacy-storage-complete-restore-index.v1"||
    index.source_project!==REF||
    index.verified_shards!==4||
    !Array.isArray(index.objects)||
    index.object_count!==index.objects.length||
    (strictProduction&&(index.object_count!==23648||index.total_bytes!==57459939)))
  throw Error("PRIVATE_INDEX_NOT_VERIFIED_COMPLETE_SOURCE_SET");
 const candidates=index.objects.filter(x=>x.bucket===bucket&&x.name===name);
 if(candidates.length!==1)throw Error("PRIVATE_SOURCE_ORIGINAL_NOT_UNIQUE");
 const item=candidates[0];
 const n=item.shard;
 if(!Number.isInteger(n)||n<0||n>3||
    !Number.isSafeInteger(item.size)||item.size<0||item.size>26214400||
    !/^[a-f0-9]{64}$/.test(item.sha256??""))
  throw Error("PRIVATE_INDEX_SELECTED_ORIGINAL_INVALID");
 const part=index.objects.filter(x=>x.shard===n).map(x=>({
  id:x.id,bucket:x.bucket,name:x.name,size:x.size,updated:x.updated
 }));
 const partHash=sha(JSON.stringify(part)).slice(0,24);
 const key=PREFIX+"part-"+String(n).padStart(2,"0")+"-"+partHash+".tar.gz";
 if(item.archive_key!==key||
    marker.schema!=="geomacro.storage-shard-verified.v1"||
    marker.source!==REF||marker.shard!==n||
    marker.part_manifest_hash!==partHash||
    marker.items!==part.length||
    marker.original_bytes!==part.reduce((sum,x)=>sum+x.size,0)||
    marker.exact_full_body_b2_readback!==true||
    marker.all_original_file_sha_verified!==true||
    !/^[a-f0-9]{64}$/.test(marker.bundle_sha256??""))
   throw Error("PRIVATE_SHARD_PROOF_DOES_NOT_BIND_ORIGINAL");
 const compressed=readLimited(archivePath,60*1024*1024);
 if(sha(compressed)!==marker.bundle_sha256)
  throw Error("PRIVATE_ARCHIVE_FULL_BODY_SHA256_MISMATCH");
 const list=spawnSync("tar",["-tzf",archivePath],
  {encoding:"utf8",timeout:60000,maxBuffer:6_000_000,
   stdio:["ignore","pipe","pipe"]});
 if(list.error||list.status!==0)throw Error("PRIVATE_ARCHIVE_MEMBER_INDEX_INVALID");
 const lines=strictPaths(list.stdout);
 const filename=sha(bucket+"/"+name);
 const matches=lines.filter(s=>s==="./files/"+filename||s==="files/"+filename);
 if(matches.length!==1)throw Error("PRIVATE_ORIGINAL_MEMBER_MISSING_OR_DUPLICATE");
 const manifests=lines.filter(s=>s==="./manifest.json"||s==="manifest.json");
 if(manifests.length!==1)throw Error("PRIVATE_ORIGINAL_MANIFEST_NOT_UNIQUE");
 let manifest;
 try{manifest=JSON.parse(extractTarMember(archivePath,manifests[0],8_000_000).toString("utf8"))}
 catch{throw Error("PRIVATE_ORIGINAL_EMBEDDED_MANIFEST_INVALID")}
 if(manifest?.schema!=="geomacro.storage-original-bundle.v1"||
    manifest.source!==REF||manifest.shard!==n||
    JSON.stringify(manifest.objects)!==JSON.stringify(part)||
    !Array.isArray(manifest.hashes)||manifest.hashes.length!==part.length)
   throw Error("PRIVATE_ORIGINAL_EMBEDDED_MANIFEST_DRIFT");
 const matchesInManifest=manifest.hashes.filter(x=>
   Array.isArray(x)&&x[0]===filename&&x[1]===item.sha256);
 if(matchesInManifest.length!==1)throw Error("PRIVATE_SOURCE_AND_ARCHIVE_DIGEST_DISAGREE");
 const bytes=extractTarMember(archivePath,matches[0],26214400);
 if(bytes.length!==item.size||sha(bytes)!==item.sha256)
  throw Error("PRIVATE_ORIGINAL_BYTE_SHA256_RESTORE_FAILED");
 return Object.freeze({bytes,shard:n,byteCount:bytes.length,sha256:item.sha256});
}
function argumentsOf(args){
 const opts={};
 for(let i=0;i<args.length;i+=2){
  const key=args[i],value=args[i+1];
  if(!/^--(index|marker|bundle|bucket|object|output|root-sha256)$/.test(key??"")||
     !value||opts[key])throw Error("PRIVATE_RECOVERY_ARGUMENT_INVALID");
  opts[key]=value;
 }
 if(Object.keys(opts).length!==7)throw Error("PRIVATE_RECOVERY_ARGUMENT_INCOMPLETE");
 return opts;
}
if(process.argv[1]?.endsWith("legacy-b2-original-offline-recover.mjs")){
 try{
  const o=argumentsOf(process.argv.slice(2));
  const original=verifyPrivateLegacyOriginal({
   indexBytes:readLimited(o["--index"],30*1024*1024),
   markerBytes:readLimited(o["--marker"],32*1024),
   archivePath:o["--bundle"],bucket:o["--bucket"],name:o["--object"],
   expectedRootSha256:o["--root-sha256"]});
  // O_EXCL + O_NOFOLLOW blocks clobbering old files and following symlinks.
  const fd=openSync(o["--output"],
    constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{writeSync(fd,original.bytes)}finally{closeSync(fd)}
  // No original name, source data, credential or local path in stdout.
  console.log(JSON.stringify({status:"VERIFIED_ORIGINAL_RESTORED_OFFLINE",
    source_supabase_requests:0,b2_requests:0,output_sha256:original.sha256,
    output_bytes:original.byteCount,original_shard:original.shard}));
 }catch(err){
  const e=err instanceof Error?err.message:"PRIVATE_OFFLINE_RESTORE_FAILED";
  console.error(JSON.stringify({status:"BLOCKED_NO_OUTPUT",reason:
    /^PRIVATE_[A-Z0-9_]+$/.test(e)?e:"PRIVATE_OFFLINE_RESTORE_FAILED"}));
  process.exitCode=3;
 }
}
