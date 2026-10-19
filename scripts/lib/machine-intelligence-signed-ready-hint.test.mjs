import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {prepareMachineIntelligenceSignedReadyHint,
  assertMachineIntelligencePublisherTarget} from
  "./machine-intelligence-signed-ready-hint.mjs";
import {requestMachineIntelligenceSignedReady} from
  "../ops/dispatch-machine-intelligence-signed-ready.mjs";

const now=new Date("2026-10-20T01:30:00.000Z");
const sha="a".repeat(64);
const approvedAt="2026-10-20T01:15:00.000Z";
const env={
  MACHINE_INTELLIGENCE_READY_INPUT_SHA256:sha,
  MACHINE_INTELLIGENCE_READY_APPROVED_AT:approvedAt,
  GITHUB_REPOSITORY:"blocknine0/geomacro",
  GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"schedule",
  GITHUB_SHA:"b".repeat(40),
  EXPECTED_CANONICAL_MAIN_SHA:"b".repeat(40),
  GITHUB_TOKEN:"synthetic-test-only-token-longer-than-20",
};
test("no external dual-signed approval = no network, B2 or D1 even when cron fires",async()=>{
  let calls=0;
  const r=await requestMachineIntelligenceSignedReady({
    env:{...env,MACHINE_INTELLIGENCE_READY_INPUT_SHA256:"",
      MACHINE_INTELLIGENCE_READY_APPROVED_AT:""},now,
    fetchImpl:()=>{calls++;throw Error("unexpected")},
  });
  assert.equal(calls,0);
  assert.equal(r.scheduled,false);
  assert.equal(r.published,false);
  assert.equal(r.b2_gets+r.d1_writes+r.payments+r.supabase_writes,0);
});
test("the ONLY accepted target is the production machine publisher",()=>{
  assert.equal(assertMachineIntelligencePublisherTarget("intelligence-machine-current.yml"),
    "intelligence-machine-current.yml");
  assert.throws(()=>assertMachineIntelligencePublisherTarget("intelligence-scored-refresh.yml"));
  assert.throws(()=>assertMachineIntelligencePublisherTarget("auto-ingest-news.yml"));
});
test("SHA-pinned input and <28-minute UTC approval are a HINT, never signature proof",()=>{
  const r=prepareMachineIntelligenceSignedReadyHint({inputSha:sha,approvedAt,now});
  assert.equal(r.eligible,true);
  assert.equal(r.real_signature_checked,false);
  assert.equal(r.signed_product_published,false);
  assert.deepEqual(r.inputs,{
    machine_b2_key:"geomacro-evidence/v1/private/machine-intelligence-current/"+sha+".json",
    machine_b2_sha256:sha,
  });
  for(const changes of [
    {inputSha:"A".repeat(64)}, {inputSha:"../"+sha},
    {inputSha:""}, {approvedAt:"2026-10-20T01:30:01.000Z"},
    {approvedAt:"2026-10-20T00:50:00.000Z"},
    {approvedAt:"2026-10-20T01:30:00+00:00"},
    {approvedAt:"2026-10-20"}, {approvedAt:"invalid"},
  ]){
    const val=prepareMachineIntelligenceSignedReadyHint({inputSha:sha,approvedAt,now,...changes});
    assert.equal(val.eligible,false,JSON.stringify(changes));
  }
  assert.equal(prepareMachineIntelligenceSignedReadyHint({
    inputSha:sha,approvedAt:"2026-10-20T01:02:00.000Z",now,
  }).eligible,false);
});
test("a valid externally pinned SHA requests ONLY canonical workflow_dispatch, no payment",async()=>{
  const calls=[];
  const r=await requestMachineIntelligenceSignedReady({env,now,
    fetchImpl:async(url,opts)=>{
      calls.push({url,opts});
      return opts.method==="GET"?
        {status:200,json:async()=>({workflow_runs:[]})}:{status:204};
    }});
  assert.equal(r.scheduled,true);
  assert.equal(r.published,false);
  assert.equal(r.signed_input_verified,false);
  assert.equal(r.payments,0);
  assert.deepEqual(calls.map(c=>c.opts.method),["GET","POST"]);
  assert.match(calls[0].url,/\/actions\/workflows\/intelligence-machine-current.yml\/runs\?per_page=20$/u);
  assert.match(calls[1].url,/\/actions\/workflows\/intelligence-machine-current.yml\/dispatches$/u);
  assert.equal(JSON.parse(calls[1].opts.body).inputs.machine_b2_sha256,sha);
  assert.equal(JSON.parse(calls[1].opts.body).ref,"main");
  assert.equal(JSON.stringify(calls[1].opts.body).includes("rights_approved"),false);
});
test("fork, PR, stale canonical main or unverified ingest callback cannot wake publisher",async()=>{
  for(const override of [
    {GITHUB_REPOSITORY:"untrusted/fork"},
    {GITHUB_REF:"refs/heads/feature"},
    {GITHUB_EVENT_NAME:"pull_request"},
    {GITHUB_EVENT_NAME:"workflow_run",MACHINE_SOURCE_WORKFLOW_VERIFIED:"0"},
    {GITHUB_SHA:"c".repeat(40)},
    {GITHUB_TOKEN:""},
  ]){
    let count=0;
    await assert.rejects(()=>requestMachineIntelligenceSignedReady({
      env:{...env,...override},now,fetchImpl:async()=>{count++;return {status:204}},
    }),/PROTECTED_MAIN_REQUIRED/u);
    assert.equal(count,0);
  }
});
test("GitHub timeout/denial/malformed runs and non-204 dispatch all fail closed",async()=>{
  for(const response of [
    {status:401}, {status:429},
    {status:200,json:async()=>({workflow_runs:"bad"})},
    {status:200,json:async()=>({workflow_runs:Array(21).fill({})})},
  ])await assert.rejects(()=>requestMachineIntelligenceSignedReady({
    env,now,fetchImpl:async()=>response,
  }),/RUN_LOOKUP_FAILED/u);
  await assert.rejects(()=>requestMachineIntelligenceSignedReady({
    env,now,fetchImpl:async()=>{throw Error("internal secret")},
  }),/RUN_LOOKUP_FAILED/u);
  await assert.rejects(()=>requestMachineIntelligenceSignedReady({
    env,now,fetchImpl:async(_,opts)=>opts.method==="GET"?
      {status:200,json:async()=>({workflow_runs:[]})}:{status:403},
  }),/DISPATCH_REJECTED/u);
});
test("active, successful or cooling-down publisher deduplicates; failed publisher retries once",async()=>{
  const old={head_sha:env.GITHUB_SHA,head_branch:"main",
    event:"workflow_dispatch",status:"completed",conclusion:"failure",
    created_at:"2026-10-20T01:17:00.000Z"};
  const cases=[
    {runs:[{...old,status:"in_progress",conclusion:null}],want:false},
    {runs:[{...old,conclusion:"success"}],want:false},
    {runs:[{...old,created_at:"2026-10-20T01:26:00.000Z"}],want:false},
    {runs:[old,{...old,created_at:"2026-10-20T01:23:00.000Z"}],want:false},
    {runs:[old],want:true},
  ];
  for(const {runs,want} of cases){
    const calls=[];
    const result=await requestMachineIntelligenceSignedReady({env,now,
      fetchImpl:async(_,opts)=>{
        calls.push(opts.method);
        return opts.method==="GET"?
          {status:200,json:async()=>({workflow_runs:runs})}:{status:204};
      }});
    assert.equal(result.scheduled,want);
    assert.deepEqual(calls,want?["GET","POST"]:["GET"]);
    assert.equal(result.signed_input_verified,false);
    assert.equal(result.payments,0);
  }
});
test("successful original-source ingestion is ONLY a wakeup; real signed input remains mandatory",async()=>{
  let calls=0;
  const r=await requestMachineIntelligenceSignedReady({
    env:{...env,GITHUB_EVENT_NAME:"workflow_run",MACHINE_SOURCE_WORKFLOW_VERIFIED:"1",
      MACHINE_INTELLIGENCE_READY_INPUT_SHA256:""},now,
    fetchImpl:()=>{calls++;throw Error("not allowed")},
  });
  assert.equal(r.scheduled,false);
  assert.equal(calls,0);
});
test("existing 15m GRI cadence is reused, no additional B2 cron or paid pathway",()=>{
  const w=readFileSync(".github/workflows/gri-signed-ready-cadence-backstop.yml","utf8");
  const p=readFileSync(".github/workflows/intelligence-machine-current.yml","utf8");
  assert.match(w,/cron: "13,28,43,58 \* \* \* \*"/u);
  assert.match(w,/MACHINE_INTELLIGENCE_READY_INPUT_SHA256/u);
  assert.match(w,/MACHINE_INTELLIGENCE_READY_APPROVED_AT/u);
  assert.match(w,/node --test scripts\/lib\/machine-intelligence-signed-ready-hint.test.mjs/u);
  assert.match(w,/node scripts\/ops\/dispatch-machine-intelligence-signed-ready.mjs/u);
  assert.match(p,/MACHINE_INTELLIGENCE_AUTHORITY_OR_PIN_INVALID/u);
  assert.match(p,/MACHINE_INTELLIGENCE_B2_READBACK_MISMATCH/u);
  assert.equal(w.includes("SUPABASE_SERVICE_ROLE_KEY"),false);
  assert.equal(w.includes("B2_KEY_ID"),false);
  assert.equal(w.includes("COINBASE_API_KEY"),false);
});
