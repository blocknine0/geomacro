import test from "node:test";
import assert from "node:assert/strict";
import {probeUkrainePresidentialRss,UKR_PRESIDENT_ORIGINAL_RSS}
 from "../ops/probe-ukraine-presidential-rss-original.mjs";

const NOW = new Date("2026-10-29T17:00:00.000Z");
const news=(pubDate="Wed, 28 Oct 2026 20:00:00 GMT",
 title="Ukraine President discusses national security cooperation and diplomacy")=>
 `<?xml version="1.0"?><rss version="2.0"><channel><title>Official president news</title>
 <item><title>${title}</title><link>https://www.president.gov.ua/en/news/official-123</link>
 <pubDate>${pubDate}</pubDate><description>Official words are not redistributed</description></item></channel></rss>`;

test("one official first-party RSS original native-time geopolitical candidate, not paid output",async()=>{
 let requests=0;
 const fetchImpl=async(url,options)=>{
   requests++;
   assert.equal(url,UKR_PRESIDENT_ORIGINAL_RSS);
   assert.equal(options.method,"GET");
   assert.equal(options.redirect,"manual");
   return new Response(news(),{status:200,headers:{"content-type":"application/rss+xml"}});
 };
 const result=await probeUkrainePresidentialRss({now:NOW,fetchImpl});
 assert.equal(requests,1);
 assert.equal(result.status,"OBSERVED");
 assert.equal(result.native_dated_geopolitical_keyword_discovery_candidates,1);
 assert.equal(result.latest_issuer_item_native_publication_clock,"2026-10-28T20:00:00.000Z");
 for(const field of ["commercial_source_rights_approved","canonical_paid_module_verified",
  "independent_event_verification","issuer_country_is_event_country",
  "payment_authorized","signed_gro_or_risk_object_verified"])assert.equal(result[field],false);
 assert.equal(result.d1_writes,0);
 assert.equal(result.b2_requests,0);
 assert.equal(result.predge_modified,false);
 assert.equal(JSON.stringify(result).includes("Ukraine President discusses"),false);
 // Check the emitted receipt schema directly; never attempt to validate
 // URL origins by comparing a substring of an arbitrary URL.
 for(const field of ["source_url","article_url","feed_url","original_url",
   "headline","title","raw_body","body","text"]) {
   assert.equal(Object.hasOwn(result,field),false);
 }
});
test("official transport unavailable, denied and XML hostile content never grant revenue",async()=>{
 for(const response of [
   new Response("denied",{status:403}),
   new Response("limit",{status:429}),
   new Response("<html>not RSS</html>"),
   new Response(news().replace("<rss version=\"2.0\">","<!DOCTYPE evil><rss version=\"2.0\">")),
   new Response("x".repeat(193*1024)),
 ]){
   let calls=0;
   const result=await probeUkrainePresidentialRss({
     now:NOW,fetchImpl:async()=>{calls++;return response},
   });
   assert.equal(calls,1);
   assert.equal(result.native_dated_geopolitical_keyword_discovery_candidates,0);
   assert.equal(result.canonical_paid_module_verified,false);
   assert.equal(result.commercial_source_rights_approved,false);
   assert.equal(result.payment_authorized,false);
   assert.ok(["DENIED","UNAVAILABLE","MALFORMED"].includes(result.status));
 }
});
test("missing, stale or forged native date is not a geopolitics event or paid item",async()=>{
 for(const stamp of [
   "Wed, 28 Oct 2024 20:00:00 GMT",
   "Fri, 30 Oct 2026 20:00:00 GMT",
   "2026-10-28", "",
 ]){
   const rss=news(stamp);
   const result=await probeUkrainePresidentialRss({
     now:NOW,fetchImpl:async()=>new Response(rss),
   });
   assert.equal(result.native_dated_geopolitical_keyword_discovery_candidates,0);
   assert.equal(result.latest_issuer_item_native_publication_clock,null);
   assert.equal(result.payment_authorized,false);
 }
});
test("unrelated government speech is not fabricated as security event",async()=>{
 const result=await probeUkrainePresidentialRss({
   now:NOW,
   fetchImpl:async()=>new Response(news(undefined,
     "The president opens a cultural exhibition at the state library")),
 });
 assert.equal(result.native_dated_geopolitical_keyword_discovery_candidates,0);
 assert.equal(result.candidate_is_not_paid_intelligence,true);
});
