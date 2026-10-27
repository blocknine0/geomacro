import test from "node:test";
import assert from "node:assert/strict";
import {
 safeSharedNewsParityFailure,verifySharedNewsLive
} from "../ops/verify-shared-derived-news-live.mjs";

test("every internally allowlisted parity failure reports its EXACT stage but no source data",()=>{
 for(const code of [
  "D1_SHARED_NEWS_HTTP_UNAVAILABLE",
  "D1_SHARED_NEWS_OVERSIZE",
  "D1_SHARED_NEWS_CONTRACT_INVALID",
  "D1_SHARED_NEWS_PAGE_INVALID",
  "D1_SHARED_NEWS_DUPLICATE",
  "D1_SHARED_NEWS_CURSOR_INVALID",
  "D1_SHARED_NEWS_DIFFERENT_ID_COUNT",
  "D1_SHARED_NEWS_SOURCE_PARITY_MISMATCH",
  "D1_SHARED_NEWS_DOMAIN_COUNT_MISMATCH",
  "D1_SHARED_NEWS_DIAGNOSIS_PARITY_MISMATCH",
 ]){
  const receipt=safeSharedNewsParityFailure(new Error(code));
  assert.equal(receipt.reason,code);
  assert.equal(receipt.verified,false);
  assert.equal(receipt.partner_delivery_verified,false);
  assert.equal(receipt.original_source_rights_verified,false);
  assert.equal(receipt.payments,0);
 }
});
test("upstream error body, private publisher URL and secret are never propagated",()=>{
 const contaminated="SECRET_KEY and https://private-source.example.com/item/2";
 for(const error of [
  new Error(contaminated),
  new Error("D1_SHARED_NEWS_HTTP_UNAVAILABLE "+contaminated),
  {message:contaminated,stack:contaminated},
  undefined,
 ]){
  const receipt=safeSharedNewsParityFailure(error);
  assert.equal(receipt.reason,"D1_SHARED_NEWS_UNCLASSIFIED_OR_TRANSPORT_FAILURE");
  assert.equal(JSON.stringify(receipt).includes(contaminated),false);
  assert.equal(receipt.raw_upstream_data_exposed,false);
 }
});
test("actual 503 returns failed parity (not success) and is classified without real requests",async()=>{
 let calls=0;
 try{
  await verifySharedNewsLive(async()=>{
   calls++;return new Response('upstream confidential content',{status:503});
  });
  assert.fail("unavailable source should reject");
 }catch(e){
  const failure=safeSharedNewsParityFailure(e);
  assert.equal(failure.reason,"D1_SHARED_NEWS_HTTP_UNAVAILABLE");
  assert.equal(calls,1);
  assert.equal(JSON.stringify(failure).includes("confidential"),false);
 }
});
test("schema or rights not actually approved remains red",async()=>{
 let calls=0;
 const fake=async()=>{
  calls++;
  return new Response(JSON.stringify({
   schema:"geomacro.derived-news-structural-feed.v1",ok:true,
   chargeable:true,commercial_rights_verified:true,
   partner_resale_or_commercial_redistribution_authorized:true,
   raw_upstream_delivered:false,items:[],counts:{geopolitics:0,macro:0,rare_earth:0}
  }),{status:200,headers:{"content-type":"application/json"}});
 };
 await assert.rejects(()=>verifySharedNewsLive(fake),e=>
  safeSharedNewsParityFailure(e).reason==="D1_SHARED_NEWS_CONTRACT_INVALID");
 assert.equal(calls,1);
});

test("Predge shared D1 parity reads the zero-delay website journal, never the delayed legacy alias",async()=>{
 const domains=["geopolitics","macro","rare_earth"];
 const counts=Object.fromEntries(domains.map(c=>[c,0]));
 const availability_by_category=Object.fromEntries(domains.map(c=>[c,{
  latest_source_check:{current_source_check_verified:false,
   commercial_rights_verified:false,paid_delivery_authorized:false},
  journal_derived_records_72h:0,
  journal_credit_required_records_72h:0,
  withheld_from_source_neutral_view_72h:0,
  producer_run_freshness_verified:false,
  reference_data_is_not_a_new_official_release:true
 }]));
 const urls=[];
 const fetcher=async(url,init)=>{
  assert.equal(init?.headers?.["Cache-Control"],"no-cache");
  urls.push(url);
  if(url.endsWith("/derived-structural-72h")){
   return new Response(JSON.stringify({
    schema:"geomacro.derived-news-structural-feed.v1",ok:true,
    chargeable:false,commercial_rights_verified:false,
    partner_resale_or_commercial_redistribution_authorized:false,
    raw_upstream_delivered:false,items:[],counts,availability_by_category
   }),{status:200,headers:{"content-type":"application/json"}});
  }
  if(url.endsWith("/website-derived-news-immediate")){
   return new Response(JSON.stringify({
    ok:true,page_offset:0,page_size:250,signals:[],
    has_more:false,next_offset:null
   }),{status:200,headers:{"content-type":"application/json"}});
  }
  assert.fail("unexpected or delayed legacy derived news endpoint: "+url);
 };
 const result=await verifySharedNewsLive(fetcher);
 assert.equal(result.same_journal_ids_verified,true);
 assert.deepEqual(result.counts,counts);
 assert.equal(result.original_release_delay_minutes,0);
 assert.equal(result.commercial_rights_verified,false);
 assert.equal(result.payments,0);
 assert.equal(urls.length,2);
 assert.equal(urls[1].endsWith("/website-derived-news-immediate"),true);
});

test("protected non-200 diagnosis differentiates Worker D1 503 overcap from 429 and never leaks upstream",async()=>{
 for(const [status,body,expectCode] of [
  [503,{error:"SHARED_NEWS_D1_JOURNAL_OVER_CAP"},"SHARED_NEWS_D1_JOURNAL_OVER_CAP"],
  [503,{error:"PRIVATE_DB_PASSWORD_AAA"},null],
  [429,{error:"SECRET_PARAMETER"},null]
 ]){
  let calls=0;
  await assert.rejects(()=>verifySharedNewsLive(async()=>{
   calls++;return Response.json(body,{status});
  }),e=>{
   const receipt=safeSharedNewsParityFailure(e);
   assert.equal(receipt.reason,"D1_SHARED_NEWS_HTTP_UNAVAILABLE");
   assert.equal(receipt.upstream_http_status,status);
   assert.equal(receipt.failed_public_route,"SOURCE_NEUTRAL_MACHINE");
   assert.equal(receipt.upstream_public_error_code,expectCode);
   assert.equal(receipt.raw_upstream_data_exposed,false);
   assert.equal(JSON.stringify(receipt).includes("PRIVATE_DB_PASSWORD_AAA"),false);
   assert.equal(JSON.stringify(receipt).includes("SECRET_PARAMETER"),false);
   return true;
  });
  assert.equal(calls,1,"never retry or amplify D1 queries on quota errors");
 }
});
test("diagnostic does not trust arbitrary error properties or expose attacker-supplied status",()=>{
 const e=Object.assign(new Error("D1_SHARED_NEWS_HTTP_UNAVAILABLE"),{
  safe_http_status:206,safe_route:"SECRET_TOKEN",safe_public_code:"sensitive"
 });
 const receipt=safeSharedNewsParityFailure(e);
 assert.equal(receipt.upstream_http_status,0);
 assert.equal(receipt.failed_public_route,null);
 assert.equal(receipt.upstream_public_error_code,null);
});
