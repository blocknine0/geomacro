#!/usr/bin/env node
/**
 * Best-effort 15-minute cadence recovery on an offset GitHub Actions schedule.
 * No news titles, URLs or authorization token printed. It requests only
 * workflow statuses via the GitHub API (NOT live news or D1 raw rows).
 */
import { appendFileSync } from "node:fs";
import {
  WEBSITE_PUBLISHER_WORKFLOW,decideWebsiteNewsBackstop,
} from "../lib/website-derived-news-failover.mjs";
const repo=process.env.GITHUB_REPOSITORY??"";
const token=process.env.GITHUB_TOKEN??"";
const output=process.env.GITHUB_OUTPUT??"";
if(repo!=="blocknine0/geomacro" || token.length<8 || !output)
  throw Error("NEWS_BACKSTOP_GITHUB_READ_SCOPE_MISSING");
const u=new URL("https://api.github.com/repos/"+repo+"/actions/workflows/"+
  WEBSITE_PUBLISHER_WORKFLOW+"/runs");
u.searchParams.set("branch","main");
u.searchParams.set("status","success");
u.searchParams.set("per_page","20");
const response=await fetch(u,{
  redirect:"error",
  headers:{
    Authorization:"Bearer "+token,
    Accept:"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28",
    "User-Agent":"geomacro-news-cadence-verifier",
  },
  signal:AbortSignal.timeout(10_000),
});
if(!response.ok)throw Error("NEWS_BACKSTOP_GITHUB_RUNS_UNAVAILABLE_"+response.status);
const data=await response.json();
if(!Array.isArray(data.workflow_runs))throw Error("NEWS_BACKSTOP_GITHUB_RESPONSE_INVALID");
// A primary push canary already collects news. A backstop push must not force
// another full source poll just because the contract itself changed.
const force=process.env.GITHUB_EVENT_NAME==="workflow_dispatch";
const decision=decideWebsiteNewsBackstop(data.workflow_runs);
const shouldRun=force||decision.should_run;
appendFileSync(output,"should_run="+(shouldRun?"true":"false")+"\n");
console.log(JSON.stringify({
  schema:"geomacro.website-derived-news-cadence-backstop.v1",
  reason:force?"OPERATOR_RECOVERY_REQUESTED":decision.reason,
  last_success_at:decision.last_success_at,
  minutes_since_success:decision.age_minutes,
  should_publish:shouldRun,
  publisher_success_observed:decision.last_success_at!==null,
  exactly_15m_guaranteed:false,
  supabase_dependency:false,
  source_contents_logged:false,
}));
