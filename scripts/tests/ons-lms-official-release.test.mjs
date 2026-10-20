import test from "node:test";
import assert from "node:assert/strict";
import {ONS_LMS_RELEASE_URL,inspectOnsLabourMarketRelease,observeOnsLabourMarketRelease}
 from "../lib/ons-lms-official-release.mjs";
const now=new Date("2026-10-20T10:00:00Z");
const page=(release="20 October 2026",next="17 November 2026")=>
  '<!doctype html><html><head><title>UK Office for National Statistics</title></head><body>'+
  '<main><h1>Labour market statistics time series</h1>'+
  '<p>Main labour market statistics time series data (large dataset).</p>'+
  '<p>Release date: '+release+'</p><p>Next release: '+next+'</p>'+
  '<p>Dataset ID: LMS</p><p>csv (11.7 MB) xlsx (10.2 MB)</p>'+
  '<section>Previous versions</section><p>15 September 2026 07:00</p></main></body></html>';
test("exact first-party UK ONS release day, not a macro observation or verified signed event",()=>{
 const u=new URL(ONS_LMS_RELEASE_URL);
 assert.equal(u.hostname,"www.ons.gov.uk");
 assert.ok(u.pathname.endsWith("/datasets/labourmarketstatistics/current"));
 const r=inspectOnsLabourMarketRelease(page(),now);
 assert.equal(r.country_iso3,"GBR");
 assert.equal(r.dataset_id,"LMS");
 assert.equal(r.source_native_release_day,"2026-10-20");
 assert.equal(r.publisher_announced_next_release_day,"2026-11-17");
 assert.equal(r.release_age_days,0);
 assert.equal(r.status,"FIRST_PARTY_DATASET_RELEASE_DATE_OBSERVED");
 assert.equal(r.native_month_or_rolling_quarter_observation_verified,false);
 assert.equal(r.observed_unemployment_value_verified,false);
 assert.equal(r.signed_current_macro_or_risk_event,false);
 assert.equal(r.payments,0);
 assert.doesNotMatch(JSON.stringify(r),/11\.7 MB|10\.2 MB/);
});
test("future, impossible, old, missing issuer and dataset ID remain unavailable",()=>{
 assert.throws(()=>inspectOnsLabourMarketRelease(page("21 October 2026"),now),/ONS_LMS_RELEASE_CLOCK_INVALID/);
 assert.throws(()=>inspectOnsLabourMarketRelease(page("31 February 2026"),now),/ONS_LMS_NATIVE_RELEASE_DATE_UNVERIFIED/);
 assert.throws(()=>inspectOnsLabourMarketRelease(page().replace("Dataset ID: LMS","Dataset ID: BAD"),now),/ONS_LMS_PUBLISHER_DATASET_UNVERIFIED/);
 assert.throws(()=>inspectOnsLabourMarketRelease("<html>Access denied</html>",now),/ONS_LMS_PUBLISHER_DATASET_UNVERIFIED/);
 const stale=inspectOnsLabourMarketRelease(page("15 July 2026"),now);
 assert.equal(stale.status,"FIRST_PARTY_DATASET_RELEASE_STALE");
});
test("HTML script content cannot manufacture the dataset identity or native release",()=>{
 const html=page().replace("Release date: 20 October 2026","Release date: unknown "+
   "<script type='application/json'>Release date: 20 October 2026</script>");
 assert.throws(()=>inspectOnsLabourMarketRelease(html,now),/ONS_LMS_NATIVE_RELEASE_DATE_UNVERIFIED/);
 const wrong=page().replace("Dataset ID: LMS","Dataset ID: OTHER "+
   "<script>Dataset ID: LMS</script\t data-hidden>");
 assert.throws(()=>inspectOnsLabourMarketRelease(wrong,now),/ONS_LMS_PUBLISHER_DATASET_UNVERIFIED/);
});
test("one bounded no-key HTTPS GET, reject denial and oversized response",async()=>{
 let calls=0;
 const r=await observeOnsLabourMarketRelease({now,fetchImpl:async(url,opts)=>{
   calls++;assert.equal(url,ONS_LMS_RELEASE_URL);
   assert.equal(opts.redirect,"error");return new Response(page());
 }});
 assert.equal(calls,1);assert.equal(r.source_native_release_day,"2026-10-20");
 await assert.rejects(()=>observeOnsLabourMarketRelease({now,fetchImpl:async()=>new Response("403",{status:403})}),/ONS_DENIED_OR_QUOTA/);
 await assert.rejects(()=>observeOnsLabourMarketRelease({now,fetchImpl:async()=>new Response("x",{headers:{"content-length":"700000"}})}),/ONS_BODY_LIMIT/);
});
