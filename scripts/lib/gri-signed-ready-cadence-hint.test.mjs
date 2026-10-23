import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {prepareGriSignedReadyCadenceHint,assertGriDispatchTarget,
  explainGriSignedInputBlockers,safeGriBlockerJobSummary} from
  "./gri-signed-ready-cadence-hint.mjs";
import {requestGriSignedReadyCadence,decideGriSignedPublisherRetry} from
  "../ops/dispatch-gri-signed-ready-cadence.mjs";

const date=new Date("2026-10-18T11:30:00.000Z");
const input="a".repeat(64),cert="b".repeat(64);
const env={
  GITHUB_REPOSITORY:"blocknine0/geomacro",
  GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"schedule",
  GITHUB_SHA:"c".repeat(40),EXPECTED_CANONICAL_MAIN_SHA:"c".repeat(40),
  GITHUB_TOKEN:"synthetic-test-token-not-real",
  GRI_READY_REVIEWED_SHA256:input,
  GRI_READY_CERTIFICATES_SHA256:cert,
  GRI_READY_APPROVED_AT:"2026-10-18T11:15:00.000Z",
};
test("empty genuine signed pointers: skip; zero fetch and zero score",async()=>{
  let calls=0;
  const r=await requestGriSignedReadyCadence({
    env:{...env,GRI_READY_REVIEWED_SHA256:"",GRI_READY_CERTIFICATES_SHA256:"",
      GRI_READY_APPROVED_AT:""},
    now:date,fetchImpl:async()=>{calls++;throw Error("forbidden")},
  });
  assert.equal(r.scheduled,false);
  assert.equal(r.published,false);
  assert.equal(r.b2_gets,0);
  assert.equal(r.d1_writes,0);
  assert.equal(calls,0);
});
test("only recent two distinct immutable SHA pointers qualify for a REVALIDATION attempt",()=>{
  const ok=prepareGriSignedReadyCadenceHint({
    reviewedSha:input,certificatesSha:cert,
    readyAt:"2026-10-18T11:15:00.000Z",now:date,
  });
  assert.equal(ok.eligible,true);
  assert.equal(ok.real_signed_input_checked,false);
  assert.equal(ok.published,false);
  assert.deepEqual(ok.inputs,{
    reviewed_b2_key:"geomacro-evidence/v1/private/reviewed-gri-current/"+input+".json",
    reviewed_b2_sha256:input,
    reviewed_certificates_b2_key:"geomacro-evidence/v1/private/reviewed-country-certification/"+cert+".json",
    reviewed_certificates_b2_sha256:cert,
  });
  for(const changes of [
    {reviewedSha:"A".repeat(64)},
    {certificatesSha:"../"+cert},
    {certificatesSha:input},
    {readyAt:"2026-10-18T11:01:00Z"},
    {readyAt:"2026-10-18T11:31:00Z"},
    {readyAt:"2026-10-18"},
    {readyAt:"2026-10-18T10:59:00Z"},
    {readyAt:"2026-10-18T11:15:00+00:00"},
  ]){
    const value=prepareGriSignedReadyCadenceHint({
      reviewedSha:input,certificatesSha:cert,
      readyAt:"2026-10-18T11:15:00.000Z",now:date,...changes,
    });
    assert.equal(value.eligible,false,JSON.stringify(changes));
  }
});
test("only canonical reviewed GRI target can be requested",()=>{
  assert.equal(assertGriDispatchTarget("gri-v12-supabase-free-reviewed-current.yml"),
    "gri-v12-supabase-free-reviewed-current.yml");
  assert.throws(()=>assertGriDispatchTarget("gri-realtime-direct-postgres.yml"));
  assert.throws(()=>assertGriDispatchTarget("auto-ingest-news.yml"));
});
test("new SHA-ready hint requests canonical workflow_dispatch, never calls source or settlement",async()=>{
  const calls=[];
  const result=await requestGriSignedReadyCadence({
    env,now:date,fetchImpl:async(url,options)=>{
      calls.push({url,options});
      return options.method==="GET"?
        {status:200,json:async()=>({workflow_runs:[]})}:{status:204};
    },
  });
  assert.equal(calls.length,2);
  assert.match(calls[0].url,/\/actions\/workflows\/gri-v12-supabase-free-reviewed-current.yml\/runs\?per_page=20$/u);
  assert.equal(calls[0].options.method,"GET");
  assert.equal(result.scheduled,true);
  assert.equal(result.published,false);
  assert.equal(result.gri_score_recomputed,false);
  assert.equal(result.payments,0);
  assert.match(calls[1].url,/\/actions\/workflows\/gri-v12-supabase-free-reviewed-current.yml\/dispatches$/);
  assert.equal(calls[1].options.method,"POST");
  assert.equal(calls[1].options.redirect,"error");
  const payload=JSON.parse(calls[1].options.body);
  assert.equal(payload.ref,"main");
  assert.equal(payload.inputs.reviewed_b2_sha256,input);
  assert.equal(payload.inputs.reviewed_certificates_b2_sha256,cert);
  assert.equal(JSON.stringify(payload).includes("article"),false);
});
test("unauthorized caller, mismatched main, and missing token fail closed before network",async()=>{
  for(const override of [
    {GITHUB_REPOSITORY:"untrusted/fork"},
    {GITHUB_REF:"refs/heads/feature"},
    {GITHUB_EVENT_NAME:"pull_request"},
    {GITHUB_SHA:"d".repeat(40)},
    {GITHUB_TOKEN:""},
  ]){
    let calls=0;
    await assert.rejects(()=>requestGriSignedReadyCadence({
      env:{...env,...override},now:date,
      fetchImpl:async()=>{calls++;return {status:204}},
    }),/GRI_SIGNED_READY_PROTECTED_RUN_REQUIRED/u);
    assert.equal(calls,0);
  }
});
test("GitHub metadata denial, malformed runs or network failure never authorizes B2 dispatch",async()=>{
  for(const response of [
    {status:403},
    {status:429},
    {status:200,json:async()=>({workflow_runs:"malformed"})},
    {status:200,json:async()=>({workflow_runs:Array(21).fill({})})},
  ]){
    await assert.rejects(()=>requestGriSignedReadyCadence({
      env,now:date,fetchImpl:async()=>response,
    }),/RECENT_RUN_LOOKUP_FAILED/);
  }
  await assert.rejects(()=>requestGriSignedReadyCadence({
    env,now:date,fetchImpl:async()=>{throw Error("secret")},
  }),/RECENT_RUN_LOOKUP_FAILED/);
  await assert.rejects(()=>requestGriSignedReadyCadence({
    env,now:date,fetchImpl:async(_,options)=>
      options.method==="GET"?{status:200,json:async()=>({workflow_runs:[]})}:{status:403},
  }),/DISPATCH_REJECTED/);
});
test("same approved SHA is NOT repeatedly dispatched on two cadences or news completion",async()=>{
  let calls=0;
  const prior={
    head_sha:env.GITHUB_SHA,head_branch:"main",event:"workflow_dispatch",
    created_at:"2026-10-18T11:17:00Z",
  };
  const res=await requestGriSignedReadyCadence({
    env,now:date,fetchImpl:async(url,opts)=>{
      calls++;
      assert.equal(opts.method,"GET");
      return {status:200,json:async()=>({workflow_runs:[prior]})};
    },
  });
  assert.equal(calls,1);
  assert.equal(res.scheduled,false);
  assert.equal(res.status,"SIGNED_GRI_PUBLISHER_ALREADY_RUNNING_OR_UNKNOWN");
  assert.equal(res.b2_gets,0);
  assert.equal(res.payments,0);
});
test("newly approved same-source review wakes after successful Auto Ingest workflow_run",async()=>{
  const calls=[];
  const res=await requestGriSignedReadyCadence({
    env:{...env,GITHUB_EVENT_NAME:"workflow_run",GRI_SOURCE_WORKFLOW_VERIFIED:"1"},
    now:date,fetchImpl:async(url,opts)=>{
      calls.push(opts.method);
      return opts.method==="GET"?
        {status:200,json:async()=>({workflow_runs:[
          {head_sha:"d".repeat(40),head_branch:"feature",
           event:"workflow_dispatch",created_at:"2026-10-18T11:18:00Z"},
        ]})}:{status:204};
    },
  });
  assert.equal(res.scheduled,true);
  assert.deepEqual(calls,["GET","POST"]);
  await assert.rejects(()=>requestGriSignedReadyCadence({
    env:{...env,GITHUB_EVENT_NAME:"workflow_run",GRI_SOURCE_WORKFLOW_VERIFIED:"0"},
    now:date,fetchImpl:async()=>{throw Error("unexpected")},
  }),/PROTECTED_RUN_REQUIRED/);
});

test("scheduled backstop is separate from original GRI proof, no Supabase or payment",()=>{
  const w=readFileSync(".github/workflows/gri-signed-ready-cadence-backstop.yml","utf8");
  const protectedGri=readFileSync(".github/workflows/gri-v12-supabase-free-reviewed-current.yml","utf8");
  const code=readFileSync("scripts/ops/dispatch-gri-signed-ready-cadence.mjs","utf8");
  assert.match(w,/cron: "13,28,43,58 \* \* \* \*"/u);
  assert.match(w,/"Auto Ingest News"/u);
  assert.match(w,/github.event.workflow_run.conclusion == 'success'/u);
  assert.match(w,/fetch-depth: 0/u);
  assert.match(w,/node scripts\/ops\/verify-gri-news-wakeup.mjs/u);
  assert.match(code,/SIGNED_GRI_PUBLISHER_ALREADY_RUNNING_OR_UNKNOWN/u);
  assert.match(w,/actions: write/u);
  assert.match(w,/github.ref == 'refs\/heads\/main'/u);
  assert.match(w,/vars.GRI_READY_REVIEWED_SHA256/u);
  assert.match(w,/vars.GRI_READY_CERTIFICATES_SHA256/u);
  assert.match(w,/vars.GRI_READY_APPROVED_AT/u);
  assert.match(w,/node --test scripts\/lib\/gri-signed-ready-cadence-hint.test.mjs/u);
  assert.match(protectedGri,/CURRENT_GRI_IMMUTABLE_INPUT_KEY_SHA_NOT_BOUND/u);
  assert.match(protectedGri,/preflightReviewedCurrentGlobalRisk|publish-supabase-free-global-risk.mjs/u);
  for(const banned of ["publishB2VerifiedHotSnapshot(","settleCoinbaseX402(","SUPABASE_SERVICE_ROLE_KEY","signed-original-news"])assert.equal(code.includes(banned),false);
});

test("failed genuine GRI run retries once after cooldown while external approval is still fresh",async()=>{
  const prior={
    head_sha:env.GITHUB_SHA,head_branch:"main",event:"workflow_dispatch",
    status:"completed",conclusion:"failure",created_at:"2026-10-18T11:17:00.000Z",
  };
  const calls=[];
  const r=await requestGriSignedReadyCadence({
    env,now:date,fetchImpl:async(url,opts)=>{
      calls.push(opts.method);
      return opts.method==="GET"?
        {status:200,json:async()=>({workflow_runs:[prior]})}:{status:204};
    },
  });
  assert.equal(r.scheduled,true);
  assert.equal(r.published,false);
  assert.equal(r.status,"DISPATCHED_SINGLE_BOUNDED_RETRY_REQUIRES_SIGNED_GRI_PROOF");
  assert.deepEqual(calls,["GET","POST"]);
  assert.equal(r.b2_gets,0);
  assert.equal(r.payments,0);
});
test("no repeated B2 attempt while live, successful, unreviewed, cooling down or already retried",async()=>{
  const base={head_sha:env.GITHUB_SHA,head_branch:"main",
    event:"repository_dispatch",status:"completed",conclusion:"failure",
    created_at:"2026-10-18T11:17:00.000Z"};
  for(const {runs,status} of [
    {runs:[{...base,status:"in_progress",conclusion:null}],
      status:"SIGNED_GRI_PUBLISHER_ALREADY_RUNNING_OR_UNKNOWN"},
    {runs:[{...base,status:"waiting",conclusion:null}],
      status:"SIGNED_GRI_PUBLISHER_ALREADY_RUNNING_OR_UNKNOWN"},
    {runs:[{...base,conclusion:"success"}],
      status:"SIGNED_GRI_PUBLISHER_SUCCEEDED_NO_REPEAT"},
    {runs:[{...base,conclusion:"action_required"}],
      status:"SIGNED_GRI_PUBLISHER_RESULT_NOT_RETRYABLE"},
    {runs:[{...base,created_at:"2026-10-18T11:26:00.000Z"}],
      status:"SIGNED_GRI_PUBLISHER_FAILED_COOLDOWN"},
    {runs:[base,{...base,created_at:"2026-10-18T11:24:00.000Z"}],
      status:"SIGNED_GRI_PUBLISHER_RETRY_LIMIT_REACHED"},
    {runs:[{...base,status:undefined,conclusion:undefined}],
      status:"SIGNED_GRI_PUBLISHER_ALREADY_RUNNING_OR_UNKNOWN"},
  ]){
    let requests=0;
    const result=await requestGriSignedReadyCadence({
      env,now:date,fetchImpl:async(url,opts)=>{
        requests++;
        assert.equal(opts.method,"GET");
        return {status:200,json:async()=>({workflow_runs:runs})};
      },
    });
    assert.equal(result.scheduled,false,status);
    assert.equal(result.status,status);
    assert.equal(requests,1);
    assert.equal(result.payments,0);
  }
});
test("new main does not reset approval retry budget; pre-approval runs do not suppress it",()=>{
  const old={head_sha:"f".repeat(40),head_branch:"main",
    event:"workflow_dispatch",status:"completed",conclusion:"failure",
    created_at:"2026-10-18T11:20:00.000Z"};
  const a=decideGriSignedPublisherRetry({
    runs:[old],headSha:env.GITHUB_SHA,
    approvedAt:env.GRI_READY_APPROVED_AT,now:date,
  });
  assert.equal(a.status,"SIGNED_GRI_PUBLISHER_RETRY_ONCE_AFTER_FAILURE");
  const b=decideGriSignedPublisherRetry({
    runs:[{...old,head_sha:env.GITHUB_SHA,
      created_at:"2026-10-18T11:12:00.000Z"}],
    headSha:env.GITHUB_SHA,approvedAt:env.GRI_READY_APPROVED_AT,now:date,
  });
  assert.equal(b.dispatch,true);
});

test("missing real GRI reviewer/cert pointers clearly block numeric recovery, without B2/payment",()=>{
  const report=explainGriSignedInputBlockers({now:date});
  assert.equal(report.current_numerical_score_verified,false);
  assert.equal(report.signed_gri_published,false);
  assert.equal(report.numerical_score_changed,false);
  assert.equal(report.b2_requests,0);
  assert.equal(report.d1_writes,0);
  assert.equal(report.payments,0);
  assert.deepEqual(report.missing_requirements,[
    "REAL_INDEPENDENTLY_REVIEWER_SIGNED_GRI_INPUT",
    "SEPARATE_SIGNED_COUNTRY_CATEGORY_CERTIFICATES",
    "RECENT_AUTHENTIC_REVIEW_APPROVAL_WINDOW",
  ]);
  const summary=safeGriBlockerJobSummary(report);
  assert.match(summary,/NOT VERIFIED/u);
  assert.match(summary,/No old score was refreshed/u);
  assert.equal(summary.includes("a".repeat(64)),false);
});
test("valid SHA hints never become proof of a current numeric GRI or source rights",()=>{
  const report=explainGriSignedInputBlockers({
    reviewedSha:input,certificatesSha:cert,
    readyAt:"2026-10-18T11:15:00.000Z",now:date,
  });
  assert.equal(report.externally_approved_fresh_hint_valid,true);
  assert.deepEqual(report.missing_requirements,[]);
  assert.equal(report.current_numerical_score_verified,false);
  assert.equal(report.genuine_source_and_commercial_rights_still_mandatory,true);
  assert.equal(report.publisher_dispatch_authorized_by_this_report,false);
  const s=safeGriBlockerJobSummary(report);
  assert.match(s,/real signatures, source rights/u);
  assert.equal(s.includes(input),false);
  assert.equal(s.includes(cert),false);
});
test("forged or stale reviewed pointers cannot give green numerical recovery",()=>{
  for(const args of [
    {reviewedSha:input,certificatesSha:input,readyAt:"2026-10-18T11:15:00.000Z"},
    {reviewedSha:input,certificatesSha:cert,readyAt:"2026-10-18T10:00:00.000Z"},
    {reviewedSha:"bad",certificatesSha:cert,readyAt:"2026-10-18T11:15:00.000Z"},
  ]){
    const report=explainGriSignedInputBlockers({...args,now:date});
    assert.equal(report.externally_approved_fresh_hint_valid,false);
    assert.equal(report.signed_gri_published,false);
    assert.ok(report.missing_requirements.length>0);
    assert.equal(report.b2_requests+report.d1_writes+report.payments,0);
  }
  assert.throws(()=>safeGriBlockerJobSummary({schema:"malicious",missing_requirements:[]}));
  assert.throws(()=>safeGriBlockerJobSummary({schema:"geomacro.gri-v12-signed-input-blockers.v1",missing_requirements:["LEAK_ARTICLE"]}));
});

test("new main cannot repeat a successful publisher or reset the two-attempt budget",()=>{
 const prior={head_sha:"f".repeat(40),head_branch:"main",event:"workflow_dispatch",
  status:"completed",conclusion:"success",created_at:"2026-10-18T11:17:00.000Z"};
 const check=runs=>decideGriSignedPublisherRetry({runs,headSha:env.GITHUB_SHA,
  approvedAt:env.GRI_READY_APPROVED_AT,now:date});
 assert.equal(check([prior]).status,"SIGNED_GRI_PUBLISHER_SUCCEEDED_NO_REPEAT");
 assert.equal(check([{...prior,conclusion:"failure"},
  {...prior,head_sha:env.GITHUB_SHA,conclusion:"failure"}]).status,
  "SIGNED_GRI_PUBLISHER_RETRY_LIMIT_REACHED");
});
