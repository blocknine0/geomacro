import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifySourceWakeup} from "../ops/verify-qualified-gro-source-wakeup.mjs";

const SHA="a".repeat(40);
const candidates=[
 ["Hot-50 Direct Original News (20-Minute Cron)",
  ".github/workflows/hot50-direct-original-news-20m.yml",
  "runtime-source-sweep-acceptance","schedule"],
 ["Global OSINT to Website Intelligence (15-Minute Discovery)",
  ".github/workflows/private-global-osint-15m.yml",
  "Governed source-only original news and optional canonical-to-static website delivery","workflow_run"],
];
const setup=([name,path,job,eventType])=>{
 const run={id:42862362727,name,path,event:eventType,head_branch:"main",
  head_sha:SHA,head_repository:{full_name:"blocknine0/geomacro"},
  status:"completed",conclusion:"success"};
 return {event:{workflow_run:{...run}},remoteRun:{...run},mainSha:SHA,runnerSha:SHA,
  jobs:{total_count:1,jobs:[{name:job,status:"completed",conclusion:"success"}]}};
};
for(const candidate of candidates){
 test(candidate[0]+" only wakes durable GRO outbox after exact real production source job",()=>{
  const result=verifySourceWakeup(setup(candidate));
  assert.equal(result.native_sweep_job_verified,true);
  assert.equal(result.new_qualified_input_inferred,false);
  assert.equal(result.commercial_rights_verified,false);
  assert.equal(result.gro_signed_by_wakeup,false);
  assert.equal(result.risk_gate_hot50_150_cells_verified,false);
  assert.equal(result.payment_authorized,false);
 });
 test(candidate[0]+" rejects forged, stale and vacuous source-success events",()=>{
  const variants=[
   x=>{x.event.workflow_run.name="Fake successful source";},
   x=>{x.event.workflow_run.path=".github/workflows/unsafe.yml";},
   x=>{x.event.workflow_run.head_repository.full_name="untrusted/fork";},
   x=>{x.event.workflow_run.conclusion="failure";},
   x=>{x.remoteRun.conclusion="skipped";},
   x=>{x.remoteRun.id+=1;},
   x=>{x.remoteRun.event="pull_request";},
   x=>{x.mainSha="b".repeat(40);},
   x=>{x.runnerSha="c".repeat(40);},
   x=>{x.jobs.jobs[0].conclusion="skipped";},
   x=>{x.jobs.jobs[0].name="offline-contract";},
   x=>{x.jobs.total_count=2;},
   x=>{x.jobs.jobs.push({...x.jobs.jobs[0]});x.jobs.total_count=2;},
  ];
  for(const mutate of variants){
   const args=setup(candidate);mutate(args);
   assert.throws(()=>verifySourceWakeup(args),/GRO_SOURCE_WAKEUP_/);
  }
 });
}
test("workflow is best-effort source-event driven plus recurring, never claims source transport as signed risk",()=>{
 const workflow=readFileSync(new URL(
  "../../.github/workflows/permanent-qualified-signed-gro-production.yml",import.meta.url),"utf8");
 const discovery=readFileSync(new URL(
  "../../.github/workflows/derived-risk-gate-discovery-20m.yml",import.meta.url),"utf8");
 for(const [name] of candidates)assert.ok(workflow.includes(name));
 assert.match(workflow,/cron: "3,23,43 \* \* \* \*"/u);
 assert.match(workflow,/github\.event\.workflow_run\.head_sha == github\.sha/u);
 assert.match(workflow,/verify-qualified-gro-source-wakeup\.mjs/u);
 assert.match(workflow,/actions: read/u);
 assert.match(workflow,/run-automatic-gro-signing\.ts/u);
 assert.match(workflow,/RISK_GATE_COUNTRY_SCOPE: HOT50/u);
 assert.match(discovery,/geomacro-derived-risk-gate-contract-pr/u);
 assert.match(discovery,/geomacro-derived-risk-gate-single-production-consumer/u);
 assert.doesNotMatch(discovery,/geomacro-derived-risk-gate-discovery-single-consumer/u);
 assert.match(discovery,/github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/u);
});
