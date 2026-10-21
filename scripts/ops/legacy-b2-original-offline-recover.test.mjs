import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {verifyPrivateLegacyOriginal} from "./legacy-b2-original-offline-recover.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex");
function fixture(){
 const temp=mkdtempSync(join(tmpdir(),"geomacro-b2-offline-test-"));
 const source=join(temp,"src");
 mkdirSync(join(source,"files"),{recursive:true});
 const bucket="testnet-tester-avatars",name="example/test.png",bytes=Buffer.from("private fixture bytes never from users");
 const id=sha(bucket+"/"+name);
 writeFileSync(join(source,"files",id),bytes);
 const part=[{id:"b5f35baf-b7b6-47d1-ac4f-9e4148e1af53",bucket,name,size:bytes.length,
  updated:"2026-10-21 00:00:00+00"}];
 const key="geomacro-evidence/v1/legacy-supabase-safe-exit/storage/part-00-"+
 sha(JSON.stringify(part)).slice(0,24)+".tar.gz";
 const manifest={schema:"geomacro.storage-original-bundle.v1",
  source:"ldpwajisioljyjtojvfx",shard:0,objects:part,hashes:[[id,sha(bytes)]]};
 writeFileSync(join(source,"manifest.json"),JSON.stringify(manifest));
 const archive=join(temp,"part.tar.gz");
 const tar=spawnSync("tar",["-czf",archive,"-C",source,"."],{encoding:"utf8"});
 assert.equal(tar.status,0);
 const marker={schema:"geomacro.storage-shard-verified.v1",
  source:"ldpwajisioljyjtojvfx",shard:0,part_manifest_hash:sha(JSON.stringify(part)).slice(0,24),
  items:1,original_bytes:bytes.length,exact_full_body_b2_readback:true,
  all_original_file_sha_verified:true,bundle_sha256:sha(readFileSync(archive))};
 const index={schema:"geomacro.legacy-storage-complete-restore-index.v1",
  source_project:"ldpwajisioljyjtojvfx",verified_shards:4,object_count:1,total_bytes:bytes.length,
  objects:[{...part[0],sha256:sha(bytes),shard:0,archive_key:key}]};
 const indexBytes=Buffer.from(JSON.stringify(index)),markerBytes=Buffer.from(JSON.stringify(marker));
 return {temp,archive,archivePath:archive,bucket,name,bytes,index,indexBytes,marker,markerBytes,
  expectedRootSha256:sha(indexBytes)};
}
test("recover private original from manifest, marker and compressed archive without network",()=>{
 const f=fixture();
 try{
 const x=verifyPrivateLegacyOriginal(f,{strictProduction:false});
 assert.deepEqual(x.bytes,f.bytes);
 assert.equal(x.byteCount,f.bytes.length);
 assert.equal(x.shard,0);
 }finally{rmSync(f.temp,{recursive:true,force:true})}
});
test("tampered B2 archive byte cannot pass full SHA256 check",()=>{
 const f=fixture();
 try{
 const corrupt=join(f.temp,"corrupt");
 writeFileSync(corrupt,Buffer.concat([readFileSync(f.archive),Buffer.from("bad")]));
 assert.throws(()=>verifyPrivateLegacyOriginal({...f,archivePath:corrupt},
  {strictProduction:false}),/PRIVATE_ARCHIVE_FULL_BODY_SHA256_MISMATCH/);
 }finally{rmSync(f.temp,{recursive:true,force:true})}
});
test("index digest must match, and live production root cannot use fixture proof",()=>{
 const f=fixture();
 try{
 assert.throws(()=>verifyPrivateLegacyOriginal({...f,expectedRootSha256:"0".repeat(64)},
  {strictProduction:false}),/PRIVATE_COMPLETE_INDEX_SHA256_UNTRUSTED/);
 assert.throws(()=>verifyPrivateLegacyOriginal(f),
 /PRIVATE_COMPLETE_INDEX_SHA256_UNTRUSTED/);
 }finally{rmSync(f.temp,{recursive:true,force:true})}
});
test("wrong body key and source object selector are rejected before any output",()=>{
 const f=fixture();
 try{
 assert.throws(()=>verifyPrivateLegacyOriginal({...f,name:"../../secret"},
  {strictProduction:false}),/PRIVATE_ORIGINAL_SELECTOR_INVALID/);
 assert.throws(()=>verifyPrivateLegacyOriginal({...f,bucket:"public"},
  {strictProduction:false}),/PRIVATE_ORIGINAL_SELECTOR_INVALID/);
 const bad={...f.marker,bundle_sha256:"0".repeat(64)};
 assert.throws(()=>verifyPrivateLegacyOriginal({...f,markerBytes:Buffer.from(JSON.stringify(bad))},
  {strictProduction:false}),/PRIVATE_ARCHIVE_FULL_BODY_SHA256_MISMATCH/);
 }finally{rmSync(f.temp,{recursive:true,force:true})}
});
