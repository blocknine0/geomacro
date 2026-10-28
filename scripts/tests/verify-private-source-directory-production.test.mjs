import test from "node:test";
import assert from "node:assert/strict";
import {verifyPrivateSourceDirectoryProduction} from
  "../ops/verify-private-source-directory-production.mjs";

const origin="https://geomacro-control-plane.daspallab202391.workers.dev";
const env={CONTROL_PLANE_URL:origin,CONTROL_PLANE_TOKEN:"a".repeat(64)};
const coverage={ok:true,schema:"geomacro.private-source-directory-coverage.v1",
  rows_verified_in_shadow:779,
  country_directory_counts:{primary:195,statistics:194,monetary:195,critical_minerals:195},
  known_missing_statistics_iso2:["VA"],
  status:"PRIVATE_METADATA_COPIED_NOT_ACTIVATED",
  source_activated:false,real_time_source_health_verified:false,
  raw_news_delivery_enabled:false,commercial_rights_verified:false,
  supabase_requests:0,b2_requests:0,payments:0,chargeable:false,
};
const us={ok:true,schema:"geomacro.private-legacy-source-directory.v1",
  country_iso2:"US",dataset:"primary",source_directory_metadata:{country_iso2:"US"},
  metadata_sha256:"f".repeat(64),
  data_origin:"legacy-supabase-verified-d1-shadow",source_activated:false,
  original_live_retrieval_verified:false,derivative_commercial_rights_approved:false,
  partner_output_authorized:false,chargeable:false};
const va={ok:false,error:"SOURCE_DIRECTORY_ENTRY_UNAVAILABLE",
  country_iso2:"VA",dataset:"statistics",commercially_usable:false};

function fake({changes={},transportOnceStage=null}={}){
  const calls=[],attempts={};
  const fetchImpl=async(url,opts)=>{
    const path=new URL(url).pathname+new URL(url).search;
    const stage= !opts.headers.Authorization?"anonymous":
      path.endsWith("source-directory-coverage")?"coverage":
      path.includes("country_iso2=US")?"us":"missing_va";
    attempts[stage]=(attempts[stage]??0)+1;
    calls.push({stage,method:opts.method,path,auth:!!opts.headers.Authorization,
      hasBody:Object.hasOwn(opts,"body"),cache:opts.cache,
      signal:opts.signal,origin:new URL(url).origin});
    if(stage===transportOnceStage&&attempts[stage]===1)
      throw new Error("PRIVATE source name and token SHOULD NEVER BE LOGGED");
    if(Object.hasOwn(changes,stage)){
      const v=changes[stage];return typeof v==="function"?v():v;
    }
    if(stage==="anonymous")return Response.json({ok:false},{status:401});
    if(stage==="coverage")return Response.json(coverage);
    if(stage==="us")return Response.json(us);
    return Response.json(va,{status:404});
  };
  return {fetchImpl,calls,attempts};
}
test("production acceptance is four read-only, same-origin, independently checked requests",async()=>{
  const x=fake(),delays=[];
  const result=await verifyPrivateSourceDirectoryProduction({
    env,fetchImpl:x.fetchImpl,sleep:async ms=>delays.push(ms),
  });
  assert.equal(result.verified,true);
  assert.equal(result.expected_shadow_rows,779);
  assert.equal(result.hash_bound_us_sample_verified,true);
  assert.equal(result.permanent_network_availability_guaranteed,false);
  assert.equal(result.source_directory_metadata_logged,false);
  assert.equal(result.protected_partner_endpoint_accessed,false);
  assert.equal(result.supabase_requests,0);
  assert.equal(result.payments,0);
  assert.equal(x.calls.length,4);
  assert.deepEqual(x.calls.map(x=>x.stage),
    ["anonymous","coverage","us","missing_va"]);
  assert.deepEqual(delays,[]);
  assert.ok(x.calls.every(v=>v.method==="GET"&&!v.hasBody&&
    v.cache==="no-store"&&v.signal instanceof AbortSignal&&
    v.origin===origin));
  assert.deepEqual(x.calls.map(v=>v.auth),[false,true,true,true]);
  assert.deepEqual(result.transport_attempts_by_stage,
    {anonymous:1,coverage:1,us:1,missing_va:1});
  assert.equal(JSON.stringify(result).includes(env.CONTROL_PLANE_TOKEN),false);
  assert.equal(JSON.stringify(result).includes("source_directory_metadata"),true);
});
test("one lost edge response receives bounded retry; private contents never logged",async()=>{
  for(const stage of ["anonymous","coverage","us","missing_va"]){
    const x=fake({transportOnceStage:stage}),delays=[];
    const proof=await verifyPrivateSourceDirectoryProduction({
      env,fetchImpl:x.fetchImpl,sleep:async ms=>delays.push(ms)});
    assert.equal(proof.verified,true);
    assert.equal(x.attempts[stage],2);
    assert.deepEqual(delays,[500]);
  }
});
test("repeated loss exhausts exactly 3 attempts without writes or unbounded loops",async()=>{
  const x=fake({changes:{coverage:()=>{throw Error("secret transport data")}}});
  const delays=[];
  await assert.rejects(verifyPrivateSourceDirectoryProduction({
    env,fetchImpl:x.fetchImpl,sleep:async ms=>delays.push(ms)}),
    /SOURCE_DIRECTORY_ACCEPTANCE_COVERAGE_TRANSPORT_EXHAUSTED/u);
  assert.equal(x.attempts.coverage,3);
  assert.deepEqual(delays,[500,1250]);
  assert.equal(x.calls.every(c=>c.method==="GET"&&!c.hasBody),true);
});
test("only gateway/edge transient responses are retried, not D1 quota/503 or 429",async()=>{
  for(const transient of [502,504,520,522,523,524]){
    const x=fake({changes:{coverage:()=>{
      if(x.attempts.coverage===1)return Response.json({ok:false},{status:transient});
      return Response.json(coverage);
    }}});
    const r=await verifyPrivateSourceDirectoryProduction({
      env,fetchImpl:x.fetchImpl,sleep:async()=>{}});
    assert.equal(r.verified,true);
    assert.equal(x.attempts.coverage,2);
  }
  for(const hard of [400,401,403,404,409,429,500,503]){
    const x=fake({changes:{coverage:Response.json({ok:false},{status:hard})}});
    await assert.rejects(verifyPrivateSourceDirectoryProduction({
      env,fetchImpl:x.fetchImpl,sleep:async()=>{}}),
      new RegExp("SOURCE_DIRECTORY_ACCEPTANCE_COVERAGE_HTTP_"+hard));
    assert.equal(x.attempts.coverage,1);
  }
});
test("integrity drift, incorrect denial or fictitious Vatican row never becomes green",async()=>{
  const cases=[
    {anonymous:Response.json({}, {status:200})},
    {coverage:Response.json({...coverage,rows_verified_in_shadow:778})},
    {coverage:Response.json({...coverage,country_directory_counts:{...coverage.country_directory_counts,statistics:195}})},
    {coverage:Response.json({...coverage,source_activated:true})},
    {coverage:Response.json({...coverage,payments:1})},
    {us:Response.json({...us,metadata_sha256:"bad"})},
    {us:Response.json({...us,partner_output_authorized:true})},
    {missing_va:Response.json({ok:true},{status:200})},
    {missing_va:Response.json({...va,commercially_usable:true},{status:404})},
  ];
  for(const changes of cases){
    const x=fake({changes});
    await assert.rejects(verifyPrivateSourceDirectoryProduction({
      env,fetchImpl:x.fetchImpl,sleep:async()=>{}}),
      /SOURCE_DIRECTORY_ACCEPTANCE_/u);
    assert.ok(Object.values(x.attempts).every(n=>n===1));
  }
});
test("fail closed on wrong origin, invalid token, malformed JSON, oversized or redirect",async()=>{
  await assert.rejects(verifyPrivateSourceDirectoryProduction({
    env:{...env,CONTROL_PLANE_URL:"https://evil.example"},
    fetchImpl:()=>{throw Error("NETWORK_MUST_NOT_RUN")}}),
    /SOURCE_DIRECTORY_ACCEPTANCE_ORIGIN_NOT_PINNED/u);
  await assert.rejects(verifyPrivateSourceDirectoryProduction({
    env:{...env,CONTROL_PLANE_TOKEN:"bad"},
    fetchImpl:()=>{throw Error("NETWORK_MUST_NOT_RUN")}}),
    /SOURCE_DIRECTORY_ACCEPTANCE_ADMIN_TOKEN_UNAVAILABLE/u);
  for(const response of [
    new Response("not json",{headers:{"content-type":"application/json"}}),
    new Response("A".repeat(50001),{headers:{"content-type":"application/json"}}),
    new Response("{}",{headers:{"content-type":"text/html"}}),
    {status:200,redirected:true},
  ]){
    const x=fake({changes:{coverage:response}});
    await assert.rejects(verifyPrivateSourceDirectoryProduction({
      env,fetchImpl:x.fetchImpl,sleep:async()=>{}}),
      /SOURCE_DIRECTORY_ACCEPTANCE_/u);
    assert.equal(x.attempts.coverage,1);
  }
});
