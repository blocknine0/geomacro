#!/usr/bin/env node
/**
 * Best-effort hourly cadence recovery on an offset GitHub Actions schedule.
 * No news titles, URLs or authorization token printed. It requests only
 * workflow statuses via the GitHub API (NOT live news or D1 raw rows).
 */
import { appendFileSync } from "node:fs";
import {
  WEBSITE_PUBLISHER_WORKFLOW,WEBSITE_BACKSTOP_WORKFLOW,
  decideWebsiteNewsBackstop,verifiedBackstopPublicationTime,
  verifiedPrimaryPublicationTime,
} from "../lib/website-derived-news-failover.mjs";
const repo=process.env.GITHUB_REPOSITORY??"";
const token=process.env.GITHUB_TOKEN??"";
const output=process.env.GITHUB_OUTPUT??"";
if(repo!=="blocknine0/geomacro" || token.length<8 || !output)
  throw Error("NEWS_BACKSTOP_GITHUB_READ_SCOPE_MISSING");
const base="https://api.github.com/repos/"+repo+"/actions/";
const headers={
  Authorization:"Bearer "+token,
  Accept:"application/vnd.github+json",
  "X-GitHub-Api-Version":"2022-11-28",
  "User-Agent":"geomacro-news-cadence-verifier",
};
async function githubRead(path,label) {
  const response=await fetch(new URL(path,base),{
    redirect:"error",headers,signal:AbortSignal.timeout(10_000),
  });
  if(!response.ok)throw Error("NEWS_BACKSTOP_"+label+"_UNAVAILABLE_"+response.status);
  return response.json();
}
const u=new URL("workflows/"+WEBSITE_PUBLISHER_WORKFLOW+"/runs",base);
u.searchParams.set("branch","main");
u.searchParams.set("status","success");
u.searchParams.set("per_page","8");
const data=await githubRead(u,"PRIMARY_RUNS");
if(!Array.isArray(data.workflow_runs))
  throw Error("NEWS_BACKSTOP_GITHUB_RESPONSE_INVALID");
// A primary push canary already collects news. Do not force a duplicate
// just because workflow YAML changed or a skipped recovery was green.
const force=process.env.GITHUB_EVENT_NAME==="workflow_dispatch";
// A green GitHub workflow without its actual completed publisher must
// not suppress recovery. Read only a bounded number of job-step summaries.
const genuine=[];
const checkedNow=Date.now();
// Only recent 3 candidates are needed for a 70-minute publisher clock.
 // Serial 10-job fanout timed out in production; do not repeat it.
for(const run of data.workflow_runs.slice(0,3)){
  if(run?.status!=="completed"||run.conclusion!=="success"||
    run.head_branch!=="main"||!Number.isSafeInteger(run.id)||run.id<=0)continue;
  const at=Date.parse(run.updated_at);
  if(!Number.isFinite(at)||at<checkedNow-3*60*60_000||at>checkedNow+60_000)continue;
  // An unavailable GitHub step-proof endpoint is NOT an issuer clock.
  // Keep the failed proof unconfirmed; the idempotent D1 backstop can recover.
  try{
    const jobs=await githubRead("runs/"+run.id+"/jobs?per_page=25","PRIMARY_JOBS");
    if(!Array.isArray(jobs.jobs))throw Error("NEWS_BACKSTOP_PRIMARY_JOBS_INVALID");
    const completed=verifiedPrimaryPublicationTime(run,jobs.jobs,checkedNow);
    if(completed){
      genuine.push({status:"completed",conclusion:"success",
        head_branch:"main",updated_at:completed});
      if(checkedNow-Date.parse(completed)<70*60_000)break;
    }
  }catch{
    console.warn("::warning::NEWS_BACKSTOP_PRIMARY_JOB_PROOF_UNAVAILABLE");
  }
}
const primary=decideWebsiteNewsBackstop(genuine,checkedNow);
let decision=primary,successProof=genuine.length?
  "VERIFIED_PRIMARY_D1_WRITER":"NO_VERIFIED_PRIMARY_D1_WRITER";
if(primary.should_run&&!force){
  // Recovery can complete without an hourly primary. A successful backstop
  // run by itself is not proof: skipped/no-op backstops also report success.
  // Read only the latest bounded set of jobs and accept a completed writer
  // ONLY if real publish + signed Finds + D1 readback steps all succeeded.
  try{
    const u2=new URL("workflows/"+WEBSITE_BACKSTOP_WORKFLOW+"/runs",base);
    u2.searchParams.set("branch","main");
    u2.searchParams.set("status","success");
    u2.searchParams.set("per_page","8");
    const recoveries=await githubRead(u2,"RECOVERY_RUNS");
    if(!Array.isArray(recoveries.workflow_runs))
      throw Error("NEWS_BACKSTOP_RECOVERY_RESPONSE_INVALID");
    const now=Date.now(),proofs=[];
    for(const run of recoveries.workflow_runs.slice(0,8)){
      if(run?.status!=="completed"||run.conclusion!=="success"||
         run.head_branch!=="main"||!Number.isSafeInteger(run.id))continue;
      const updated=Date.parse(run.updated_at);
      if(!Number.isFinite(updated)||updated<now-70*60_000-60_000||updated>now+60_000)continue;
      const jobResponse=await githubRead("runs/"+run.id+"/jobs?per_page=25","RECOVERY_JOBS");
      const at=verifiedBackstopPublicationTime(run,jobResponse.jobs,now);
      if(at)proofs.push({status:"completed",conclusion:"success",head_branch:"main",updated_at:at});
    }
    if(proofs.length){
      // Exclude green-but-skipped primary workflow metadata. Using the raw
      // workflow list here would undo the entire primary job-step proof fix.
      const combined=decideWebsiteNewsBackstop([...genuine,...proofs],now);
      if(!combined.should_run){decision=combined;successProof="VERIFIED_RECOVERY_D1_READBACK";}
    }
  }catch{
    // An optional backstop proof lookup must not suppress real recovery when
    // primary is actually stale. Never infer success from missing metadata.
    console.warn("::warning::NEWS_BACKSTOP_PRIOR_RECOVERY_PROOF_UNAVAILABLE");
  }
}
const shouldRun=force||decision.should_run;
appendFileSync(output,"should_run="+(shouldRun?"true":"false")+"\n");
console.log(JSON.stringify({
  schema:"geomacro.website-derived-news-cadence-backstop.v1",
  reason:force?"OPERATOR_RECOVERY_REQUESTED":decision.reason,
  last_success_at:decision.last_success_at,
  minutes_since_success:decision.age_minutes,
  should_publish:shouldRun,
  publisher_success_observed:decision.last_success_at!==null,
  latest_success_proof:successProof,
  skipped_recovery_workflow_cannot_claim_publication:true,
  exactly_hourly_guaranteed:false,
  supabase_dependency:false,
  source_contents_logged:false,
}));
