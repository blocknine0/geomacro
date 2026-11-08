#!/usr/bin/env node
/** Step 2 / GitHub-only, zero-D1 metadata preflight for the redundant
 * 01:40 UTC Website Finds canonical reconciler. The real hourly publisher
 * already executes the SAME 72h archive catch-up. Suppress only when an
 * actual successful catch-up STEP (not merely a green workflow) is proven.
 * Unknown GitHub response => run the recovery: source, B2, payments and
 * customer-facing paths must not depend on this optional deduper.
 */
import {appendFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

const REPO="blocknine0/geomacro";
const WORKFLOW="website-derived-news-continuity.yml";
const STEP="Catch up 72h archived Website IDs to the common D1 partner journal";
const MAX_AGE_MS=150*60_000;
const fail=x=>{throw Error("STEP2_RECONCILE_"+x)};
async function gh(fetchImpl,path,token){
 const url="https://api.github.com/repos/"+REPO+"/actions/"+path;
 const r=await fetchImpl(url,{method:"GET",redirect:"error",
  headers:{"Authorization":"Bearer "+token,
   Accept:"application/vnd.github+json",
   "X-GitHub-Api-Version":"2022-11-28"},
  signal:AbortSignal.timeout(15000)});
 if(!r.ok)fail("GITHUB_READ_UNAVAILABLE");
 return r.json();
}
export async function decideStep2WebsiteReconcile({
 env=process.env,fetchImpl=fetch,now=Date.now()
}={}){
 const fallback=why=>Object.freeze({
  schema:"geomacro.step2.website-reconcile-dedup.v1",
  should_run:true,reason:why,provider_d1_queries:0,
  skipped_primary_ingestion:false,skipped_b2_archive:false});
 if(env.GITHUB_EVENT_NAME==="workflow_dispatch")
  return fallback("OPERATOR_FORCED");
 if(env.GITHUB_EVENT_NAME!=="schedule"||
    env.GITHUB_REPOSITORY!==REPO||
    env.GITHUB_REF!=="refs/heads/main"||
    typeof env.GITHUB_TOKEN!=="string"||env.GITHUB_TOKEN.length<8||
    !Number.isFinite(now))
  return fallback("SCOPE_OR_TOKEN_UNVERIFIED_RUN_RECOVERY");
 try{
  const runs=await gh(fetchImpl,"workflows/"+WORKFLOW+
   "/runs?branch=main&status=success&per_page=4",env.GITHUB_TOKEN);
  if(!Array.isArray(runs.workflow_runs))fail("RUN_LIST_INVALID");
  for(const run of runs.workflow_runs.slice(0,4)){
   if(run?.status!=="completed"||run?.conclusion!=="success"||
      run.head_branch!=="main"||!Number.isSafeInteger(run.id))continue;
   const at=Date.parse(run.updated_at);
   if(!Number.isFinite(at)||at>now+60_000||now-at>MAX_AGE_MS)continue;
   const jobs=await gh(fetchImpl,"runs/"+run.id+"/jobs?per_page=40",
    env.GITHUB_TOKEN);
   if(!Array.isArray(jobs.jobs))fail("JOBS_INVALID");
   for(const job of jobs.jobs.slice(0,40)){
    const step=job.steps?.find(s=>s.name===STEP);
    const finished=Date.parse(step?.completed_at??"");
    if(job.conclusion==="success"&&step?.status==="completed"&&
       step.conclusion==="success"&&Number.isFinite(finished)&&
       finished<=now+60_000&&now-finished<=MAX_AGE_MS)
     return Object.freeze({
      schema:"geomacro.step2.website-reconcile-dedup.v1",
      should_run:false,
      reason:"PRIMARY_EXACT_D1_RECONCILE_STEP_RECENTLY_VERIFIED",
      last_verified_step_at:new Date(finished).toISOString(),
      provider_d1_queries:0,
      skipped_primary_ingestion:false,skipped_b2_archive:false});
   }
  }
  return fallback("NO_RECENT_VERIFIED_PRIMARY_RECONCILIATION");
 }catch{return fallback("GITHUB_PROOF_UNAVAILABLE_RUN_RECOVERY")}
}
export function writeStep2ReconcileDecision(decision,output){
 if(typeof output!=="string"||!output)fail("GITHUB_OUTPUT_MISSING");
 appendFileSync(output,"should_run="+String(decision.should_run)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const decision=await decideStep2WebsiteReconcile();
 if(process.env.GITHUB_OUTPUT)
  writeStep2ReconcileDecision(decision,process.env.GITHUB_OUTPUT);
 // Only coarse reason and timestamp; no source payload or credentials.
 console.log(JSON.stringify(decision));
}
