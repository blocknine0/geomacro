import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readPrivateB2Object } from "./b2-private-archive-read.server";

// Archive is private: this module must be called only after app-level
// authentication/authorization. Never expose it directly through a public URL.
const REF = "ldpwajisioljyjtojvfx";
const PREFIX = "geomacro-evidence/v1/legacy-supabase-safe-exit/storage/";
const ROOT_PREFIX = "5eff883cadf814cd"; // Verified source-free full restore 2026-10-22
const BUCKETS = new Set(["geomacro-live-intelligence","testnet-tester-avatars"]);
const SHA = (input: Buffer | string) => createHash("sha256").update(input).digest("hex");
const isDigest = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

type Entry = {id:string;bucket:string;name:string;size:number;updated:string;sha256:string;shard:number;archive_key:string};
type CompleteIndex = {schema:string;source_project:string;verified_shards:number;object_count:number;total_bytes:number;objects:Entry[]};
type Marker = {schema:string;source:string;shard:number;part_manifest_hash:string;bundle_sha256:string;items:number;original_bytes:number;exact_full_body_b2_readback:boolean;all_original_file_sha_verified:boolean};
type BundleManifest = {schema:string;source:string;shard:number;objects:unknown[];hashes:[string,string][]};
const safeName = (v:string) => /^[A-Za-z0-9_./-]{1,1024}$/.test(v) && !v.startsWith("/") && !v.includes("..");

export function originalStorageSelector(bucket:string,name:string) {
  if(!BUCKETS.has(bucket)||!safeName(name)) throw new Error("LEGACY_B2_ORIGINAL_SELECTOR_INVALID");
  return SHA(bucket+"/"+name);
}

function octal(slice:Buffer){
  const raw=slice.toString("ascii").replace(/\0/g,"").trim();
  if(!/^[0-7]{1,11}$/.test(raw))throw Error("LEGACY_B2_TAR_SIZE_INVALID");
  const n=parseInt(raw,8);
  if(!Number.isSafeInteger(n)||n<0||n>120_000_000)throw Error("LEGACY_B2_TAR_SIZE_INVALID");
  return n;
}

/** Strict bounded tar reader. Reject links, duplicates, escaped paths & unknown entries. */
export function restoreOriginalFromVerifiedTar(
  gz:Buffer,marker:Marker,entry:Entry,expectedId:string,
):Buffer {
  if(gz.length<200||gz.length>40_000_000||!isDigest(marker.bundle_sha256)||
     SHA(gz)!==marker.bundle_sha256)
    throw Error("LEGACY_B2_SHARD_SHA256_MISMATCH");
  const inflated=gunzipSync(gz,{maxOutputLength:120_000_000});
  const files=new Map<string,Buffer>();
  let manifest:BundleManifest|null=null,offset=0,zeroBlocks=0;
  for(let count=0;count<10000 && offset+512<=inflated.length;count++){
    const block=inflated.subarray(offset,offset+512);
    if(block.every(x=>x===0)){zeroBlocks++;if(zeroBlocks>=2)break;offset+=512;continue}
    zeroBlocks=0;
    const size=octal(block.subarray(124,136));
    const name=block.subarray(0,100).toString("utf8").split("\0")[0];
    const kind=block[156];
    if(offset+512+size>inflated.length)throw Error("LEGACY_B2_TAR_TRUNCATED");
    const bytes=inflated.subarray(offset+512,offset+512+size);
    if(name==="./manifest.json"||name==="manifest.json"){
      if(kind!==0&&kind!==48)throw Error("LEGACY_B2_TAR_FILE_TYPE_INVALID");
      if(manifest)throw Error("LEGACY_B2_TAR_DUPLICATE");
      try{manifest=JSON.parse(bytes.toString("utf8")) as BundleManifest}catch{throw Error("LEGACY_B2_TAR_MANIFEST_INVALID")}
    }else if(/^\.?\/?files\/[0-9a-f]{64}$/.test(name)){
      if(kind!==0&&kind!==48)throw Error("LEGACY_B2_TAR_FILE_TYPE_INVALID");
      const id=name.slice(-64);
      if(files.has(id))throw Error("LEGACY_B2_TAR_DUPLICATE");
      // Never hold more than the chosen file in memory; read the manifest to
      // validate every original's identity, but expose only the selected one.
      if(id===expectedId)files.set(id,Buffer.from(bytes));
    }else if(!["./","./files/","files/"].includes(name)){
      throw Error("LEGACY_B2_TAR_UNEXPECTED_ENTRY");
    }else if(kind!==53 && kind!==0){throw Error("LEGACY_B2_TAR_FILE_TYPE_INVALID")}
    offset+=512+Math.ceil(size/512)*512;
  }
  if(zeroBlocks<2||!manifest||manifest.schema!=="geomacro.storage-original-bundle.v1"||
     manifest.source!==REF||manifest.shard!==entry.shard||
     !Array.isArray(manifest.objects)||!Array.isArray(manifest.hashes)||
     manifest.objects.length!==marker.items||
     manifest.hashes.length!==marker.items)
    throw Error("LEGACY_B2_TAR_MANIFEST_SHAPE_INVALID");
  const original=files.get(expectedId);
  if(!original||original.length!==entry.size||SHA(original)!==entry.sha256||
     manifest.hashes.filter(x=>Array.isArray(x)&&x[0]===expectedId&&x[1]===entry.sha256).length!==1||
     manifest.objects.filter((x:unknown)=>{
       if(!x||typeof x!=="object")return false;
       const row=x as Record<string,unknown>;
       return row.id===entry.id&&row.bucket===entry.bucket&&row.name===entry.name&&row.size===entry.size&&row.updated===entry.updated;
     }).length!==1)
    throw Error("LEGACY_B2_ORIGINAL_MEMBER_SHA256_MISMATCH");
  return original;
}

export async function readOldSupabaseStorageOriginal(bucket:string,name:string):Promise<Buffer>{
  const id=originalStorageSelector(bucket,name);
  if(process.env.GEOMACRO_LEGACY_B2_COLD_READ!=="enabled")
    throw Error("LEGACY_B2_COLD_READ_NOT_PRODUCTION_ACCEPTED");
  const indexKey=String(process.env.GEOMACRO_LEGACY_B2_COMPLETE_INDEX_KEY??"");
  if(!new RegExp("^"+PREFIX+"complete-[a-f0-9]{24}\\.json$").test(indexKey))
    throw Error("LEGACY_B2_PINNED_COMPLETE_INDEX_KEY_REQUIRED");
  const root=await readPrivateB2Object(indexKey,{maxBytes:20_000_000});
  const expectedRoot=String(process.env.GEOMACRO_LEGACY_B2_COMPLETE_INDEX_SHA256??"");
  if(!isDigest(expectedRoot)||!expectedRoot.startsWith(ROOT_PREFIX)||SHA(root)!==expectedRoot)
    throw Error("LEGACY_B2_ORIGINAL_ROOT_HASH_NOT_PINNED");
  let index:CompleteIndex;
  try{index=JSON.parse(root.toString("utf8")) as CompleteIndex}catch{throw Error("LEGACY_B2_ORIGINAL_INDEX_INVALID")}
  if(index.schema!=="geomacro.legacy-storage-complete-restore-index.v1"||
     index.source_project!==REF||index.verified_shards!==4||
     index.object_count!==23648||index.total_bytes!==57459939||
     !Array.isArray(index.objects)||index.objects.length!==23648)
    throw Error("LEGACY_B2_ORIGINAL_INDEX_INCOMPLETE");
  const matches=index.objects.filter(x=>x.bucket===bucket&&x.name===name);
  if(matches.length!==1)throw Error("LEGACY_B2_ORIGINAL_NOT_UNIQUE");
  const item=matches[0];
  if(!Number.isInteger(item.shard)||item.shard<0||item.shard>3||
     !Number.isSafeInteger(item.size)||item.size<0||item.size>26214400||
     !isDigest(item.sha256)||originalStorageSelector(item.bucket,item.name)!==id)
    throw Error("LEGACY_B2_ORIGINAL_INDEX_ENTRY_INVALID");
  const part=index.objects.filter(x=>x.shard===item.shard).map(x=>({
    id:x.id,bucket:x.bucket,name:x.name,size:x.size,updated:x.updated,
  }));
  const partHash=SHA(JSON.stringify(part)).slice(0,24);
  const stem=PREFIX+"part-"+String(item.shard).padStart(2,"0")+"-"+partHash;
  if(item.archive_key!==stem+".tar.gz")throw Error("LEGACY_B2_ORIGINAL_SHARD_KEY_INVALID");
  const markerBytes=await readPrivateB2Object(stem+".verified.json",{maxBytes:100_000});
  let marker:Marker;
  try{marker=JSON.parse(markerBytes.toString("utf8")) as Marker}catch{throw Error("LEGACY_B2_ORIGINAL_MARKER_INVALID")}
  if(marker.schema!=="geomacro.storage-shard-verified.v1"||
     marker.source!==REF||marker.shard!==item.shard||
     marker.part_manifest_hash!==partHash||marker.items!==part.length||
     marker.original_bytes!==part.reduce((sum,x)=>sum+x.size,0)||
     marker.exact_full_body_b2_readback!==true||
     marker.all_original_file_sha_verified!==true)
    throw Error("LEGACY_B2_ORIGINAL_MARKER_UNTRUSTED");
  const archive=await readPrivateB2Object(item.archive_key,{maxBytes:40_000_000});
  return restoreOriginalFromVerifiedTar(archive,marker,item,id);
}
