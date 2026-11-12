#!/usr/bin/env node
/**
 * Source-success wakeup admission only. It never certifies original articles,
 * publisher rights, independent corroboration, signed GRO, or 150/150 cells.
 * A proven source sweep merely wakes the existing durable qualified-GRO outbox.
 */
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
const REPO="blocknine0/geomacro";
const SHA=/^[0-9a-f]{40}$/u;
const UPSTREAM=Object.freeze({
 "Hot-50 Direct Original News (20-Minute Cron)":Object.freeze({
   path:".github/workflows/hot50-direct-original-news-20m.yml",
   job:"runtime-source-sweep-acceptance",
   events:["schedule","workflow_dispatch"],
 }),
 "Global OSINT to Website Intelligence (15-Minute Discovery)":Object.freeze({
   path:".github/workflows/private-global-osint-15m.yml",
   job:"Governed source-only original news and optional canonical-to-static website delivery",
   events:["schedule","workflow_run","workflow_dispatch"],
 }),
});
export function verifySourceWakeup({event,remoteRun,mainSha,runnerSha,jobs}={}){
 const e=event?.workflow_run;
 const source=UPSTREAM[e?.name];
 if(!source||!Number.isSafeInteger(e?.id)||e.id<=0||
    e.path!==source.path||e.head_branch!=="main"||
    !source.events.includes(e.event)||e.conclusion!=="success"||
    e.status!=="completed"||e.head_repository?.full_name!==REPO)
  throw Error("GRO_SOURCE_WAKEUP_EVENT_NOT_TRUSTED");
 if(!SHA.test(mainSha??"")||!SHA.test(runnerSha??"")||
    mainSha!==runnerSha||e.head_sha!==mainSha)
  throw Error("GRO_SOURCE_WAKEUP_STALE_MAIN");
 if(remoteRun?.id!==e.id||remoteRun?.name!==e.name||
    remoteRun?.path!==e.path||remoteRun?.head_sha!==e.head_sha||
    remoteRun?.head_branch!=="main"||remoteRun?.event!==e.event||
    remoteRun?.head_repository?.full_name!==REPO||
    remoteRun?.status!=="completed"||remoteRun?.conclusion!=="success")
  throw Error("GRO_SOURCE_WAKEUP_REMOTE_RUN_UNVERIFIED");
 if(!Array.isArray(jobs?.jobs)||jobs?.total_count!==jobs.jobs.length||
    jobs.jobs.length<1||jobs.jobs.length>100)
  throw Error("GRO_SOURCE_WAKEUP_COMPLETE_JOB_CENSUS_REQUIRED");
 const matched=jobs.jobs.filter(j=>j?.name===source.job);
 if(matched.length!==1||matched[0].status!=="completed"||
    matched[0].conclusion!=="success")
  throw Error("GRO_SOURCE_WAKEUP_NATIVE_SWEEP_NOT_PROVEN");
 return Object.freeze({
  schema:"geomacro.gro.source-wakeup-admission.v1",
  status:"SOURCE_SWEEP_PROVEN_SIGNING_OUTBOX_WAKEUP_ONLY",
  producer_run_id:e.id,
  producer_workflow:e.name,
  producer_sha:e.head_sha,
  native_sweep_job_verified:true,
  new_qualified_input_inferred:false,
  commercial_rights_verified:false,
  gro_signed_by_wakeup:false,
  risk_gate_hot50_150_cells_verified:false,
  payment_authorized:false,
 });
}
async function run(){
 if(process.env.GITHUB_ACTIONS!=="true"||
    process.env.GITHUB_REPOSITORY!==REPO||
    process.env.GITHUB_EVENT_NAME!=="workflow_run"||
    process.env.GITHUB_REF!=="refs/heads/main"||
    !SHA.test(process.env.GITHUB_SHA??"")||
    !process.env.GITHUB_EVENT_PATH||!(process.env.GH_TOKEN??"").length)
  throw Error("GRO_SOURCE_WAKEUP_PROTECTED_CONTEXT_REQUIRED");
 const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,"utf8"));
 const id=event?.workflow_run?.id;
 if(!Number.isSafeInteger(id)||id<1||!UPSTREAM[event?.workflow_run?.name])
  throw Error("GRO_SOURCE_WAKEUP_UNLISTED_SOURCE_RUN");
 const request=async path=>{
  const response=await fetch("https://api.github.com/repos/"+REPO+path,{
   headers:{Authorization:"Bearer "+process.env.GH_TOKEN,Accept:"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28"},
   redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error("GRO_SOURCE_WAKEUP_PROVIDER_READ_UNAVAILABLE");
  return response.json();
 };
 const [branch,remoteRun,jobs]=await Promise.all([
  request("/branches/main"),
  request("/actions/runs/"+id),
  request("/actions/runs/"+id+"/jobs?per_page=100"),
 ]);
 console.log(JSON.stringify(verifySourceWakeup({
  event,remoteRun,jobs,mainSha:branch?.commit?.sha,
  runnerSha:process.env.GITHUB_SHA,
 })));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 run().catch(err=>{
  const code=/^GRO_SOURCE_WAKEUP_[A-Z_]+$/u.test(String(err?.message))?
   err.message:"GRO_SOURCE_WAKEUP_UNEXPECTED_FAILURE";
  console.error(code);
  process.exitCode=1;
 });
