import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 FASTLANE_WORKFLOW,actualFiveMinutePublisherCompletion,
 decideFiveMinuteNewsRecovery,
} from "../lib/five-minute-news-cadence-watch.mjs";

const now=Date.parse("2026-10-21T00:00:00.000Z");
const iso=n=>new Date(now-n*60_000).toISOString();
const run=(id,{mins=4,event="schedule",status="completed",
 conclusion="success",branch="main"}={})=>({
 id,head_branch:branch,event,status,conclusion,
 created_at:iso(mins),updated_at:iso(mins-1),
});
const jobs=(minutes=2,stepStatus="success")=>[
 {name:"fastlane-contract",status:"completed",conclusion:"success",
  completed_at:iso(minutes),steps:[]},
 {name:"original-five-minute-derived-news",status:"completed",
  conclusion:stepStatus,
  completed_at:iso(minutes),
  steps:[{name:"Publish bounded current original-dated three-category derived news",
    conclusion:stepStatus}]},
];

test("verified same-main completed D1 job and exact successful publication suppress redundant dispatch",()=>{
 const r=run(141,{mins:6});
 const proof=actualFiveMinutePublisherCompletion(r,jobs(3),now);
 assert.equal(proof,Date.parse(iso(3)));
 const decision=decideFiveMinuteNewsRecovery([r],{[r.id]:proof},now);
 assert.equal(decision.reason,"RECENT_GENUINE_D1_PUBLISHER_RUN");
 assert.equal(decision.dispatch,false);
 assert.equal(decision.payment_performed,false);
});
test("green contract-only workflow, empty publisher job and stale D1 job do NOT prove collection",()=>{
 const r=run(140,{mins:6});
 for(const j of [jobs(3).slice(0,1),jobs(3,"failure"),[],null]){
  assert.equal(actualFiveMinutePublisherCompletion(r,j,now),null);
 }
 assert.equal(decideFiveMinuteNewsRecovery([r],{},now).dispatch,true);
 const old=run(139,{mins:26});
 assert.equal(decideFiveMinuteNewsRecovery([old],{[old.id]:Date.parse(iso(24))},now).dispatch,true);
});
test("refuse to dispatch over an active, queued, or recent recovery run",()=>{
 for(const status of ["queued","in_progress","pending","requested","waiting"]){
  const d=decideFiveMinuteNewsRecovery([run(130,{mins:5,status,conclusion:null})],{},now);
  assert.equal(d.dispatch,false);
  assert.equal(d.reason,"LIVE_OR_QUEUED_PUBLISHER_RUN");
 }
 const recent=run(135,{mins:9,event:"workflow_dispatch",status:"completed",conclusion:"failure"});
 const d=decideFiveMinuteNewsRecovery([recent],{},now);
 assert.equal(d.dispatch,false);
 assert.equal(d.reason,"RECENT_RECOVERY_DISPATCH_COOLDOWN");
});
test("expired, wrong-branch, malformed or forged source-status cannot suppress recovery",()=>{
 const untrusted=[run(121,{branch:"not-main"}),
  run(122,{event:"pull_request"}),run(123,{mins:61})];
 const d=decideFiveMinuteNewsRecovery(untrusted,{},now);
 assert.equal(d.dispatch,true);
 assert.equal(d.github_schedule_exact_guarantee,false);
 assert.equal(d.country_195x3_all_news_guarantee,false);
 assert.throws(()=>decideFiveMinuteNewsRecovery("bad",{},now),/FASTLANE_WATCH_INPUT_INVALID/);
 assert.throws(()=>decideFiveMinuteNewsRecovery([],{},Infinity),/FASTLANE_WATCH_INPUT_INVALID/);
 assert.equal(actualFiveMinutePublisherCompletion(run(141,{branch:"fork"}),jobs(2),now),null);
});
test("uses pre-existing backstop wakeups and ephemeral GitHub Actions dispatch; no new 24h laptop or credentials",()=>{
 const wf=readFileSync(".github/workflows/website-derived-news-cadence-backstop.yml","utf8");
 const writer=readFileSync(".github/workflows/five-minute-original-news-fastlane.yml","utf8");
 const cli=readFileSync("scripts/ops/recover-stalled-five-minute-news.mjs","utf8");
 assert.equal(FASTLANE_WORKFLOW,"five-minute-original-news-fastlane.yml");
 assert.match(writer,/cron: "4-59\/5 \* \* \* \*"/);
 assert.match(writer,/cancel-in-progress: false/);
 assert.match(wf,/cron: "22,52 \* \* \* \*"/);
 assert.match(wf,/fastlane-actual-publisher-cadence-watch:/);
 assert.match(wf,/actions: write/);
 assert.match(wf,/secrets\.GITHUB_TOKEN/);
 assert.match(wf,/node scripts\/ops\/recover-stalled-five-minute-news\.mjs/);
 assert.match(cli,/ACTUAL_PUBLISHER_JOB_PROOF_UNAVAILABLE/);
 assert.match(cli,/new URL\("workflows\/"\+FASTLANE_WORKFLOW\+"\/dispatches"/);
 assert.match(cli,/response.status!==204/);
 // The EXISTING separately gated signed-Finds catch-up uses B2. The
 // NEW watchdog is the isolated job above catch-up-derived-only, with no B2.
 const isolated=wf.split("fastlane-actual-publisher-cadence-watch:")[1]?.split("catch-up-derived-only:")[0]??"";
 for(const txt of [cli,isolated]){
  assert.doesNotMatch(txt,/COINBASE_X402_MAINNET_ACK|SUPABASE_SERVICE_ROLE_KEY|TELEGRAM_SESSION|B2_APPLICATION_KEY\s*:/);
 }
});
