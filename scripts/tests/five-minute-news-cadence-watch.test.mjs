import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 FASTLANE_WORKFLOW,actualFiveMinutePublisherCompletion,actualSourceIntakeReceipt,
 decideFiveMinuteNewsRecovery,
} from "../lib/five-minute-news-cadence-watch.mjs";

const now=Date.parse("2026-10-21T00:00:00.000Z");
const iso=n=>new Date(now-n*60_000).toISOString();
const run=(id,{mins=4,event="schedule",status="completed",
 conclusion="success",branch="main"}={})=>({
 id,head_branch:branch,event,status,conclusion,
 created_at:iso(mins),updated_at:iso(mins-1),
});
const intakeLog=(minutes=3)=>iso(minutes)+' '+JSON.stringify({schema:'geomacro.fastlane-source-checkpoint-receipt.v1',
 categories:['geopolitics','macro','rare_earth'],checkpoint_writes:3,raw_upstream_stored:false,partner_client_receipt_asserted:false})+'\n'+
 iso(minutes)+' '+JSON.stringify({schema:'geomacro.source-intake-completed.v1',interval_minutes:5,max_new_rows:5,
 retained_new_rows:0,source_checkpoint_acknowledged:true});
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
 const proof=actualFiveMinutePublisherCompletion(r,jobs(3),now,intakeLog(3));
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
 assert.match(writer,/cron: "2-57\/5 \* \* \* \*"/);
 assert.match(writer,/cancel-in-progress: false/);
 assert.match(wf,/cron: "22,52 \* \* \* \*"/);
 assert.match(wf,/fastlane-actual-publisher-cadence-watch:/);
 assert.match(wf,/actions: write/);
 assert.match(wf,/secrets\.GITHUB_TOKEN/);
 assert.match(wf,/node scripts\/ops\/recover-stalled-five-minute-news\.mjs/);
 assert.match(cli,/ACTUAL_PUBLISHER_JOB_PROOF_UNAVAILABLE/);
 assert.match(cli,/FASTLANE_WORKFLOW\+"\/dispatches"/);
 assert.match(cli,/response.status!==204/);
 // The EXISTING separately gated signed-Finds catch-up uses B2. The
 // NEW watchdog is the isolated job above catch-up-derived-only, with no B2.
 const isolated=wf.split("fastlane-actual-publisher-cadence-watch:")[1]?.split("catch-up-derived-only:")[0]??"";
 for(const txt of [cli,isolated]){
  assert.doesNotMatch(txt,/COINBASE_X402_MAINNET_ACK|SUPABASE_SERVICE_ROLE_KEY|TELEGRAM_SESSION|B2_APPLICATION_KEY\s*:/);
 }
});


test('plain timestamped completion and all-category checkpoint receipts are mandatory',()=>{
 const r=run(151,{mins:6}),valid=intakeLog(3),start=Date.parse(r.created_at),end=Date.parse(iso(2));
 assert.equal(actualSourceIntakeReceipt(valid,start,end),Date.parse(iso(3)));
 for(const log of [null,'',valid.split('\n')[0],valid.split('\n')[1],
  valid+'\n'+valid,valid.replace('"checkpoint_writes":3','"checkpoint_writes":2'),
  valid.replace('"source_checkpoint_acknowledged":true','"source_checkpoint_acknowledged":false'),
  valid.replace('"rare_earth"','"macro"'),valid.replace('"retained_new_rows":0','"retained_new_rows":6'),
  valid.replaceAll(iso(3),iso(8)),valid.replaceAll(iso(3),iso(-1)),
  valid.replaceAll('Z {','Z echo {'),
  valid+'\n'+iso(3)+' '+JSON.stringify({schema:'geomacro.source-intake-deferred.v1'})]){
  assert.equal(actualFiveMinutePublisherCompletion(r,jobs(2),now,log),null);
 }
 assert.equal(actualFiveMinutePublisherCompletion(r,jobs(2),now),null,'green publication step alone is not intake evidence');
});
test('source-only admission recovers publisher during discretionary hold; signing stays gated',()=>{
 const wf=readFileSync('.github/workflows/website-derived-news-cadence-backstop.yml','utf8');
 const watch=wf.split('  fastlane-actual-publisher-cadence-watch:')[1].split('  catch-up-derived-only:')[0];
 assert.match(wf,/source_intake: \$\{\{ steps\.budget\.outputs\.source_intake \}\}/);
 assert.match(watch,/needs\.quota-admission\.outputs\.source_intake == 'true'/);
 assert.doesNotMatch(watch,/outputs\.critical == 'true'/);
 assert.match(wf,/Global OSINT to Website Intelligence \(15-Minute Discovery\)/);
 const writer=readFileSync('.github/workflows/five-minute-original-news-fastlane.yml','utf8');
 const proof=writer.split('  post-intake-authenticated-partner-proof:')[1].split('  continue-private-source-review:')[0];
 assert.match(proof,/outputs\.source_intake_completed == 'true'/);
 assert.match(proof,/verify-predge-pilot-continuity\.mjs/);
 assert.match(proof,/verify-predge-continuity-lock\.mjs/);
 assert.match(proof,/secrets\.PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE/);
 assert.doesNotMatch(proof,/dispatches|actions: write|B2_/);
 const publisher=readFileSync('scripts/ops/publish-original-news-five-minute-fastlane.ts','utf8');
 assert.match(publisher,/source_intake_completed=true/);
});
