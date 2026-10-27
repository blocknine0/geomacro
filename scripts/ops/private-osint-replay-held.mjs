#!/usr/bin/env node
/** Replay at most ONE sealed quota-held artifact after the regular successful
 * protected-main D1 collector. Exact authenticated D1 write/readback required
 * before deleting ciphertext. No external source re-fetch and no raw data.
 */
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {createHmac} from "node:crypto";
import {persistPrivateOsintBatch} from "../lib/private-osint-15m-durable-publisher.mjs";
import {selectPrivateOsintSpoolArtifacts,unsealPrivateOsintSpool,
 OSINT_SPOOL_ARTIFACT_NAME} from "../lib/private-osint-encrypted-spool.mjs";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   process.env.GITHUB_REF!=="refs/heads/main"||
   process.env.GITHUB_EVENT_NAME==="pull_request"||
   process.env.GEOMACRO_OSINT_SPOOL_RECOVERY_ADMISSION!=="CRITICAL_TRUE")
 throw Error("OSINT_SPOOL_RECOVERY_PROTECTED_MAIN_ONLY");
const root=process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN;
if(typeof root!=="string"||root.length<32)throw Error("OSINT_RECOVERY_SECRET_UNAVAILABLE");
const access=process.env.GH_TOKEN;
if(typeof access!=="string"||access.length<20)
 throw Error("OSINT_RECOVERY_GITHUB_TOKEN_REQUIRED");
const repo="blocknine0/geomacro",api="https://api.github.com/repos/"+repo+"/actions";
const privateRoot="https://geomacro-control-plane.daspallab202391.workers.dev";
const request=async(path,method="GET")=>{
 const r=await fetch(path,{method,redirect:"error",
  headers:{Authorization:"Bearer "+access,Accept:"application/vnd.github+json",
   "X-GitHub-Api-Version":"2022-11-28"},signal:AbortSignal.timeout(10000)});
 if(method==="DELETE"){
  if(r.status!==204)throw Error("OSINT_SPOOL_DELETE_HTTP_"+r.status);
  return null;
 }
 if(r.status!==200)throw Error("OSINT_SPOOL_INDEX_HTTP_"+r.status);
 return r.json();
};
const list=await request(api+"/artifacts?per_page=100&name="+
 encodeURIComponent(OSINT_SPOOL_ARTIFACT_NAME));
if(!Array.isArray(list?.artifacts))throw Error("OSINT_SPOOL_INDEX_INVALID");
const selected=selectPrivateOsintSpoolArtifacts(list.artifacts,Date.now(),1);
if(!selected.length){
 console.log(JSON.stringify({schema:"geomacro.private-osint-spool-replay.v1",
  state:"NO_FRESH_ENCRYPTED_BACKLOG",d1_write_attempted:false}));
 process.exit(0);
}
const artifact=selected[0],dir=mkdtempSync(join(tmpdir(),"geomacro-private-osint-"));
let envelope;
try{
 const zip=execFileSync("gh",["api","-X","GET",
  "/repos/"+repo+"/actions/artifacts/"+artifact.id+"/zip"],{
  env:{...process.env,GH_TOKEN:access},maxBuffer:8*1024*1024,timeout:15000});
 const path=join(dir,"sealed.zip");
 if(zip.byteLength>8*1024*1024)throw Error("OSINT_SPOOL_ARCHIVE_TOO_LARGE");
 writeFileSync(path,zip,{mode:0o600});
 const content=execFileSync("unzip",["-p",path,"sealed.json"],{
  maxBuffer:5*1024*1024,timeout:10000,encoding:"utf8"});
 envelope=JSON.parse(content);
}finally{rmSync(dir,{recursive:true,force:true})}
const decoded=unsealPrivateOsintSpool(envelope,root);
const info={schema:"geomacro.private-osint-spool-replay.v1",
 recovered_observations:decoded.items.length,
 no_longer_eligible_native_clock:decoded.expired,
 d1_exact_readback_verified:false,source_fetches:0,
 output_is_private_and_noncommercial:true};
if(decoded.items.length){
 // Derive the EXACT existing HMAC-scoped private D1 credential: never alter
 // credentials or the Worker, and do not pass an artifact key to D1.
 const control=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
 const privateToken=createHmac("sha256",control)
  .update("geomacro-private-osint-15m-v1").digest("hex");
 const receipt=await persistPrivateOsintBatch({
  result:{schema:"geomacro.private-osint-15m-batch.v1",
    items:decoded.items,checks:[]},
  privateToken,controlPlaneRoot:privateRoot,
  now:Date.now(),sourceHealthSnapshotSlots:3,
 });
 if(!receipt.d1_write_exact_readback_verified||
   !receipt.separate_private_d1_readback_verified||
   receipt.news_rows_verified_in_d1+receipt.excluded_by_d1_capacity!==decoded.items.length)
  throw Error("OSINT_SPOOL_D1_DURABILITY_UNVERIFIED");
 info.d1_exact_readback_verified=true;
 info.d1_persisted=receipt.news_rows_verified_in_d1;
 info.d1_capacity_excluded=receipt.excluded_by_d1_capacity;
}else info.d1_exact_readback_verified=null;
await request(api+"/artifacts/"+artifact.id,"DELETE");
info.backlog_artifact_deleted_after_proof=true;
console.log(JSON.stringify(info));
