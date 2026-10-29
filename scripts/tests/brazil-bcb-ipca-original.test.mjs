import test from "node:test";
import assert from "node:assert/strict";
import {summarizeBcbIpcaMonthly,probeBcbIpca} from "../ops/probe-brazil-bcb-ipca-original.mjs";
const now=new Date("2026-10-29T00:00:00Z");
const sample=[
 {data:"01/07/2026",valor:"0.26"},
 {data:"01/08/2026",valor:"-0.01"},
 {data:"01/09/2026",valor:"0.48"},
];
test("Brazil BCB genuine monthly reference-period fixture remains unscored source-only",()=>{
 const result=summarizeBcbIpcaMonthly(sample,now);
 assert.equal(result.country_iso3,"BRA");
 assert.equal(result.latest_reference_month,"2026-09");
 assert.equal(result.observations_with_valid_native_reference_month,3);
 assert.equal(result.original_article_publication_clock_verified,false);
 assert.equal(result.canonical_store_available,false);
 assert.equal(result.source_specific_commercial_rights_approved,false);
 assert.equal(result.monetization_or_x402_eligible,false);
 assert.equal(JSON.stringify(result).includes("0.48"),false);
});
test("fail closed on duplicate, future, old, nonmonthly, injections and false rates",()=>{
 const invalid=[
  [...sample,sample[0]],
  [{data:"01/09/2026",valor:"9999"}],
  [{data:"01/09/2026",valor:"1e5"}],
  [{data:"01/09/2026",valor:"0.1",copyright:"license"}],
  [{data:"02/09/2026",valor:"0.1"}],
  [{data:"01/01/2028",valor:"0.1"}],
  [{data:"01/01/2020",valor:"0.1"}],
  [{data:"31/02/2026",valor:"0.1"}],
  [{data:"01/11/2026",valor:"0.1"}],
  [{data:"01/09/2026",valor:"Infinity"}],
 ];
 for(const value of invalid)
  assert.throws(()=>summarizeBcbIpcaMonthly(value,now));
});
test("bounded one actual-source GET, neither extra calls nor rights grant",async()=>{
 let calls=0;
 const fetchImpl=async (url,init)=>{
  calls++;assert.equal(new URL(url).hostname,"api.bcb.gov.br");
  assert.equal(init.method,"GET");assert.equal(init.redirect,"error");
  return Response.json(sample);
 };
 const result=await probeBcbIpca({fetchImpl,now});
 assert.equal(calls,1);
 assert.equal(result.status,"OFFICIAL_MONTHLY_REFERENCE_PERIOD_OBSERVED_NOT_COMMERCIAL");
 assert.equal(result.source_requests_attempted,1);
 assert.equal(result.data_licence_review_required,true);
 assert.equal(result.commercial_data_eligible,false);
 assert.equal(result.qualified_news_created,false);
 assert.equal(result.d1_writes,0);
 assert.equal(result.b2_requests,0);
 assert.equal(result.payments,0);
});
test("quota denial, provider error, HTML and invalid payload do not trigger retries or paid eligibility",async()=>{
 for(const response of [new Response("quota",{status:429}),new Response("<html/>"),Response.json({message:"no data"}),new Response("huge",{headers:{"content-length":"49000"}})]){
  let calls=0;
  const result=await probeBcbIpca({fetchImpl:async()=>{calls++;return response},now});
  assert.equal(calls,1);
  assert.equal(result.status,"OFFICIAL_IPCA_SOURCE_UNAVAILABLE_OR_UNVERIFIED");
  assert.equal(result.commercial_data_eligible,false);
  assert.equal(result.qualified_news_created,false);
  assert.equal(result.payments,0);
 }
});
