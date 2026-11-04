import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {sealPrivatePhase2iSourceBacklog,unsealPrivatePhase2iSourceBacklog}
 from "./phase2i-encrypted-source-backlog.mjs";
import {buildPrivatePhase2iFragmentedBundle,
 reconstructPrivatePhase2iFragmentedBundle,
 restorePrivatePhase2iFragmentedBundle,
 PHASE2I_FRAGMENTED_B2_SCHEMA} from "./phase2i-fragmented-b2-bundle.mjs";
const ROOT="test-only-private-geomacro-source-queue-32-character-key";
const NOW=Date.parse("2026-11-04T06:00:00.000Z");
const candidate=i=>({
 category:"geopolitics",
 title:"Original diplomatic statement "+i+" "+createHash("sha256").update("title:"+i).digest("hex"),
 articleUrl:"https://www.example.org/release/"+i+"-"+createHash("sha256").update("url:"+i).digest("hex"),
 publishedAt:"2026-11-04T05:00:00.000Z",
 sourceId:"private_geo_bulk_demo",
 sourceUrl:"https://www.example.org/feed.xml",
 issuerContextCountryIso3:null,
 credit:null,
 d1Acknowledged:i%7===0,
});
function specimen(n=600){
 const sources=Array.from({length:n},(_,i)=>candidate(i));
 const envelope=sealPrivatePhase2iSourceBacklog({candidates:sources,root:ROOT,now:NOW});
 const raw=Buffer.from(JSON.stringify(envelope)+"\n","utf8");
 return {sources,raw,envelope};
}
test("single B2 PUT stores many indexed encrypted fragments and exact on-demand reassembly",()=>{
 const {sources,raw}=specimen(600);
 const object=buildPrivatePhase2iFragmentedBundle(raw,{fragmentBytes:32*1024});
 assert.ok(object.fragment_count>1);
 assert.equal(object.provider_puts_per_bundle,1);
 assert.equal(object.provider_gets_for_two_readbacks,2);
 assert.equal(object.manifest_schema,PHASE2I_FRAGMENTED_B2_SCHEMA);
 assert.equal(object.sha256,createHash("sha256").update(object.bytes).digest("hex"));
 assert.equal(object.bytes.includes(Buffer.from(sources[0].title)),false);
 const reconstructed=reconstructPrivatePhase2iFragmentedBundle(object.bytes);
 assert.ok(reconstructed.equals(raw));
 const restored=restorePrivatePhase2iFragmentedBundle(object.bytes,ROOT,NOW);
 assert.equal(restored.restored_authentic_originals,sources.length);
 assert.equal(restored.candidates.filter(c=>c.d1Acknowledged).length,
  sources.filter(c=>c.d1Acknowledged).length);
 assert.deepEqual(restored.candidates,unsealPrivatePhase2iSourceBacklog(
  JSON.parse(raw.toString("utf8")),ROOT,NOW).candidates);
});
test("corrupted, truncated or spliced fragments fail before AES-GCM restore",()=>{
 const {raw}=specimen(600);
 const object=buildPrivatePhase2iFragmentedBundle(raw,{fragmentBytes:32*1024});
 const flipped=Buffer.from(object.bytes);flipped[flipped.length-15]^=1;
 assert.throws(()=>reconstructPrivatePhase2iFragmentedBundle(flipped),
  /PHASE2I_B2_FRAGMENT_FRAGMENT_SHA256_MISMATCH/);
 assert.throws(()=>reconstructPrivatePhase2iFragmentedBundle(
  object.bytes.subarray(0,-1)),/PHASE2I_B2_FRAGMENT_FRAGMENT_PAYLOAD_LENGTH_MISMATCH/);
 const noMagic=Buffer.from(object.bytes);noMagic[0]=0;
 assert.throws(()=>reconstructPrivatePhase2iFragmentedBundle(noMagic),
  /PHASE2I_B2_FRAGMENT_MAGIC_OR_SIZE_INVALID/);
 assert.throws(()=>restorePrivatePhase2iFragmentedBundle(object.bytes,"bad-root",NOW),
  /PHASE2I_BACKLOG_AUTHENTICATION_FAILED/);
});
test("refuse raw/plaintext and unreasonable fragment sizes",()=>{
 assert.throws(()=>buildPrivatePhase2iFragmentedBundle(
  Buffer.from('{"title":"plaintext source"}')),
  /PHASE2I_B2_FRAGMENT_UNSEALED_OR_UNTRUSTED_SOURCE/);
 const {raw}=specimen(1);
 assert.throws(()=>buildPrivatePhase2iFragmentedBundle(raw,{fragmentBytes:1}),
  /PHASE2I_B2_FRAGMENT_SOURCE_SIZE_INVALID/);
 assert.throws(()=>buildPrivatePhase2iFragmentedBundle(Buffer.alloc(6_500_001)),
  /PHASE2I_B2_FRAGMENT_SOURCE_SIZE_INVALID/);
});
