import test from "node:test";
import assert from "node:assert/strict";
import {inspectSanctionsListing,observeOfficialSanctionsListings} from "../lib/official-sanctions-listings-observer.mjs";
const now=new Date("2026-10-29T16:00:00Z");
const ofac=`<html><main><h1>Sanctions List Updates</h1>
<div class="views-row"><a href="/recent-actions/20261028">North Korea Designations</a>
<span>October 28, 2026</span></div></main></html>`;
const unsc=`<html><main><h1>List of updates to the UNSC Consolidated List</h1>
<table><tr><td>15/10/2026</td><td>1267</td><td>QDi.082</td><td>Amendment</td><td>3</td></tr>
<tr><td>28/10/2026</td><td>1518</td><td>IQe.200</td><td>Delisting</td><td>1</td></tr></table></main></html>`;
test("visible official date near OFAC notice is a listing lead not event verification",()=>{
 const r=inspectSanctionsListing(ofac,"OFAC_RECENT_ACTIONS_HTML",{now});
 assert.equal(r.source_native_listing_date_candidates,1);
 assert.equal(r.latest_candidate_date,"2026-10-28");
 assert.equal(r.original_article_page_date_verified,false);
 assert.equal(r.signed_or_commercial_event_verified,false);
});
test("UNSC table date requires exact source-native row not page updated footer",()=>{
 const r=inspectSanctionsListing(unsc,"UNSC_LIST_UPDATES_HTML",{now});
 assert.equal(r.source_native_listing_date_candidates,2);
 assert.equal(r.latest_candidate_date,"2026-10-28");
 const fake='<h1>List of updates to the UNSC Consolidated List</h1> Updated date: 28 Oct 2026';
 assert.equal(inspectSanctionsListing(fake,"UNSC_LIST_UPDATES_HTML",{now}).source_native_listing_date_candidates,0);
});
test("OFAC URL-based digits without visible date cannot qualify",()=>{
 const r=inspectSanctionsListing(ofac.replace("October 28, 2026",""),"OFAC_RECENT_ACTIONS_HTML",{now});
 assert.equal(r.source_native_listing_date_candidates,0);
});
test("OFAC RSS retirement never invokes old RSS endpoint and each source obeys bounded GET",async()=>{
 const urls=[];
 const got=await observeOfficialSanctionsListings({now,fetchImpl:async(url,init)=>{
   urls.push(url);assert.equal(init.method,"GET");assert.equal(init.redirect,"error");
   return new Response(url.includes("ofac.")?ofac:unsc,{status:200,headers:{"content-type":"text/html"}});
 }});
 assert.equal(urls.length,2);
 assert.ok(urls.every(x=>!x.includes(".rss")&&!x.includes("/feed/")));
 assert.equal(got.reachable_sources,2);
 assert.equal(got.fully_qualified_event_count,0);
 assert.equal(got.applies_to_country_category_cells_verified,0);
 assert.equal(got.payments,0);
});
test("403/429 are recorded without retry or access bypass; parser remains safe",async()=>{
 let n=0;
 const got=await observeOfficialSanctionsListings({now,fetchImpl:async(url)=>{
   n++;return new Response("denied",{status:url.includes("ofac.")?403:429});
 }});
 assert.equal(n,2);
 assert.equal(got.sources[0].status,"ACCESS_DENIED_NO_BYPASS");
 assert.equal(got.sources[1].status,"RATE_LIMITED_NO_RETRY");
 assert.equal(got.reachable_sources,0);
 assert.equal(got.paid_delivery_eligible,undefined);
});
test("original-page license/rights proof never inferred from healthy listing",async()=>{
 const got=await observeOfficialSanctionsListings({now,fetchImpl:async(url)=>new Response(url.includes("ofac.")?ofac:unsc,{
   status:200,headers:{"content-type":"text/html"}
 })});
 assert.ok(got.sources.every(s=>s.commercial_rights_verified===false &&
  s.original_article_page_date_verified===false &&
  s.independent_same_event_confirmation===false &&
  s.paid_delivery_eligible===false));
});

test("Hourly production path checks OFAC only; blocked UNSC is not aggressively repeated",async()=>{
 const urls=[];
 const got=await observeOfficialSanctionsListings({now,onlySourceId:"ofac_sanctions_list_updates",
   fetchImpl:async(url)=>{urls.push(url);return new Response(ofac,{status:200,headers:{"content-type":"text/html"}});}
 });
 assert.equal(urls.length,1);
 assert.equal(got.source_count,1);
 assert.equal(got.reachable_sources,1);
 assert.equal(got.sources[0].id,"ofac_sanctions_list_updates");
 await assert.rejects(()=>observeOfficialSanctionsListings({now,
  onlySourceId:"https://evil.test/redirect",fetchImpl:async()=>{throw Error("NETWORK_NOT_ALLOWED");}}),
  /SANCTIONS_LISTING_SOURCE_ID_NOT_ALLOWED/);
 assert.equal(urls.length,1);
});
