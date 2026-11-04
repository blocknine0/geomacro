import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {HOT50_COUNTRY_SET} from "./hot-50-country-watch.mjs";
import {hot50GoogleCategorySource,hot50CountryCategoryDiscoveryUnits,
 hot50GoogleSourceCadence} from "./hot-50-google-news-category.mjs";
import {hot50NewOfficialOriginalFeeds} from "./hot-50-new-official-original-feeds.mjs";
import {hot50FourLaneSourceCrosswalk,observedHot50FourLaneSourceState}
 from "./hot-50-four-lane-source-crosswalk.mjs";
import {orderHot50PrivateFetchJobs} from "./hot-50-private-fetch-priority.mjs";
import {privateOsintRuntimeSources,rotatingPrivateCountryDiscoverySources}
 from "./private-osint-country-rotation.mjs";

const at=new Date("2026-11-04T00:00:00Z");
const tick=15*60_000;
const domains=["geopolitics","macro","rare_earth"];
test("full Hot-50 crosswalk reflects 50 local source countries, disabled Telegram, 3 Google categories",()=>{
 const {inventory,snapshot}=hot50FourLaneSourceCrosswalk();
 assert.equal(inventory.countries,50);
 assert.equal(inventory.pinned_direct_feed_country_entries,124);
 assert.equal(inventory.telegram_discovery_candidates,139);
 assert.equal(inventory.telegram_authorized_active,0);
 assert.equal(inventory.google_news_category_variants,150);
 assert.equal(new Set(snapshot.countries.map(x=>x.country_iso3)).size,50);
 assert.ok(snapshot.countries.every(x=>x.direct_news_osint_feeds.length>0));
 assert.ok(snapshot.countries.flatMap(x=>x.telegram_discovery_candidates)
   .every(x=>!x.publisher_authorized&&x.activation_status==="DISABLED"));
});
test("all 150 exact Google country/category URLs are unique and non-original indexes",()=>{
 const u=new Set();
 for(const country of COUNTRIES_195.filter(c=>HOT50_COUNTRY_SET.has(c.iso3)))
  for(const cat of domains){
   const src=hot50GoogleCategorySource(country,cat);
   assert.ok(src.url.startsWith("https://news.google.com/rss/search?"));
   assert.ok(new URL(src.url).searchParams.get("q").includes("when:1d"));
   assert.ok(src.id.endsWith("_"+cat));
   assert.equal(src.commercial_eligible,false);
   assert.equal(src.original_publisher_verified,false);
   u.add(src.url);
  }
 assert.equal(u.size,150);
});
test("25 country-index requests per 15m reach 50x3 plus 145 country-wide in 12 nominal slots",()=>{
 const keys=new Set();
 for(let n=0;n<12;n++){
  const units=hot50CountryCategoryDiscoveryUnits(
   new Date(at.getTime()+n*tick),COUNTRIES_195,25);
  for(const row of units)keys.add(row.country.iso3+":"+String(row.category));
  assert.ok(units.length<=25);
 }
 assert.equal(keys.size,295);
 assert.ok(COUNTRIES_195.filter(c=>HOT50_COUNTRY_SET.has(c.iso3))
  .every(c=>domains.every(d=>keys.has(c.iso3+":"+d))));
 assert.ok(COUNTRIES_195.filter(c=>!HOT50_COUNTRY_SET.has(c.iso3))
  .every(c=>keys.has(c.iso3+":null")));
 const cadence=hot50GoogleSourceCadence(25);
 assert.equal(cadence.complete_hot50_3domain_cycle_minutes,180);
 assert.equal(cadence.under_3h_nominal,true);
 assert.equal(cadence.runtime_guaranteed,false);
});
test("8 requests preserve all 195 country paths, report honest slower three-category coverage",()=>{
 const seen=new Set();
 for(let n=0;n<32;n++)
  for(const unit of hot50CountryCategoryDiscoveryUnits(
   new Date(at.getTime()+n*tick),COUNTRIES_195,8))
   seen.add(unit.country.iso3);
 assert.equal(seen.size,195);
 assert.equal(hot50GoogleSourceCadence(8).under_3h_nominal,false);
 assert.equal(hot50GoogleSourceCadence(8).combined_three_domain_query_fallback_active,true);
 assert.equal(hot50GoogleSourceCadence(8).complete_hot50_3domain_cycle_minutes,2250);
 assert.equal(hot50GoogleSourceCadence(8).combined_hot50_country_cycle_minutes,120);
 assert.equal(hot50GoogleSourceCadence(8).focused_google_category_slots_per_tick,1);
 assert.equal(hot50GoogleSourceCadence(0).complete_hot50_3domain_cycle_minutes,null);
});
test("actual producer uses category-specific Google variants, no additional requests or commercial claims",()=>{
 const out=rotatingPrivateCountryDiscoverySources(at,COUNTRIES_195,25,{hot50Priority:true});
 assert.ok(out.some(x=>x.google_news_category_specific));
 assert.ok(out.every(x=>x.private_discovery_index_only===true&&
  x.index_timestamp_not_original_page_clock===true&&
  x.commercial_eligible===false&&x.publicly_deliverable===false));
 assert.equal(new Set(out.map(x=>x.url)).size,out.length);
 const reg=privateOsintRuntimeSources(at,undefined,COUNTRIES_195,{includeLocalGapLane:true});
 assert.ok(reg.length<=512);
 assert.equal(new Set(reg.map(x=>x.url)).size,reg.length);
 assert.ok(reg.some(x=>x.private_discovery_index_only===true&&
  HOT50_COUNTRY_SET.has(x.discovery_country_iso3)));
 // Small budgets preserve combined all-domain country searches and use at
 // most one of their old GET slots for an additional focused query.
 assert.equal(reg.filter(x=>x.google_news_category_specific===true).length,1);
 assert.ok(reg.some(x=>x.id==="private_hot50_can_gac_newsreleases"));
 assert.ok(reg.some(x=>x.id==="private_hot50_can_gac_statements"));
});
test("two official Canada sources are first-party Atom candidates, never authorized by registration",()=>{
 const feeds=hot50NewOfficialOriginalFeeds();
 assert.deepEqual(new Set(feeds.map(x=>x.id)),
  new Set(["private_hot50_can_gac_newsreleases","private_hot50_can_gac_statements"]));
 assert.ok(feeds.every(x=>x.url.startsWith("https://api.io.canada.ca/")&&
  x.activation_state==="RUNTIME_PROBE_REQUIRED"&&
  x.publisher_native_dates_required===true&&
  x.transport_verified_at_registration===false&&
  x.commercial_eligible===false));
});
test("priority changes fetch order, never changes source identities, GET count or dedupe keys",()=>{
 const specs=[
  {url:"https://news.google.com/rss/search?q=test",private_discovery_index_only:true},
  {url:"https://abc.example.com/feed",publisher_country_iso3:"USA"},
  {url:"https://xyz.example.com/feed",publisher_country_iso3:"AFG"},
  {url:"https://api.io.canada.ca/io-server/gc/news/en/v2",private_hot50_original_candidate:true},
 ];
 const jobs=specs.map((source,index)=>({source,index,host:new URL(source.url).hostname}));
 const result=orderHot50PrivateFetchJobs(jobs);
 assert.deepEqual(result.map(x=>x.index),[3,1,2,0]);
 assert.equal(new Set(result.map(x=>x.index)).size,jobs.length);
 assert.deepEqual(jobs.map(x=>x.index),[0,1,2,3]);
});
test("live source state counts only real observed feed health, never fabricates Telegram or verified events",()=>{
 const {snapshot}=hot50FourLaneSourceCrosswalk();
 const feed=snapshot.countries[0].direct_news_osint_feeds[0];
 const live={id:feed.id,url:feed.url,categories:feed.categories};
 const source_ref=createHash("sha256").update([live.id,live.url,live.categories[0]].join("\n")).digest("hex");
 const status=observedHot50FourLaneSourceState([live],
  [{source_ref,state:"OBSERVED"}],[{country_iso3:"USA"}]);
 assert.equal(status.direct_configured_in_current_poll,1);
 assert.equal(status.direct_healthy_in_current_poll,1);
 assert.equal(status.countries_with_title_matched_items_current_batch,1);
 assert.equal(status.telegram_message_ingestion_activated,false);
 assert.equal(status.originating_articles_independently_verified,false);
 assert.equal(status.d1_b2_parity_proven_by_this_metric,false);
});
