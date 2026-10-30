import test from "node:test";
import assert from "node:assert/strict";
import {FIRST_QUERY_PATH,probeFirstQuery} from "../ops/phase2h-first-intelligence-query-no-funds.mjs";
const sha="d".repeat(40);
const deployment={schema_version:"geomacro.deployment-build.v1",
 canonical_repository:"blocknine0/geomacro",canonical_main_sha:sha};
function simulated(body,status,{challenge=false,settlement=false}={}){
 let posts=0;
 return {fetchImpl:async(url,init)=>{
  assert.equal(init.redirect,"error");
  if(String(url).endsWith("/.well-known/geomacro-build.json"))
   return Response.json(deployment);
  assert.equal(new URL(url).pathname,FIRST_QUERY_PATH);
  assert.equal(init.method,"POST");
  assert.equal(init.headers["PAYMENT-SIGNATURE"],undefined);
  assert.equal(init.headers.Authorization,undefined);
  assert.equal(init.headers["Content-Type"],"application/json");
  const input=JSON.parse(init.body);
  assert.equal(input.subjects[0].country_iso3,"USA");
  assert.deepEqual(input.topics,["macro_risk","fx_external_risk"]);
  posts++;
  return Response.json(body,{status,headers:{
   ...(challenge?{"PAYMENT-REQUIRED":"fixed-valid-looking-but-not-settlement"}:{}),
   ...(settlement?{"PAYMENT-RESPONSE":"fake-unauthorized-claim"}:{}),
  }});
 },numberOfPosts:()=>posts};
}
test("no-pay unqualified HTTP 422 is useful truthful negative receipt",async()=>{
 const request=simulated({ok:false,chargeable:false,payment_required_now:false,
  payment_authorized:false,execution_authorized:false,
  error:{code:"INSUFFICIENT_COVERAGE"}},422);
 const r=await probeFirstQuery({fetchImpl:request.fetchImpl,expectedSha:sha});
 assert.equal(request.numberOfPosts(),1);
 assert.equal(r.production_http_status,422);
 assert.equal(r.first_paid_query_qualified,false);
 assert.equal(r.immutable_prequote_readback_verified,false);
 assert.equal(r.error_code,"INSUFFICIENT_COVERAGE");
 assert.equal(r.no_payment_performed,true);
 assert.equal(JSON.stringify(r).includes("Federal Reserve"),false);
});
test("a 402 payment challenge alone never becomes B2/rights/payment PASS",async()=>{
 const r=await probeFirstQuery({expectedSha:sha,
  fetchImpl:simulated({x402Version:2,resource:{url:"https://geomacro.live/api/v1/intelligence/query"}},402,{challenge:true}).fetchImpl});
 assert.equal(r.x402_challenge_header_observed,true);
 assert.equal(r.first_paid_query_qualified,false);
 assert.equal(r.original_article_rights_verified,false);
 assert.equal(r.signed_customer_answer_verified,false);
});
test("free 200 remains noncommercial and cannot claim frozen paid delivery",async()=>{
 const r=await probeFirstQuery({expectedSha:sha,
  fetchImpl:simulated({ok:true,chargeable:false,payment_required_now:false,
   payment_authorized:false,execution_authorized:false},200).fetchImpl});
 assert.equal(r.disposition,"NONCOMMERCIAL_RESEARCH_ONLY");
 assert.equal(r.first_paid_query_qualified,false);
});
test("no false acceptance for SHA drift, paid HTTP 200 or settlement header",async()=>{
 const wrong=simulated({chargeable:false,payment_required_now:false},422);
 await assert.rejects(probeFirstQuery({expectedSha:"e".repeat(40),
  fetchImpl:wrong.fetchImpl}),/DEPLOYED_SHA_PARITY_UNVERIFIED/u);
 await assert.rejects(probeFirstQuery({expectedSha:sha,
  fetchImpl:simulated({ok:true,chargeable:true},200).fetchImpl}),
  /UNEXPECTED_UNPAID_CUSTOMER_HTTP/u);
 await assert.rejects(probeFirstQuery({expectedSha:sha,
  fetchImpl:simulated({chargeable:false,payment_required_now:false},422,{settlement:true}).fetchImpl}),
  /UNPAID_RESPONSE_CLAIMED_SETTLEMENT/u);
});
