#!/usr/bin/env node
/** Recover up to two strictly authenticated main-run ciphertext artifacts.
 * Never delete an artifact on any D1 quota, capacity or proof failure.
 * News objects remain noncommercial, unsigned and private.
 */
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {createHmac} from "node:crypto";
import {persistPrivateOsintBatch} from "../lib/private-osint-15m-durable-publisher.mjs";
import {buildPrivateSourceSharedReadManifest} from "../lib/private-osint-shared-read-contract.mjs";
import {selectPrivateOsintSpoolArtifacts,unsealPrivateOsintSpool,
 planPrivateOsintEncryptedReplay,canDeletePrivateOsintSpoolArtifacts,
 OSINT_SPOOL_ARTIFACT_NAME} from "../lib/private-osint-encrypted-spool.mjs";

if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   process.env.GITHUB_REF!=="refs/heads/main"||
   process.env.GITHUB_EVENT_NAME==="pull_request"||
   process.env.GEOMACRO_OSINT_SPOOL_RECOVERY_ADMISSION!=="CRITICAL_TRUE")
 throw Error("OSINT_SPOOL_RECOVERY_PROTECTED_MAIN_ONLY");
const root=process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN;
if(typeof root!=="string"||root.length<32)throw Error("OSINT_RECOVERY_SECRET_UNAVAILABLE");
const access=process.env.GH_TOKEN;
if(typeof access!=="string"||access.length<20)throw Error("OSINT_RECOVERY_GITHUB_TOKEN_REQUIRED");
const repo="blocknine0/geomacro",api="https://api.github.com/repos/"+repo+"/actions";
const privateRoot="https://geomacro-control-plane.daspallab202391.workers.dev";
const request=async(path,method="GET")=>{
 const response=await fetch(path,{
  method,redirect:"error",
  headers:{Authorization:"Bearer "+access,Accept:"application/vnd.github+json",
   "X-GitHub-Api-Version":"2022-11-28"},
  signal:AbortSignal.timeout(12000),
 });
 if(method==="DELETE"){
  if(response.status!==204)throw Error("OSINT_SPOOL_DELETE_HTTP_"+response.status);
  return null;
 }
 if(response.status!==200)throw Error("OSINT_SPOOL_INDEX_HTTP_"+response.status);
 return response.json();
};

// A complete bounded inventory, including the oldest live held cycles.
const all=[];
for(let page=1;page<=3;page++){
 const listing=await request(api+"/artifacts?per_page=100&page="+page+
  "&name="+encodeURIComponent(OSINT_SPOOL_ARTIFACT_NAME));
 if(!Array.isArray(listing?.artifacts)||
    !Number.isSafeInteger(listing.total_count)||listing.total_count<0||
    listing.total_count>300)throw Error("OSINT_SPOOL_INDEX_INCOMPLETE_OR_TOO_LARGE");
 all.push(...listing.artifacts);
 if(all.length>=listing.total_count||listing.artifacts.length<100)break;
 if(page===3)throw Error("OSINT_SPOOL_INDEX_TRUNCATED");
}
const selected=selectPrivateOsintSpoolArtifacts(all,Date.now(),2);
if(!selected.length){
 console.log(JSON.stringify({schema:"geomacro.private-osint-spool-replay.v1",
  state:"NO_FRESH_ENCRYPTED_BACKLOG",d1_write_attempted:false,
  inventoried_artifacts:all.length}));
 process.exit(0);
}
const decoded=[];
for(const artifact of selected){
 const dir=mkdtempSync(join(tmpdir(),"geomacro-private-osint-"));
 try{
  // Download the EXACT run's named GitHub Actions ZIP using the supported
  // runner CLI, which follows the temporary artifact redirect. Nothing is
  // printed from the ciphertext or decoded private material.
  execFileSync("gh",["run","download",String(artifact.workflow_run.id),
   "--repo",repo,"--name",OSINT_SPOOL_ARTIFACT_NAME,"--dir",dir],{
   env:{...process.env,GH_TOKEN:access},maxBuffer:256*1024,timeout:30000,
  });
  const raw=readFileSync(join(dir,"sealed.json"),"utf8");
  if(raw.length>3_500_000)throw Error("OSINT_SPOOL_ENVELOPE_TOO_LARGE");
  decoded.push(unsealPrivateOsintSpool(JSON.parse(raw),root));
 }finally{rmSync(dir,{recursive:true,force:true})}
}
const planned=planPrivateOsintEncryptedReplay(decoded);
let receipt=null;
if(planned.items.length){
 const control=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
 const privateToken=createHmac("sha256",control)
  .update("geomacro-private-osint-15m-v1").digest("hex");
 receipt=await persistPrivateOsintBatch({
  result:{schema:"geomacro.private-osint-15m-batch.v1",items:planned.items,checks:[]},
  privateToken,controlPlaneRoot:privateRoot,
  now:Date.now(),sourceHealthSnapshotSlots:3,
 });
}
const sharedSourceRead=buildPrivateSourceSharedReadManifest(planned.items,Date.now());
if(planned.items.length&&(
   receipt?.shared_source_read_content_sha256!==sharedSourceRead.content_sha256||
   receipt?.shared_source_read_item_count!==planned.items.length))
 throw Error("OSINT_SPOOL_D1_SHARED_INPUT_MISMATCH_KEEP_BACKLOG");
if(!canDeletePrivateOsintSpoolArtifacts(receipt,planned))
 throw Error("OSINT_SPOOL_D1_DURABILITY_OR_CAPACITY_UNVERIFIED_KEEP_BACKLOG");
// Deletion occurs only AFTER completed D1 write and independent readback,
// or when every original 25h native-dated item has expired.
for(const artifact of selected)await request(api+"/artifacts/"+artifact.id,"DELETE");
console.log(JSON.stringify({
 schema:"geomacro.private-osint-spool-replay.v1",
 artifacts_recovered:selected.length,
 distinct_items_eligible:planned.items.length,
 shared_source_read_sha256:sharedSourceRead.content_sha256,
 duplicate_items_suppressed:planned.duplicates_removed,
 native_clock_expired_items:planned.expired,
 d1_exact_readback_verified:planned.items.length>0,
 d1_persisted:receipt?.news_rows_verified_in_d1??0,
 d1_capacity_excluded:receipt?.excluded_by_d1_capacity??0,
 all_backlog_artifacts_deleted_after_strict_receipt:true,
 source_fetches:0,output_is_private_and_noncommercial:true,
}));
