/**
 * One B2 PUT for MANY internally indexed ciphertext fragments.
 *
 * The Phase2I source queue was already gzip-compressed and AES-256-GCM sealed
 * before this codec. Never fragment plaintext, never expose original headlines,
 * never issue per-fragment object-store PUTs. Reassembly is private/on-demand
 * and requires the existing source-queue encryption root for authenticated use.
 *
 * Wire format: fixed ASCII magic + uint32be manifest length + manifest JSON +
 * concatenated binary fragments. Manifest SHA-256 checks each exact offset,
 * the reconstructed envelope is still checked by the original AES-GCM tag.
 */
import {createHash} from "node:crypto";
import {unsealPrivatePhase2iSourceBacklog,PHASE2I_BACKLOG_SCHEMA}
 from "./phase2i-encrypted-source-backlog.mjs";

export const PHASE2I_FRAGMENTED_B2_SCHEMA=
 "geomacro.phase2i.single-object-fragmented-ciphertext.v1";
export const PHASE2I_FRAGMENT_BYTES=128*1024;
const MAGIC=Buffer.from("GM-P2I-FRAG-1\n","ascii");
const MAX_ENVELOPE_BYTES=6_500_000;
const MAX_PARTS=64;
const MAX_MANIFEST_BYTES=16_384;
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const fail=code=>{throw Error("PHASE2I_B2_FRAGMENT_"+code)};
const isSha=x=>typeof x==="string"&&/^[a-f0-9]{64}$/u.test(x);
function validateCiphertextEnvelope(bytes){
 let doc;
 try{doc=JSON.parse(bytes.toString("utf8"))}
 catch{fail("SOURCE_NOT_JSON")}
 if(doc?.schema!==PHASE2I_BACKLOG_SCHEMA||
    doc.algorithm!=="aes-256-gcm+gzip"||
    doc.canonical_d1_verified!==false||
    doc.commercial_reuse_verified!==false||
    typeof doc.ciphertext!=="string"||
    Object.keys(doc).sort().join("|")!==[
      "algorithm","canonical_d1_verified","ciphertext",
      "commercial_reuse_verified","created_at","nonce","schema",
      "tag","unverified_candidates"].sort().join("|"))
  fail("UNSEALED_OR_UNTRUSTED_SOURCE");
 return doc;
}
export function buildPrivatePhase2iFragmentedBundle(bytes,{
 fragmentBytes=PHASE2I_FRAGMENT_BYTES
}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length===0||
    bytes.length>MAX_ENVELOPE_BYTES||
    !Number.isSafeInteger(fragmentBytes)||fragmentBytes<32*1024||
    fragmentBytes>256*1024)
  fail("SOURCE_SIZE_INVALID");
 validateCiphertextEnvelope(bytes);
 const fragments=[];
 for(let offset=0;offset<bytes.length;offset+=fragmentBytes){
  const piece=bytes.subarray(offset,Math.min(bytes.length,offset+fragmentBytes));
  fragments.push({index:fragments.length,offset,length:piece.length,sha256:sha(piece)});
 }
 if(fragments.length<1||fragments.length>MAX_PARTS)fail("PART_COUNT_INVALID");
 const manifest={
  schema:PHASE2I_FRAGMENTED_B2_SCHEMA,
  source_envelope_size:bytes.length,
  source_envelope_sha256:sha(bytes),
  fragment_size:fragmentBytes,
  fragments
 };
 const head=Buffer.from(JSON.stringify(manifest),"utf8");
 if(head.length>MAX_MANIFEST_BYTES)fail("MANIFEST_OVERSIZE");
 const headerLength=Buffer.allocUnsafe(4);headerLength.writeUInt32BE(head.length);
 const packed=Buffer.concat([MAGIC,headerLength,head,bytes]);
 return Object.freeze({
  bytes:packed,sha256:sha(packed),original_sha256:manifest.source_envelope_sha256,
  original_bytes:bytes.length,fragment_count:fragments.length,
  fragment_size:fragmentBytes,provider_puts_per_bundle:1,
  provider_gets_for_two_readbacks:2,manifest_schema:PHASE2I_FRAGMENTED_B2_SCHEMA,
 });
}
export function reconstructPrivatePhase2iFragmentedBundle(packed){
 if(!Buffer.isBuffer(packed)||packed.length<MAGIC.length+4+1||
    packed.length>MAX_ENVELOPE_BYTES+MAX_MANIFEST_BYTES+MAGIC.length+4||
    !packed.subarray(0,MAGIC.length).equals(MAGIC))
  fail("MAGIC_OR_SIZE_INVALID");
 const length=packed.readUInt32BE(MAGIC.length),pos=MAGIC.length+4;
 if(length<32||length>MAX_MANIFEST_BYTES||pos+length>=packed.length)
  fail("MANIFEST_SIZE_INVALID");
 let manifest;
 try{manifest=JSON.parse(packed.subarray(pos,pos+length).toString("utf8"))}
 catch{fail("MANIFEST_JSON_INVALID")}
 if(!manifest||manifest.schema!==PHASE2I_FRAGMENTED_B2_SCHEMA||
    !Number.isSafeInteger(manifest.source_envelope_size)||
    manifest.source_envelope_size<1||
    manifest.source_envelope_size>MAX_ENVELOPE_BYTES||
    !isSha(manifest.source_envelope_sha256)||
    !Number.isSafeInteger(manifest.fragment_size)||
    manifest.fragment_size<32*1024||manifest.fragment_size>256*1024||
    !Array.isArray(manifest.fragments)||
    manifest.fragments.length<1||manifest.fragments.length>MAX_PARTS||
    Math.ceil(manifest.source_envelope_size/manifest.fragment_size)!==
       manifest.fragments.length)
  fail("MANIFEST_CONTRACT_INVALID");
 const start=pos+length;
 if(packed.length-start!==manifest.source_envelope_size)
  fail("FRAGMENT_PAYLOAD_LENGTH_MISMATCH");
 let offset=0;
 for(let i=0;i<manifest.fragments.length;i++){
  const f=manifest.fragments[i];
  if(!f||f.index!==i||f.offset!==offset||
     !Number.isSafeInteger(f.length)||f.length<1||
     f.length>manifest.fragment_size||
     f.length!==Math.min(manifest.fragment_size,manifest.source_envelope_size-offset)||
     !isSha(f.sha256))
   fail("FRAGMENT_INDEX_INVALID");
  const part=packed.subarray(start+offset,start+offset+f.length);
  if(sha(part)!==f.sha256)fail("FRAGMENT_SHA256_MISMATCH");
  offset+=f.length;
 }
 if(offset!==manifest.source_envelope_size)fail("FRAGMENT_COVERAGE_INVALID");
 const original=packed.subarray(start);
 if(sha(original)!==manifest.source_envelope_sha256)
  fail("ORIGINAL_SHA256_MISMATCH");
 validateCiphertextEnvelope(original);
 return Buffer.from(original);
}
/** Private, authenticated original metadata rehydration: no public output. */
export function restorePrivatePhase2iFragmentedBundle(packed,root,now=Date.now()){
 const restored=reconstructPrivatePhase2iFragmentedBundle(packed);
 return unsealPrivatePhase2iSourceBacklog(JSON.parse(restored.toString("utf8")),root,now);
}
