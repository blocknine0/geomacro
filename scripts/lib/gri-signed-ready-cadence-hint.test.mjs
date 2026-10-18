import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {prepareGriSignedReadyCadenceHint,assertGriDispatchTarget} from
  "./gri-signed-ready-cadence-hint.mjs";
import {requestGriSignedReadyCadence} from
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
      return {status:204};
    },
  });
  assert.equal(calls.length,1);
  assert.equal(result.scheduled,true);
  assert.equal(result.published,false);
  assert.equal(result.gri_score_recomputed,false);
  assert.equal(result.payments,0);
  assert.match(calls[0].url,/\/actions\/workflows\/gri-v12-supabase-free-reviewed-current.yml\/dispatches$/);
  assert.equal(calls[0].options.method,"POST");
  assert.equal(calls[0].options.redirect,"error");
  const payload=JSON.parse(calls[0].options.body);
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
test("GitHub 403/429 or network failure never claims a publication",async()=>{
  await assert.rejects(()=>requestGriSignedReadyCadence({
    env,now:date,fetchImpl:async()=>({status:403}),
  }),/DISPATCH_REJECTED/);
  await assert.rejects(()=>requestGriSignedReadyCadence({
    env,now:date,fetchImpl:async()=>{throw Error("secret")},
  }),/DISPATCH_TRANSPORT_FAILED/);
});
test("scheduled backstop is separate from original GRI proof, no Supabase or payment",()=>{
  const w=readFileSync(".github/workflows/gri-signed-ready-cadence-backstop.yml","utf8");
  const protectedGri=readFileSync(".github/workflows/gri-v12-supabase-free-reviewed-current.yml","utf8");
  const code=readFileSync("scripts/ops/dispatch-gri-signed-ready-cadence.mjs","utf8");
  assert.match(w,/cron: "13,43 \* \* \* \*"/u);
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
