#!/usr/bin/env node
/**
 * Signed PREDGE sample wakeup guard. Read-only GitHub Actions receipts only.
 * Avoid duplicate publishes when cron and the 30m publisher wake together.
 * Never infer a signed delivery from workflow conclusion alone: inspect the
 * protected job's actual "Generate, ... independently read back" success.
 */
import {appendFileSync} from "node:fs";

export const MIN_REFRESH_GAP_MS=25*60*1000;
export const MAX_SIGNED_RUNS_PER_UTC_DAY=48;
const REPO="blocknine0/geomacro";
const WORKFLOW="predge-pilot-signed-news-v2-refresh.yml";
const SIGN_STEP="Generate, locally verify, publish and independently read back real signed envelope";
const ACCEPTED_EVENTS=new Set(["schedule","workflow_run","workflow_dispatch"]);

function assert(ok,code){if(!ok)throw Error("PREDGE_AUTO_REFRESH_"+code);}
async function json(fetchImpl,url,token){
 const response=await fetchImpl(url,{
   headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
     "X-GitHub-Api-Version":"2022-11-28"},
   redirect:"error",signal:AbortSignal.timeout(15000)});
 assert(response.status===200,"GITHUB_RECEIPTS_UNAVAILABLE_"+response.status);
 return response.json();
}
export async function assessSignedRefreshCadence({
 fetchImpl=fetch,token,repo=REPO,runId,eventName,now=Date.now(),
 maxPages=3,
}={}){
 assert(repo===REPO,"UNTRUSTED_REPOSITORY");
 assert(typeof token==="string"&&token.length>10,"ACTIONS_READ_TOKEN_MISSING");
 assert(Number.isSafeInteger(Number(runId))&&Number(runId)>0,"RUN_ID_INVALID");
 assert(["schedule","workflow_run","workflow_dispatch"].includes(eventName),"EVENT_NOT_ALLOWED");
 if(eventName==="workflow_dispatch")return {should_run:true,reason:"EXPLICIT_MANUAL_OWNER_CONFIRMATION"};
 const dayStart=Date.parse(new Date(now).toISOString().slice(0,10)+"T00:00:00.000Z");
 // Include a short previous-day overlap for the 25-minute duplicate guard.
 const searchStart=Math.min(dayStart,now-MIN_REFRESH_GAP_MS-10*60*1000);
 const endpoint="https://api.github.com/repos/"+REPO+"/actions/workflows/"+WORKFLOW+"/runs";
 const candidates=[];
 let reachedEarlierDay=false;
 for(let page=1;page<=maxPages;page++){
   const u=endpoint+"?branch=main&per_page=100&page="+page;
   const data=await json(fetchImpl,u,token);
   assert(Array.isArray(data.workflow_runs),"RUN_LIST_INVALID");
   for(const run of data.workflow_runs){
     if(run.id===Number(runId))continue;
     const created=Date.parse(run.created_at||"");
     assert(Number.isFinite(created),"RUN_CLOCK_INVALID");
     if(created<searchStart){reachedEarlierDay=true;continue;}
     if(run.head_branch!=="main"||!ACCEPTED_EVENTS.has(run.event))continue;
     if(run.status!=="completed"||run.conclusion!=="success")continue;
     candidates.push(run);
   }
   if(reachedEarlierDay||data.workflow_runs.length<100)break;
   assert(page<maxPages,"RUN_HISTORY_PAGINATION_LIMIT");
 }
 // Jobs API is mandatory: "success" can also mean an opt-in disabled no-op.
 const signed=[];
 for(let i=0;i<candidates.length;i+=8){
   const batch=candidates.slice(i,i+8);
   const results=await Promise.all(batch.map(async run=>{
     const detail=await json(fetchImpl,"https://api.github.com/repos/"+REPO+
       "/actions/runs/"+run.id+"/jobs?per_page=100",token);
     assert(Array.isArray(detail.jobs),"JOB_LIST_INVALID");
     const passed=detail.jobs.some(job=>
       job.name==="refresh"&&job.conclusion==="success"&&
       Array.isArray(job.steps)&&job.steps.some(step=>
         step.name===SIGN_STEP&&step.conclusion==="success"));
     return passed?run:null;
   }));
   signed.push(...results.filter(Boolean));
 }
 const newest=signed.reduce((max,run)=>{
   const t=Date.parse(run.updated_at||run.created_at);
   return Number.isFinite(t)?Math.max(max,t):max;
 },0);
 const signedToday=signed.filter(run=>Date.parse(run.created_at)>=dayStart).length;
 if(newest&&now-newest<MIN_REFRESH_GAP_MS)
   return {should_run:false,reason:"RECENT_SIGNED_READBACK_EXISTS",signedToday,
     lastVerifiedAt:new Date(newest).toISOString()};
 if(signedToday>=MAX_SIGNED_RUNS_PER_UTC_DAY)
   return {should_run:false,reason:"DAILY_SIGNED_REFRESH_CAP",signedToday};
 return {should_run:true,reason:"SIGNING_DUE",signedToday};
}
async function main(){
 const result=await assessSignedRefreshCadence({
   token:process.env.GITHUB_TOKEN,repo:process.env.GITHUB_REPOSITORY,
   runId:process.env.GITHUB_RUN_ID,eventName:process.env.GITHUB_EVENT_NAME
 });
 const output=process.env.GITHUB_OUTPUT;
 assert(typeof output==="string"&&output.length>0,"GITHUB_OUTPUT_REQUIRED");
 appendFileSync(output,"should_run="+String(result.should_run)+"\n");
 console.log(JSON.stringify({schema:"geomacro.predge-signed-auto-cadence.v1",
   ...result,no_funds:true,signing_performed:false}));
}
if(process.argv[1]?.endsWith("check-predge-signed-refresh-cadence.mjs")){
 main().catch(e=>{
  console.error(String(e.message).replace(/[^A-Z0-9_]/gi,"_").slice(0,160));
  process.exitCode=1;
 });
}
