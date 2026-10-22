import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { originalStorageSelector,restoreOriginalFromVerifiedTar } from "../lib/legacy-storage-b2-original.server";

const sha=(x:Buffer|string)=>createHash("sha256").update(x).digest("hex");
function tarFile(name:string,content:Buffer,type=48){
  const head=Buffer.alloc(512);
  Buffer.from(name).copy(head,0);
  Buffer.from("0000644\0").copy(head,100);
  Buffer.from("0000000\0").copy(head,108);
  Buffer.from("0000000\0").copy(head,116);
  Buffer.from(content.length.toString(8).padStart(11,"0")+"\0").copy(head,124);
  Buffer.from("00000000000\0").copy(head,136);
  head[156]=type;
  Buffer.from("ustar\0").copy(head,257);
  head.fill(32,148,156);
  const checksum=head.reduce((sum,x)=>sum+x,0);
  Buffer.from(checksum.toString(8).padStart(6,"0")+"\0 ").copy(head,148);
  const pad=Buffer.alloc((512-content.length%512)%512);
  return Buffer.concat([head,content,pad]);
}
describe("verified private original from immutable tar bundle",()=>{
 const bucket="testnet-tester-avatars",name="person/file.jpg";
 const id=originalStorageSelector(bucket,name);
 const bytes=Buffer.from(Array.from({length:2018},(_,i)=>(i*i+119*i)%251));
 const item={id:"12e6cde7-421a-4f5e-9e8d-54297348ca82",bucket,name,size:bytes.length,
   updated:"2026-10-01 08:23:33+00",sha256:sha(bytes),shard:2,
   archive_key:"geomacro-evidence/v1/legacy-supabase-safe-exit/storage/part-02-abcdefghijklmnopqrstuvwx.tar.gz"};
 const manifest=Buffer.from(JSON.stringify({schema:"geomacro.storage-original-bundle.v1",source:"ldpwajisioljyjtojvfx",
  shard:2,objects:[{id:item.id,bucket,name,size:bytes.length,updated:item.updated}],hashes:[[id,sha(bytes)]]}));
 const build=(payload=bytes,fileName="./files/"+id,fileType=48)=>gzipSync(Buffer.concat([
  tarFile("./manifest.json",manifest),tarFile(fileName,payload,fileType),Buffer.alloc(1024)]));
 const original=build();
 const marker={schema:"geomacro.storage-shard-verified.v1",source:"ldpwajisioljyjtojvfx",
  shard:2,part_manifest_hash:"0123456789abcdef01234567",bundle_sha256:sha(original),items:1,
  original_bytes:bytes.length,exact_full_body_b2_readback:true,all_original_file_sha_verified:true};
 it("recovers exact original without legacy Supabase",()=>{
  expect(restoreOriginalFromVerifiedTar(original,marker,item,id).equals(bytes)).toBe(true);
 });
 it("rejects altered full archive",()=>{
  expect(()=>restoreOriginalFromVerifiedTar(Buffer.concat([original,Buffer.from("x")]),marker,item,id))
   .toThrow("LEGACY_B2_SHARD_SHA256_MISMATCH");
 });
 it("rejects altered original payload even if tar marker matches",()=>{
  const changed=build(Buffer.alloc(bytes.length,17));
  expect(()=>restoreOriginalFromVerifiedTar(changed,{...marker,bundle_sha256:sha(changed)},item,id))
   .toThrow("LEGACY_B2_ORIGINAL_MEMBER_SHA256_MISMATCH");
 });
 it("rejects symlinks and invalid source selectors",()=>{
  const link=build(bytes,"./files/"+id,50);
  expect(()=>restoreOriginalFromVerifiedTar(link,{...marker,bundle_sha256:sha(link)},item,id))
   .toThrow("LEGACY_B2_TAR_FILE_TYPE_INVALID");
  expect(()=>originalStorageSelector("unexpected","private/a")).toThrow();
  expect(()=>originalStorageSelector(bucket,"../secret")).toThrow();
 });
});