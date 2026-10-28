import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {
  classifyRiskIndicesRepair,runRiskIndicesVerifiedParentBackstop,
  decideVerifiedIndicesPublisherRetry,
} from "../ops/risk-indices-verified-parent-backstop.mjs";

const AT=new Date("2026-10-18T11:00:00.000Z");
const sha=s=>createHash("sha256").update(s).digest("hex");
const asOf=new Date(AT.getTime()-10*60_000).toISOString();
const REPO="blocknine0/geomacro";
const gitSha="a".repeat(40);
const pin="a".repeat(64);
function parent(){
  const reading=()=>({
    readingStatus:"current",readingAsOf:asOf,
    series:{"7D":{buckets:[{},{}]},"30D":{buckets:[{},{}]}},
  });
  const payload={
    schema:"geomacro.public-global-risk-live.v1",
    source_project:"ldpwajisioljyjtojvfx",
    generated_at:new Date(AT.getTime()-2*60_000).toISOString(),
    data:{methodologyVersion:"gri-v1.2.0",verificationStatus:"verified",
      auditPersisted:true,snapshotAsOf:asOf,
      proofHash:pin,evidenceHash:"b".repeat(64),calculationHash:"c".repeat(64),
      domainIndices:{geopolitics:reading(),macro:reading(),rare_earth:reading()}},
  };
  const payload_json=JSON.stringify(payload);
  return {
    ok:true,product:"global-risk",schema:payload.schema,
    generated_at:payload.generated_at,source_as_of:asOf,
    expires_at:new Date(AT.getTime()+80*60_000).toISOString(),
    proof_schema:"geomacro.public-global-risk-live-proof.v1",
    verification_mode:"direct-b2-readback",
    b2_object_key:"geomacro-evidence/v1/live/global-risk/latest.json.gz",
    b2_sha256:"d".repeat(64),payload_sha256:sha(payload_json),
    full_b2_readback_verified:true,exact_gzip_restore_verified:true,payload_json,
  };
}
function indices(gri=parent()){
  const v={
    schema:"geomacro.public-risk-indices-live.v1",
    source_project:"ldpwajisioljyjtojvfx",
    generated_at:new Date(AT.getTime()-2*60_000).toISOString(),
    parent_global_risk_b2_sha256:gri.b2_sha256,
    parent_global_risk_payload_sha256:gri.payload_sha256,
    data:{contractVersion:"risk-indices-v1.1.0",
      parentMethodologyVersion:"gri-v1.2.0",
      verificationStatus:"verified",proofScope:"verified-category-projection",
      snapshotId:"signed-parent-001",proofHash:pin,
      snapshotAsOf:gri.source_as_of,
      indices:[
        ["geopolitics","geopolitics"],
        ["macro","macro"],
        ["critical_minerals","rare_earth"],
      ].map(([key,sourceCategory])=>({
        key,sourceCategory,status:"available",readingStatus:"current",
        readingAsOf:gri.source_as_of,readingSnapshotId:"signed-parent-001",
        score:61,rawScore:61,series:{"7D":{buckets:[{},{}]},"30D":{buckets:[{},{}]}}
      }))},
  };
  const payload_json=JSON.stringify(v);
  return {
    ok:true,product:"risk-indices",schema:v.schema,
    generated_at:v.generated_at,source_as_of:gri.source_as_of,
    expires_at:new Date(AT.getTime()+80*60_000).toISOString(),
    proof_schema:"geomacro.public-risk-indices-live-proof.v1",
    verification_mode:"direct-b2-readback",
    b2_object_key:"geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz",
    b2_sha256:"e".repeat(64),payload_sha256:sha(payload_json),
    current_b2_readback_verified:true,
    full_b2_readback_verified:true,exact_gzip_restore_verified:true,payload_json,
  };
}
const env={
  GITHUB_REPOSITORY:REPO,GITHUB_REF:"refs/heads/main",
  GITHUB_EVENT_NAME:"schedule",GITHUB_SHA:gitSha,
  EXPECTED_CANONICAL_MAIN_SHA:gitSha,GITHUB_TOKEN:"private-synthetic-token-for-tests-only",
};
const main={ref:"refs/heads/main",object:{type:"commit",sha:gitSha}};
const response=(body,status=200)=>new Response(JSON.stringify(body),
  {status,headers:{"content-type":"application/json"}});
function mock({gri=parent(),child=indices(gri),canonicalMain=main,
  griStatus=200,childStatus=200,postStatus=204,
  existingRuns=[],metadataStatus=200,publishConclusion="success",jobsStatus=200,jobPayload}={}){
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,method:options.method});
    if(String(url).endsWith("/git/ref/heads/main"))return response(canonicalMain);
    if(String(url).endsWith("/global-risk"))return response(gri,griStatus);
    if(String(url).endsWith("/risk-indices"))return response(child,childStatus);
    if(String(url).endsWith("/runs?per_page=20"))
      return response({workflow_runs:existingRuns},metadataStatus);
    if(String(url).includes("/jobs?filter=latest&per_page=100"))
      return response(jobPayload??{total_count:1,jobs:[{
        name:"publish",run_id:1,status:"completed",conclusion:publishConclusion,
      }]},jobsStatus);
    if(String(url).endsWith("/dispatches"))return new Response(null,{status:postStatus});
    throw Error("UNEXPECTED_NETWORK_URL");
  };
  return {fetchImpl,calls};
}
test("stale, expired or unverified GRI NEVER dispatches or writes",async()=>{
  for(const alteration of [
    x=>{x.source_as_of=new Date(AT.getTime()-4*3600_000).toISOString();},
    x=>{x.expires_at=new Date(AT.getTime()-1).toISOString();},
    x=>{x.full_b2_readback_verified=false;},
    x=>{x.proof_schema="unreviewed-material-news";},
    x=>{x.b2_sha256="bad-hash";},
  ]){
    const p=parent();alteration(p);
    const f=mock({gri:p});
    const result=await runRiskIndicesVerifiedParentBackstop({
      env,now:AT,fetchImpl:f.fetchImpl,
    });
    assert.equal(result.eligible,false);
    assert.equal(result.dispatch_requested,false);
    assert.equal(f.calls.filter(x=>x.method==="POST").length,0);
    assert.equal(result.b2_requests,0);
    assert.equal(result.d1_writes,0);
    assert.equal(result.payments,0);
  }
});
test("if valid GRI and corresponding current exact indices already exist, skip",async()=>{
  const p=parent(),child=indices(p),f=mock({gri:p,child});
  const result=await runRiskIndicesVerifiedParentBackstop({env,now:AT,fetchImpl:f.fetchImpl});
  assert.equal(result.status,"CURRENT_INDICES_ALREADY_MATCH_PARENT");
  assert.equal(result.dispatch_requested,false);
  assert.equal(f.calls.filter(x=>x.method==="POST").length,0);
});
test("if genuinely verified signed GRI exists but indices expired, dispatch canonical protected workflow once",async()=>{
  const p=parent(),old=indices(p);
  old.expires_at=new Date(AT.getTime()-60_000).toISOString();
  const f=mock({gri:p,child:old});
  const result=await runRiskIndicesVerifiedParentBackstop({env,now:AT,fetchImpl:f.fetchImpl});
  assert.equal(result.status,"PROTECTED_INDICES_REPAIR_DISPATCHED");
  assert.equal(result.dispatch_requested,true);
  assert.equal(result.parent_scored_gri_verified,true);
  assert.equal(f.calls.filter(x=>x.method==="POST").length,1);
  assert.match(f.calls.find(x=>x.method==="POST").url,/risk-indices-verified-d1-parent\.yml\/dispatches$/u);
  assert.equal(result.payments,0);
  assert.equal(result.b2_requests,0);
});
function requireFileSyncStub(){return readFileSync(new URL("../../.github/workflows/risk-indices-verified-parent-backstop.yml",import.meta.url),"utf8");}
test("malformed, incomplete, old or unreviewed child cannot suppress verified parent repair",()=>{
  for(const modify of [
    v=>{v.data.indices.pop();},
    v=>{v.data.indices[0].key="macro";},
    v=>{v.data.indices[0].status="unavailable";v.data.indices[0].score=null;},
    v=>{v.data.indices[0].score=0/0;},
    v=>{v.data.indices[1].readingAsOf=new Date(AT.getTime()-70*60_000).toISOString();},
    v=>{v.data.indices[2].series["7D"].buckets=[];},
    v=>{v.data.verificationStatus="research-triage-only";},
    v=>{v.data.proofHash="b".repeat(64);},
    v=>{v.data.contractVersion="not-a-public-certified-index";},
  ]){
    const p=parent(),c=indices(p),v=JSON.parse(c.payload_json);
    modify(v);c.payload_json=JSON.stringify(v);c.payload_sha256=sha(c.payload_json);
    const verdict=classifyRiskIndicesRepair({griSnapshot:p,indicesSnapshot:c,now:AT.getTime()});
    assert.equal(verdict.eligible,true);
    assert.equal(verdict.status,"REPAIR_REQUIRES_PROTECTED_PUBLISHER");
    assert.equal(verdict.payments,0);
  }
});
test("genuine reviewed upstream workflow_run may wake recovery but never fabricate without current parent",async()=>{
  const f=mock({childStatus:503});
  const receipt=await runRiskIndicesVerifiedParentBackstop({
    env:{...env,GITHUB_EVENT_NAME:"workflow_run"},now:AT,fetchImpl:f.fetchImpl
  });
  assert.equal(receipt.dispatch_requested,true);
  assert.equal(f.calls.filter(x=>x.method==="POST").length,1);
  const bad=mock({griStatus:503});
  const noSource=await runRiskIndicesVerifiedParentBackstop({
    env:{...env,GITHUB_EVENT_NAME:"workflow_run"},now:AT,fetchImpl:bad.fetchImpl
  });
  assert.equal(noSource.dispatch_requested,false);
  assert.equal(bad.calls.some(x=>x.method==="POST"),false);
});
test("backup workflow keeps strict upstream production pedigree and never modifies page",()=>{
  const fs=requireFileSyncStub();
  assert.match(fs,/workflow_run:/u);
  assert.match(fs,/GRI v1\.2 Supabase-Free Current Promotion/u);
  assert.match(fs,/head_repository\.full_name == 'blocknine0\/geomacro'/u);
  assert.match(fs,/head_branch == 'main'/u);
  assert.match(fs,/github\.event\.workflow_run\.conclusion == 'success'/u);
  assert.match(fs,/scripts\/ops\/risk-indices-verified-parent-backstop\.mjs/u);
  assert.equal(fs.includes("src/components/risk-indices"),false);
});
test("source SHA mismatched indices request repair rather than declare current",()=>{
  const p=parent(),c=indices(p);
  const v=JSON.parse(c.payload_json);
  v.parent_global_risk_b2_sha256="f".repeat(64);
  c.payload_json=JSON.stringify(v);
  c.payload_sha256=sha(c.payload_json);
  const decision=classifyRiskIndicesRepair({griSnapshot:p,indicesSnapshot:c,now:AT.getTime()});
  assert.equal(decision.eligible,true);
  assert.equal(decision.parent_scored_gri_verified,true);
});
test("no current GRI, moved canonical main or untrusted branch never trigger",async()=>{
  for(const failed of [
    {griStatus:503},{canonicalMain:{...main,object:{type:"commit",sha:"b".repeat(40)}}},
  ]){
    const f=mock(failed);
    const result=await runRiskIndicesVerifiedParentBackstop({
      env,now:AT,fetchImpl:f.fetchImpl,
    });
    assert.equal(result.dispatch_requested,false);
    assert.equal(f.calls.filter(x=>x.method==="POST").length,0);
  }
  const f=mock();
  await assert.rejects(()=>runRiskIndicesVerifiedParentBackstop({
    env:{...env,GITHUB_REF:"refs/heads/feature"},now:AT,fetchImpl:f.fetchImpl,
  }),/PROTECTED_CANONICAL_MAIN/);
  assert.equal(f.calls.length,0);
});
test("missing GitHub Action write token does not fake a dispatch",async()=>{
  const f=mock({childStatus:503});
  await assert.rejects(()=>runRiskIndicesVerifiedParentBackstop({
    env:{...env,GITHUB_TOKEN:""},now:AT,fetchImpl:f.fetchImpl,
  }),/DISPATCH_TOKEN_REQUIRED/);
  assert.equal(f.calls.filter(x=>x.method==="POST").length,0);
});

const repoRun=(overrides={})=>({
  id:1,head_sha:gitSha,head_branch:"main",event:"workflow_dispatch",
  status:"completed",conclusion:"failure",
  created_at:new Date(AT.getTime()-9*60_000).toISOString(),...overrides,
});
test("one parent can dispatch only once while publisher runs or has succeeded",async()=>{
  for(const attempt of [
    repoRun({status:"in_progress",conclusion:null}),
    repoRun({status:"completed",conclusion:"success"}),
    repoRun({status:"queued",conclusion:null}),
    repoRun({status:"unknown_future_state",conclusion:null}),
  ]){
    const f=mock({childStatus:503,existingRuns:[attempt]});
    const result=await runRiskIndicesVerifiedParentBackstop({env,now:AT,fetchImpl:f.fetchImpl});
    assert.equal(result.dispatch_requested,false);
    assert.equal(result.eligible,false);
    assert.equal(f.calls.filter(x=>x.method==="POST").length,0);
    assert.equal(result.b2_requests,0);
  }
});
test("failed publisher retries only once after cooldown while source stays current",async()=>{
  const first=repoRun();
  const good=mock({childStatus:503,existingRuns:[first]});
  const receipt=await runRiskIndicesVerifiedParentBackstop({env,now:AT,fetchImpl:good.fetchImpl});
  assert.equal(receipt.status,"PROTECTED_INDICES_REPAIR_SINGLE_RETRY_DISPATCHED");
  assert.equal(receipt.dispatch_requested,true);
  assert.equal(good.calls.filter(x=>x.method==="POST").length,1);
  for(const runs of [
    [repoRun({created_at:new Date(AT.getTime()-2*60_000).toISOString()})],
    [first,repoRun({created_at:new Date(AT.getTime()-3*60_000).toISOString()})],
  ]){
    const f=mock({childStatus:503,existingRuns:runs});
    const r=await runRiskIndicesVerifiedParentBackstop({env,now:AT,fetchImpl:f.fetchImpl});
    assert.equal(r.dispatch_requested,false);
    assert.equal(f.calls.filter(x=>x.method==="POST").length,0);
  }
});
test("unrelated earlier or foreign SHA run never suppresses a new verified parent",async()=>{
  const unrelated=repoRun({head_sha:"b".repeat(40)});
  const f=mock({childStatus:503,existingRuns:[unrelated]});
  const receipt=await runRiskIndicesVerifiedParentBackstop({env,now:AT,fetchImpl:f.fetchImpl});
  assert.equal(receipt.status,"PROTECTED_INDICES_REPAIR_DISPATCHED");
  assert.equal(receipt.dispatch_requested,true);
});
test("GitHub metadata outage or malformed records fails closed before dispatch",async()=>{
  for(const status of [403,503]){
    const f=mock({childStatus:503,metadataStatus:status});
    await assert.rejects(()=>runRiskIndicesVerifiedParentBackstop({
      env,now:AT,fetchImpl:f.fetchImpl,
    }),/INDICES_REPAIR_RUN_LOOKUP_FAILED/);
    assert.equal(f.calls.filter(x=>x.method==="POST").length,0);
  }
  const f=mock({childStatus:503,existingRuns:Array.from({length:21},()=>repoRun())});
  await assert.rejects(()=>runRiskIndicesVerifiedParentBackstop({
    env,now:AT,fetchImpl:f.fetchImpl,
  }),/INDICES_REPAIR_RUN_LOOKUP_FAILED/);
});
test("run reconciliation rejects forged clock or head before any retry",()=>{
  assert.throws(()=>decideVerifiedIndicesPublisherRetry({
    runs:[],headSha:"bad",parentSourceAsOf:asOf,now:AT,
  }),/METADATA_INVALID/);
  assert.throws(()=>decideVerifiedIndicesPublisherRetry({
    runs:[],headSha:gitSha,
    parentSourceAsOf:new Date(AT.getTime()-3*3600_000).toISOString(),now:AT,
  }),/PARENT_TIME_INVALID/);
});

test("valid backend recovery never waits on a website deployment",async()=>{
 const f=mock({childStatus:503});
 const r=await runRiskIndicesVerifiedParentBackstop({env,now:AT,fetchImpl:f.fetchImpl});
 assert.equal(r.dispatch_requested,true);
 assert.equal(r.parent_scored_gri_verified,true);
 assert.equal(f.calls.some(x=>x.url.includes("geomacro.live")),false);
 assert.equal(f.calls[0].url,"https://api.github.com/repos/"+REPO+"/git/ref/heads/main");
});
test("unavailable or malformed canonical code identity cannot request publication",async()=>{
 for(const canonicalMain of [null,{}, {ref:"refs/heads/main",object:{type:"tag",sha:gitSha}},
  {ref:"refs/heads/other",object:{type:"commit",sha:gitSha}}]){
  const f=mock({canonicalMain,childStatus:503});
  const r=await runRiskIndicesVerifiedParentBackstop({env,now:AT,fetchImpl:f.fetchImpl});
  assert.equal(r.status,"SKIPPED_CANONICAL_MAIN_NOT_CURRENT");
  assert.equal(r.dispatch_requested,false);
  assert.equal(f.calls.length,1);
 }
 const calls=[];
 const r=await runRiskIndicesVerifiedParentBackstop({env,now:AT,fetchImpl:async url=>{
  calls.push(url);return new Response(null,{status:503});
 }});
 assert.equal(r.dispatch_requested,false);
 assert.equal(calls.length,1);
});

// Regression: production run 39753818436 was green while publish was skipped.
test("green contract-only workflow_run cannot suppress genuine parent repair",async()=>{
  const f=mock({childStatus:503,existingRuns:[repoRun({
    event:"workflow_run",conclusion:"success",
  })],publishConclusion:"skipped"});
  const result=await runRiskIndicesVerifiedParentBackstop({env,now:AT,fetchImpl:f.fetchImpl});
  assert.equal(result.dispatch_requested,true);
  assert.equal(f.calls.filter(x=>x.url.includes("/jobs?")).length,1);
  assert.equal(f.calls.filter(x=>x.method==="POST").length,1);
  assert.equal(result.b2_requests,0);
});
test("actual successful publication still suppresses repeated B2 work",async()=>{
  const f=mock({childStatus:503,existingRuns:[repoRun({conclusion:"success"})]});
  const result=await runRiskIndicesVerifiedParentBackstop({env,now:AT,fetchImpl:f.fetchImpl});
  assert.equal(result.dispatch_requested,false);
  assert.equal(f.calls.filter(x=>x.url.includes("/jobs?")).length,1);
});
test("unreadable ambiguous truncated or foreign jobs never authorize retry",async()=>{
  for(const alteration of [
    {jobsStatus:403},{jobsStatus:503},
    {jobPayload:{total_count:2,jobs:[]}},
    {jobPayload:{total_count:0,jobs:[]}},
    {jobPayload:{total_count:1,jobs:[{name:"publish",run_id:2,status:"completed",conclusion:"skipped"}]}},
    {jobPayload:{total_count:1,jobs:[{name:"publish",run_id:1,status:"in_progress",conclusion:null}]}},
    {jobPayload:{total_count:2,jobs:Array.from({length:2},()=>({name:"publish",run_id:1,status:"completed",conclusion:"skipped"}))}},
  ]){
    const f=mock({childStatus:503,existingRuns:[repoRun({conclusion:"success"})],...alteration});
    await assert.rejects(()=>runRiskIndicesVerifiedParentBackstop({env,now:AT,fetchImpl:f.fetchImpl}),
      /PUBLISH_JOB_LOOKUP_FAILED/);
    assert.equal(f.calls.some(x=>x.method==="POST"),false);
  }
});
test("active foreign and old green runs need no job lookup",async()=>{
  for(const run of [repoRun({status:"queued",conclusion:null}),
    repoRun({head_sha:"b".repeat(40),conclusion:"success"}),
    repoRun({created_at:new Date(AT.getTime()-20*60_000).toISOString(),conclusion:"success"})]){
    const f=mock({childStatus:503,existingRuns:[run]});
    await runRiskIndicesVerifiedParentBackstop({env,now:AT,fetchImpl:f.fetchImpl});
    assert.equal(f.calls.some(x=>x.url.includes("/jobs?")),false);
  }
});
