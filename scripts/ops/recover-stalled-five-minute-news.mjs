#!/usr/bin/env node
/**
 * Laptop-independent watchdog. Invoked by EXISTING offset news backstop
 * workflow(s). Uses only ephemeral Actions GITHUB_TOKEN (actions:write).
 * No Telegram, paid LLM/API, Supabase, B2, licensed article text or x402.
 */
import {actualFiveMinutePublisherCompletion,decideFiveMinuteNewsRecovery,
  FASTLANE_WORKFLOW} from "../lib/five-minute-news-cadence-watch.mjs";
const repo=process.env.GITHUB_REPOSITORY;
const token=process.env.GITHUB_TOKEN??"";
if(repo!=="blocknine0/geomacro"||
   process.env.GITHUB_REF!=="refs/heads/main"||
   process.env.GITHUB_EVENT_NAME==="pull_request"||token.length<8)
 throw Error("FASTLANE_WATCH_TRUSTED_MAIN_ACTIONS_TOKEN_REQUIRED");
const base="https://api.github.com/repos/blocknine0/geomacro/actions/";
const headers={Authorization:"Bearer "+token,
 Accept:"application/vnd.github+json",
 "X-GitHub-Api-Version":"2022-11-28",
 "User-Agent":"geomacro-first-party-news-fastlane-watch"};
async function githubRead(path,label){
 const response=await fetch(new URL(path,base),{
  headers,redirect:"error",signal:AbortSignal.timeout(10_000),
 });
 if(!response.ok)throw Error("FASTLANE_WATCH_"+label+"_"+response.status);
 const txt=await response.text();
 if(txt.length>512_000)throw Error("FASTLANE_WATCH_RESPONSE_OVERSIZE");
 return JSON.parse(txt);
}
const now=Date.now();
const url=new URL("workflows/"+FASTLANE_WORKFLOW+"/runs",base);
url.searchParams.set("branch","main");
url.searchParams.set("per_page","12");
const data=await githubRead(url,"RUNS_UNAVAILABLE");
if(!Array.isArray(data.workflow_runs))
 throw Error("FASTLANE_WATCH_RUNS_RESPONSE_INVALID");
const proofs={};
// Bounded: genuine success is a completed publisher job with the ACTUAL
// D1 publication step, not the contract job nor a green skipped workflow.
for(const run of data.workflow_runs.slice(0,6)){
 if(run?.conclusion!=="success"||run.status!=="completed"||
    run.head_branch!=="main"||!Number.isSafeInteger(run.id)||
    !["schedule","workflow_dispatch","push"].includes(run.event))continue;
 const completed=Date.parse(run.updated_at);
 if(!Number.isFinite(completed)||completed<now-60*60_000||
    completed>now+60_000)continue;
 const doc=await githubRead("runs/"+run.id+"/jobs?per_page=20",
   "ACTUAL_PUBLISHER_JOB_PROOF_UNAVAILABLE");
 if(!Array.isArray(doc.jobs))
  throw Error("FASTLANE_WATCH_PUBLISHER_JOB_RESPONSE_INVALID");
 const actual=doc.jobs.find(j=>j.name==='original-five-minute-derived-news'&&j.conclusion==='success'&&
  j.steps?.some(s=>s.name==='Publish bounded current original-dated three-category derived news'&&s.conclusion==='success'));
 if(!actual||!Number.isSafeInteger(actual.id))continue;
 // Fetch strips GitHub authorization on cross-origin Actions log redirects.
 // The response is bounded and parsed privately; no raw logs are emitted.
 const response=await fetch(new URL('jobs/'+actual.id+'/logs',base),{
  headers,redirect:'follow',signal:AbortSignal.timeout(15_000),
 });
 if(!response.ok||Number(response.headers.get('content-length')??0)>3_000_000)
  throw Error('FASTLANE_WATCH_INTAKE_LOG_UNAVAILABLE');
 const log=await response.text();
 if(log.length>3_000_000)throw Error('FASTLANE_WATCH_INTAKE_LOG_OVERSIZE');
 const proof=actualFiveMinutePublisherCompletion(run,doc.jobs,now,log);
 if(proof!==null)proofs[run.id]=proof;
}
const verdict=decideFiveMinuteNewsRecovery(
 data.workflow_runs.slice(0,12),proofs,now);
if(verdict.dispatch){
 const response=await fetch(new URL(
   "workflows/"+FASTLANE_WORKFLOW+"/dispatches",base),{
   method:"POST",redirect:"error",
   headers:{...headers,"Content-Type":"application/json"},
   body:JSON.stringify({ref:"main"}),
   signal:AbortSignal.timeout(10_000),
 });
 if(response.status!==204)
  throw Error("FASTLANE_WATCH_DISPATCH_REJECTED_"+response.status);
}
console.log(JSON.stringify({
 schema:"geomacro.5min-original-news-verified-cadence-watch.v1",
 ...verdict,recovery_dispatch_http_204:verdict.dispatch,
 source_families_newly_authorized:0,
 same_72h_d1_journal:true,
 original_article_bodies_read_or_logged:false,
 funds_spent:0,telegram_sessions_used:0,
}));
