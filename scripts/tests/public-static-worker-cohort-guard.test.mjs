import test from "node:test";
import assert from "node:assert/strict";
import {checkPublicStaticCohort,checkDailyPublicOfficialCohort,serveGuardedPublicStaticAsset}
 from "../../workers/public-finds-archive/src/index.mjs";
const now=Date.parse("2026-10-30T07:00:00.000Z");
const date=new Date(now-60_000).toISOString();
const old=new Date(now-2*60*60_000).toISOString();
const sample={id:"macro-1234abcd",category:"macro",
 published_at:"2026-10-29T12:00:00.000Z"};
const validLatest=()=>({ok:true,schema:"geomacro.website-derived-news-feed.v1",
 delivery_scope:"free_website_only",chargeable:false,scored:false,
 supabase_dependency:false,retention_hours:72,checked_at:date,signals:[sample]});
const validCoverage=()=>({schema:"geomacro.free-derived-archive-eligibility.v1",
 retention_hours:72,free_website_only:true,
 signed_or_scored:false,unverified_promoted:false,
 paid_customer_eligible:false,live_payment_authorized:false,d1_reads:0,
 checked_at:date,eligible_ids_sha256:"a".repeat(64)});
const validDaily=()=>({ok:true,schema:"geomacro.public-daily-official-finds.v1",
 generated_at:date,selection_window_days:30,source_window:"archived_original_release",
 official_only:true,independently_corrob_verified:false,
 chargeable:false,scored:false,source_urls_returned:false,
 mandatory_source_credits_preserved:true,signals:[{
 id:"macro-1234abcd",category:"macro",status:"official_release_observed_unscored",
 title:"Geomacro finds Federal Reserve issued FOMC inflation statement",
 date_precision:"exact",published_at:"2026-10-29T12:00:00.000Z",
 sources_credited:["Federal Reserve Board"],observed_release_count:1,
 same_event_corrob_verified:false,severity:null,
 }]});
const env=(latest=validLatest(),coverage=validCoverage(),daily=validDaily())=>({
 ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  if(path==="/latest.json")return Response.json(latest);
  if(path==="/coverage-72h.json")return Response.json(coverage);
  if(path==="/daily-highlights.json")return Response.json(daily);
  throw Error("UNEXPECTED_ASSET");
 }}
});
const req=path=>new Request("https://geomacro-public-finds-archive.example/"+path);
test("same build clocks and unchanged publisher timestamp serve exact public latest",async()=>{
 const x=validLatest(),e=env(x);
 const r=await serveGuardedPublicStaticAsset(req("latest.json"),e,now);
 assert.equal(r.status,200);
 assert.equal(r.headers.get("cache-control"),"no-store");
 assert.deepEqual(await r.json(),x);
 assert.equal(x.signals[0].published_at,sample.published_at);
});
test("coherent coverage also has source-safe no-store answer",async()=>{
 const c=validCoverage();
 const r=await serveGuardedPublicStaticAsset(req("coverage-72h.json"),env(validLatest(),c),now);
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),c);
});
test("stale or split clocks, rights promotion, and forged hash are rejected",async()=>{
 for(const [l,c] of [
  [{...validLatest(),checked_at:old},validCoverage()],
  [validLatest(),{...validCoverage(),checked_at:new Date(now-7*60*60_000).toISOString()}],
  [validLatest(),{...validCoverage(),paid_customer_eligible:true}],
  [validLatest(),{...validCoverage(),eligible_ids_sha256:"INVALID"}],
  [{...validLatest(),checked_at:new Date(now+3*60_000).toISOString()},validCoverage()],
 ]){
  assert.equal(checkPublicStaticCohort(l,c,now),false);
  const resp=await serveGuardedPublicStaticAsset(req("latest.json"),env(l,c),now);
  assert.equal(resp.status,503);
  assert.equal((await resp.json()).paid_eligible,false);
 }
});
test("ASSETS transport/malformed JSON fails closed without exposing internal bytes",async()=>{
 const e={ASSETS:{fetch:async()=>new Response("bad json",{status:200})}};
 const resp=await serveGuardedPublicStaticAsset(req("latest.json"),e,now);
 assert.equal(resp.status,503);
 assert.equal((await resp.json()).error,"PUBLIC_ARCHIVE_COHORT_UNVERIFIED");
});

test("daily official highlights are CORS-visible only with same static cohort and original clock",async()=>{
 const d=validDaily();
 assert.equal(checkDailyPublicOfficialCohort(d,validLatest(),now),true);
 const r=await serveGuardedPublicStaticAsset(req("daily-highlights.json"),env(),now);
 assert.equal(r.status,200);
 assert.equal(r.headers.get("access-control-allow-origin"),"*");
 assert.equal(r.headers.get("cache-control"),"no-store");
 assert.deepEqual(await r.json(),d);
});
test("daily rejects OSINT promotion, credit URLs, synthetic fresh time and split generations",async()=>{
 for(const d of [
 {...validDaily(),signals:[{...validDaily().signals[0],status:"osint_feed_observed_unverified"}]},
 {...validDaily(),signals:[{...validDaily().signals[0],sources_credited:["https://example.org/source"]}]},
 {...validDaily(),signals:[{...validDaily().signals[0],published_at:"2026-10-31T12:00:00Z"}]},
 {...validDaily(),generated_at:new Date(now-120_000).toISOString()},
 ]){
  assert.equal(checkDailyPublicOfficialCohort(d,validLatest(),now),false);
  const response=await serveGuardedPublicStaticAsset(req("daily-highlights.json"),env(validLatest(),validCoverage(),d),now);
  assert.equal(response.status,503);
  assert.equal((await response.json()).paid_eligible,false);
 }
});
