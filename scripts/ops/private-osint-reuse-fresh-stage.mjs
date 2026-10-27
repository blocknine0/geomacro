#!/usr/bin/env node
/**
 * Avoid a redundant 511-source raw RSS poll in the hourly GitHub fallback
 * when a SAME-main-SHA verified 15-minute collector already produced a
 * fresh AES-GCM source-neutral backlog artifact. No D1, B2, R2 or KV reads.
 * Fail OPEN to the normal protected collection on ANY unknown API status.
 * NEVER grants canonically verified news, rights, delivery or quota capacity.
 */
import {appendFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {OSINT_SPOOL_ARTIFACT_NAME} from "../lib/private-osint-encrypted-spool.mjs";

const REPO="blocknine0/geomacro";
const SOURCE_WORKFLOW="Global OSINT to Website Intelligence (15-Minute Discovery)";
const MAX_LOOKBACK_MS=20*60_000;
const SHA=/^[0-9a-f]{40}$/u;
export async function hasFreshProtectedSourceArtifact({
 now=Date.now(),sha,token,fetchImpl=fetch,
}={}){
 if(!Number.isFinite(now)||!SHA.test(sha??"")||
    typeof token!=="string"||token.length<16||typeof fetchImpl!=="function")
  return false;
 const get=async(path)=>{
  const r=await fetchImpl("https://api.github.com/repos/"+REPO+path,{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28"},
   signal:AbortSignal.timeout(10000),
  });
  if(r.status!==200)throw Error("OSINT_REUSE_GITHUB_READ_UNAVAILABLE");
  return r.json();
 };
 try{
  const list=await get("/actions/artifacts?per_page=100&name="+
    encodeURIComponent(OSINT_SPOOL_ARTIFACT_NAME));
  if(!Array.isArray(list?.artifacts)||list.artifacts.length>100||
      !Number.isSafeInteger(list.total_count)||list.total_count<0)
   throw Error("OSINT_REUSE_GITHUB_LIST_INVALID");
  const candidate=list.artifacts.filter(a=>
    a?.name===OSINT_SPOOL_ARTIFACT_NAME&&a.expired===false&&
    Number.isSafeInteger(a.size_in_bytes)&&a.size_in_bytes>0&&
    a.workflow_run?.head_branch==="main"&&
    a.workflow_run?.head_sha===sha&&
    Number.isSafeInteger(a.workflow_run?.id)&&a.workflow_run.id>0&&
    typeof a.created_at==="string"&&
    Number.isFinite(Date.parse(a.created_at))&&
    Date.parse(a.created_at)<=now&&
    now-Date.parse(a.created_at)<=MAX_LOOKBACK_MS
  ).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  if(!candidate.length)return false;
  // A recent hourly artifact does NOT mean the 15-minute live lane ran.
  // Verify exact workflow identity, SHA, repo and completed success.
  const run=await get("/actions/runs/"+candidate[0].workflow_run.id);
  return run?.name===SOURCE_WORKFLOW&&run?.conclusion==="success"&&
    run?.head_sha===sha&&run?.head_branch==="main"&&
    run?.head_repository?.full_name===REPO&&
    ["schedule","push","workflow_dispatch","workflow_run"].includes(run.event);
 }catch{return false}
}
export async function main({
 env=process.env,fetchImpl=fetch,now=Date.now(),
}={}){
 // ONLY the protected main job can authorize skipping a source fetch.
 if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=="refs/heads/main"||
    env.GEOMACRO_OSINT_SPOOL_ADMISSION!=="HELD"||
    !["schedule","push","workflow_dispatch"].includes(env.GITHUB_EVENT_NAME??""))
  throw Error("PRIVATE_OSINT_REUSE_PROTECTED_HELD_MAIN_ONLY");
 const shared=await hasFreshProtectedSourceArtifact({
  now,sha:env.GITHUB_SHA,token:env.GH_TOKEN,fetchImpl,
 });
 const collect=!shared;
 if(env.GITHUB_OUTPUT)appendFileSync(env.GITHUB_OUTPUT,
   "collect="+(collect?"true":"false")+"\n");
 console.log(JSON.stringify({
  schema:"geomacro.private-osint-source-reuse-admission.v1",
  already_collected_encrypted_under_same_main:shared,
  hourly_raw_feed_refetch_required:collect,
  reused_artifact_is_not_canonical_d1:true,
  new_d1_reads:0,new_b2_reads:0,new_r2_reads:0,new_kv_reads:0,
  original_publisher_bytes_logged:false,
 }));
 return {collect,shared};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 await main();
}
