import {test} from "node:test";
import assert from "node:assert/strict";
import {sealPrivatePhase2iSourceBacklog} from "../lib/phase2i-encrypted-source-backlog.mjs";
import {buildPhase2iCiphertextB2Object,verifyPhase2iCiphertextB2Readback,
 PHASE2I_B2_PREFIX,readPhase2iProtectedArtifact} from "../ops/phase2i-archive-ciphertext-queue-b2.mjs";
import {assertPhase2iSourceB2Lifecycle,PHASE2I_SOURCE_QUEUE_B2_PREFIX}
 from "../ops/phase2h-verify-b2-72h-lifecycle.mjs";
const ROOT="test-only-long-key-not-a-real-secret-isolated-2026";
const NOW=new Date("2026-11-02T12:00:00.000Z");
const candidate=(i,category="macro",d1Acknowledged=false)=>({
 category,title:"Verified source metadata event "+i,
 articleUrl:"https://example.org/news/"+i,
 publishedAt:"2026-11-02T10:00:00.000Z",
 sourceId:"example.org",credit:null,sourceUrl:"https://example.org/feed",
 issuerContextCountryIso3:null,d1Acknowledged
});
function envelope(items,now=NOW.getTime()){
 return sealPrivatePhase2iSourceBacklog({candidates:items,root:ROOT,now});
}
test("whole 72-hour first-party source queue is encrypted, bounded and B2 hash verified",()=>{
 const candidates=[candidate(1,"geopolitics"),candidate(2,"macro",true),
  candidate(3,"rare_earth")];
 const e=envelope(candidates);
 const plan=buildPhase2iCiphertextB2Object({
  envelope:e,root:ROOT,now:NOW,sourceRunId:41430000000});
 assert.equal(plan.candidate_count,3);
 assert.equal(plan.not_d1_acknowledged_in_snapshot,2);
 assert.equal(plan.d1_acknowledged_in_snapshot,1);
 assert.deepEqual(plan.category_counts,{geopolitics:1,macro:1,rare_earth:1});
 assert.ok(plan.key.startsWith(PHASE2I_B2_PREFIX+"2026/11/02/"));
 assert.equal(JSON.stringify(e).includes(candidates[0].title),false);
 assert.equal(plan.bytes.toString().includes(candidates[0].articleUrl),false);
 assert.equal(verifyPhase2iCiphertextB2Readback(plan.bytes,plan,ROOT,NOW),true);
 const corrupted=Buffer.from(plan.bytes);
 corrupted[corrupted.length-5]=corrupted[corrupted.length-5]===97?98:97;
 assert.throws(()=>verifyPhase2iCiphertextB2Readback(corrupted,plan,ROOT,NOW),
  /PHASE2I_B2_FULL_BODY_SHA_MISMATCH/);
 assert.throws(()=>verifyPhase2iCiphertextB2Readback(plan.bytes,plan,"wrong-key",NOW));
});
test("reject expired, empty and untrusted source snapshots without any B2 PUT",()=>{
 assert.throws(()=>buildPhase2iCiphertextB2Object({
  envelope:envelope([]),root:ROOT,now:NOW,sourceRunId:111
 }),/PHASE2I_B2_NO_RECENT_NONEMPTY_AUTHENTIC_SOURCE_QUEUE/);
 const tooOld=envelope([candidate(1)],NOW.getTime()-7*3600_000);
 assert.throws(()=>buildPhase2iCiphertextB2Object({
  envelope:tooOld,root:ROOT,now:NOW,sourceRunId:111
 }),/PHASE2I_B2_NO_RECENT_NONEMPTY_AUTHENTIC_SOURCE_QUEUE/);
});
test("B2 provider must prove scoped 1+1-day deletion and reject broader conflicting rules",()=>{
 const good=[{fileNamePrefix:PHASE2I_SOURCE_QUEUE_B2_PREFIX,
  daysFromUploadingToHiding:1,daysFromHidingToDeleting:1},
  {fileNamePrefix:"geomacro-evidence/v1/private/phase2h-raw-news/",
   daysFromUploadingToHiding:null,daysFromHidingToDeleting:null}];
 const r=assertPhase2iSourceB2Lifecycle(good);
 assert.equal(r.private_72h_delete_lifecycle_verified,true);
 assert.equal(r.other_prefixes_unchanged,true);
 assert.throws(()=>assertPhase2iSourceB2Lifecycle([]),
   /SOURCE_QUEUE_72H_EXPIRY_UNVERIFIED/);
 assert.throws(()=>assertPhase2iSourceB2Lifecycle([{
   ...good[0],daysFromHidingToDeleting:2
 }]),/SOURCE_QUEUE_72H_EXPIRY_UNVERIFIED/);
 assert.throws(()=>assertPhase2iSourceB2Lifecycle([...good,{
   fileNamePrefix:"geomacro-evidence/v1/private/",
   daysFromUploadingToHiding:1,daysFromHidingToDeleting:0
 }]),/SOURCE_QUEUE_BROAD_LIFECYCLE_CONFLICT/);
});
test("only main-branch recent exact-name Github ciphertext can be selected",async()=>{
 let downloads=0;
 const artifact=(name,branch,time,id)=>({
  name,expired:false,id,created_at:time,
  workflow_run:{id:id+100,head_branch:branch}
 });
 const doc={total_count:3,artifacts:[
  artifact("geomacro-private-phase2i-72h-ciphertext","feature",
    "2026-11-02T11:50:00.000Z",1),
  artifact("geomacro-private-phase2i-72h-ciphertext","main",
    "2026-11-02T10:10:00.000Z",2),
  artifact("spoofed-private-queue","main",
    "2026-11-02T11:55:00.000Z",3)
 ]};
 await assert.rejects(()=>readPhase2iProtectedArtifact({
  token:"x".repeat(30),now:NOW,
  fetchImpl:async()=>({status:200,redirected:false,json:async()=>doc}),
  downloadImpl:()=>{downloads++;throw Error("never use a real source in unit tests")}
 }),/never use a real source in unit tests/);
 assert.equal(downloads,1);
 await assert.rejects(()=>readPhase2iProtectedArtifact({
  token:"x".repeat(30),now:NOW,
  fetchImpl:async()=>({status:200,redirected:false,json:async()=>({
   total_count:1,artifacts:[artifact(
    "geomacro-private-phase2i-72h-ciphertext","main",
    "2026-11-02T04:00:00.000Z",4)]
  })}),
  downloadImpl:()=>{throw Error("must not download stale input")}
 }),/PHASE2I_B2_NO_RECENT_MAIN_SOURCE_SNAPSHOT/);
});
