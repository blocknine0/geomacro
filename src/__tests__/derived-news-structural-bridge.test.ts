import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {buildDerivedNewsStructural} from "../lib/derived-news-structural-bridge";
import {COUNTRIES_195} from "../lib/canonical-country-registry-195";
import {countryFromDerivedGeography,countryFromDerivedHeadline,observed195x3Coverage,observedPublicFinds195x3Coverage} from "../lib/derived-news-country-coverage-195";
import {derivedNewsStructuralResponse,structuralNewsAvailability} from "../lib/derived-news-structural-response.server";
import {fetchAllDerivedNews} from "../lib/public-derived-news-client";
import {readDerivedStories} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import type {StatelessIntelligenceSignal} from "../lib/stateless-intelligence-model";

const NOW=Date.parse("2026-10-18T18:00:00.000Z");
const domains=["geopolitics","macro","rare_earth"] as const;
const topics=["foreign policy","monetary policy","rare-earth supply"];
const story=(index:number):StatelessIntelligenceSignal=>{
  const category=domains[index%3];
  return {id:category+"-"+index.toString(16).padStart(8,"0"),category,
    title:"Geomacro finds original official policy change in the observed sector",
    what_changed:"An official publisher released a new statement about a policy development in the observed sector.",
    why_it_matters:"This release may affect regional operating assumptions but actual consequences require independent confirmation.",
    topic:topics[index%3],development_type:"policy update",geography:null,
    published_at:"2026-10-18T16:00:00.000Z",date_precision:"exact",
    observed_release_count:1,sources_credited:[],
    status:"official_release_observed_unscored",same_event_corrob_verified:false,severity:null};
};
const feed=(signals:unknown[],offset=0,has_more=false)=>({
  ok:true,schema:"geomacro.website-derived-news-feed.v1",checked_at:new Date(NOW).toISOString(),
  original_release_delay_minutes:0,retention_days:3,retention_hours:72,
  delivery_scope:"free_website_only",page_offset:offset,page_size:250,
  has_more,next_offset:has_more?offset+250:null,signals,
});
describe("source-neutral three-domain 72h news -> structural output bridge",()=>{
 it("maps each distinct eligible first-party derived observation, never promotes unreviewed evidence",()=>{
   const rows=buildDerivedNewsStructural(Array.from({length:60},(_,i)=>story(i)),NOW);
   expect(rows).toHaveLength(60);
   expect(new Set(rows.map(r=>r.id)).size).toBe(60);
   expect(new Set(rows.map(r=>r.category))).toEqual(new Set(domains));
   for(const item of rows){
     expect(item.schema).toBe("geomacro.derived-news-structural.v1");
     expect(item.observed_change).toContain("official publisher");
     expect(item.event_detail_verified).toBe(false);
     expect(item.country_subject_verified).toBe(false);
     expect(item.independent_same_event_verified).toBe(false);
     expect(item.commercial_derived_rights_verified).toBe(false);
     expect(item.signed_product_verified).toBe(false);
     expect(item.payable).toBe(false);
     expect(item.raw_upstream_delivered).toBe(false);
   }
   expect(JSON.stringify(rows)).not.toMatch(/(?:https?:\/\/|publisher_id|source_url|original_title|raw_html)/iu);
 });
 it("rejects attribution-hidden releases and stale, invalid, future, scored and forged rows",()=>{
   const good=story(4);
   const bad=[
     {...story(3),sources_credited:["Attribution required"]},
     {...story(5),published_at:"2026-10-10T12:00:00.000Z"},
     {...story(6),published_at:"invalid"},
     {...story(7),published_at:"2026-10-19T00:00:00.000Z"},
     {...story(8),severity:80},
     {...story(9),source_url:"https://upstream.invalid"},
   ];
   expect(buildDerivedNewsStructural([good,...bad] as StatelessIntelligenceSignal[],NOW))
     .toHaveLength(1);
   expect(buildDerivedNewsStructural([good,good],NOW)).toHaveLength(1);
   expect(()=>buildDerivedNewsStructural([good,{...good,topic:"foreign policy"}],NOW))
     .toThrow("DERIVED_NEWS_ID_COLLISION");
 });
 it("keeps paged D1 reader internal but serves public structural data from static latest.json",async()=>{
   const signals=Array.from({length:520},(_,i)=>story(i));
   const internalMock=vi.fn(async (input:RequestInfo|URL)=>{
     const url=new URL(String(input));
     const offset=Number(url.searchParams.get("offset")||0);
     const batch=signals.slice(offset,offset+250);
     return Response.json(feed(batch,offset,offset+250<signals.length));
   });
   const all=await fetchAllDerivedNews(internalMock as typeof fetch,NOW);
   expect(all).toHaveLength(520);
   // The first call probes the new bundle route; the explicit old feed schema
   // then exercises the one-release legacy compatibility reader.
   expect(internalMock).toHaveBeenCalledTimes(4);
   expect(String(internalMock.mock.calls[0]?.[0])).toContain("website-derived-news-bundle");
   const mock=vi.fn(async (input:RequestInfo|URL)=>{
     expect(String(input)).toBe("https://geomacro-public-finds-archive.daspallab202391.workers.dev/latest.json");
     return Response.json(feed(signals.slice(0,250)));
   });
   const r=await derivedNewsStructuralResponse(
     new Request("https://geomacro.live/api/v1/intelligence/query?view=structural-72h&domain=macro"),
     mock as typeof fetch,NOW);
   expect(r.status).toBe(200);
   const body=await r.json();
   expect(body.items).toHaveLength(83);
   expect(body.counts).toEqual({geopolitics:84,macro:83,rare_earth:83});
   expect(body.generated_at).toBe(new Date(NOW).toISOString());
   expect(Object.keys(body.availability_by_category).sort()).toEqual([...domains].sort());
   for(const category of domains){
     expect(body.availability_by_category[category].status).toBe("RECENT_OFFICIAL_RELEASE_IN_24H");
     expect(body.availability_by_category[category].real_time_commercial_event_certified).toBe(false);
     expect(body.availability_by_category[category].gaps_may_exist).toBe(true);
   }
   expect(body.chargeable).toBe(false);
   expect(body.exhaustive_all_global_sources).toBe(false);
   expect(body.source_scope).toBe("ELIGIBLE_RELEASES_PRESENT_IN_PERMANENT_STATIC_ARCHIVE_ROLLING_LATEST_250");
   expect(mock).toHaveBeenCalledTimes(1);
   expect(JSON.stringify(body)).not.toContain("source_url");
 });
 it("routes the exact 195 countries × 3 categories but never claims 585 populated news cells",()=>{
   const candidate=[
     {...story(0),geography:"India"},
     {...story(1),geography:"Ukraine"},
     {...story(2),geography:"State of Palestine"},
     {...story(3),geography:"Congo"},
   ];
   const rows=buildDerivedNewsStructural(candidate,NOW);
   const observed=observed195x3Coverage(rows,NOW);
   expect(COUNTRIES_195).toHaveLength(195);
   expect(observed.country_count).toBe(195);
   expect(observed.category_count).toBe(3);
   expect(observed.total_country_category_cells).toBe(585);
   expect(observed.cells).toHaveLength(585);
   expect(observed.unassigned_or_regional_derived_records_72h).toBe(1);
   expect(observed.cells.filter(c=>c.observed_derived_records_72h>0)).toHaveLength(3);
   expect(observed.cells.find(c=>c.country_iso3==="IND"&&c.category==="geopolitics"))
     .toMatchObject({status:"DERIVED_OFFICIAL_COUNTRY_MENTION_OBSERVED_UNVERIFIED",
       observed_derived_records_72h:1,country_subject_verified:false,
       independent_same_event_verified:false,commercial_rights_verified:false,
       all_news_exhaustive:false,paid_delivery_eligible:false});
   expect(observed.cells.find(c=>c.country_iso3==="PSE"&&c.category==="rare_earth")
     ?.observed_derived_records_72h).toBe(1);
   expect(observed.cells.find(c=>c.country_iso3==="USA"&&c.category==="macro"))
     .toMatchObject({status:"NO_MATCHING_COUNTRY_MENTION_IN_ROLLING_STATIC_ARCHIVE",
       observed_derived_records_72h:0,all_news_exhaustive:false});
   expect(observed.not_observed_means_no_news).toBe(false);
   expect(observed.exhaustive_country_news_coverage_verified).toBe(false);
   expect(observed.raw_upstream_delivered).toBe(false);
   expect(observed.payment_required_now).toBe(false);
   expect(observed.chargeable).toBe(false);
   expect(countryFromDerivedGeography("Congo")).toBeNull();
   expect(countryFromDerivedGeography("India-based statement")).toBeNull();
   expect(countryFromDerivedGeography("news.un.org")).toBeNull();
   expect(countryFromDerivedGeography("Türkiye")).toBe("TUR");
   expect(countryFromDerivedGeography("West Bank")).toBe("PSE");
   expect(countryFromDerivedGeography("United States")).toBe("USA");
 });
 it("routes public Finds into counts-only 195x3 cells without exposing headlines or publishers",()=>{
   const brazil={...story(0),id:"geopolitics-deadbeef",
     title:"Geomacro finds Brazil issued a new border security notice",
     category:"geopolitics" as const,geography:null,topic:"geopolitical security"};
   const india={...story(1),id:"macro-cafefeed",
     title:"Geomacro finds India reported new inflation figures",
     category:"macro" as const,geography:null,topic:"inflation and prices"};
   const canada={...story(2),id:"rare_earth-deadbeef",
     title:"Geomacro finds Canada announced a critical mineral processing plan",
     category:"rare_earth" as const,geography:null,
     status:"osint_feed_observed_unverified" as const,
     development_type:"unverified OSINT feed observation",
     sources_credited:["Monitored feed: news.google.com (aggregator; original publisher not verified)"]};
   const regional={...story(3),id:"geopolitics-cafebabe",
     title:"Geomacro finds China signed a new agreement with India",
     category:"geopolitics" as const,geography:null};
   const output=observedPublicFinds195x3Coverage([brazil,india,canada,regional],NOW);
   expect(output.schema).toBe("geomacro.195x3-public-finds-coverage.v2");
   expect(output.country_count).toBe(195);
   expect(output.total_country_category_cells).toBe(585);
   expect(output.returned_cells).toBe(585);
   expect(output.source_neutral_derived_records_in_public_archive_latest_250).toBe(4);
   expect(output.unassigned_or_regional_derived_records_72h).toBe(1);
   expect(output.cells.find(c=>c.country_iso3==="BRA"&&c.category==="geopolitics"))
     .toMatchObject({status:"DERIVED_COUNTRY_MENTION_OBSERVED_UNVERIFIED",
       observed_derived_records_72h:1,country_subject_verified:false,commercial_rights_verified:false});
   expect(output.cells.find(c=>c.country_iso3==="IND"&&c.category==="macro")
     ?.observed_derived_records_72h).toBe(1);
   expect(output.cells.find(c=>c.country_iso3==="CAN"&&c.category==="rare_earth")
     ?.observed_derived_records_72h).toBe(1);
   expect(output.cells.find(c=>c.country_iso3==="CHN"&&c.category==="geopolitics")
     ?.observed_derived_records_72h).toBe(0);
   expect(output.not_observed_means_no_news).toBe(false);
   expect(output.exhaustive_country_news_coverage_verified).toBe(false);
   expect(output.scored).toBe(false);
   expect(output.signed).toBe(false);
   expect(output.chargeable).toBe(false);
   const serialized=JSON.stringify(output);
   for(const privateOrRaw of [
     "Brazil issued a new border security notice",
     "India reported new inflation figures",
     "news.google.com",
     "sources_credited",
     "source_url",
   ])expect(serialized).not.toContain(privateOrRaw);
   expect(countryFromDerivedHeadline("Geomacro finds Brazil issued a new border security notice - Reuters")).toBe("BRA");
   expect(countryFromDerivedHeadline("Geomacro finds China signed a new agreement with India")).toBeNull();
   expect(countryFromDerivedHeadline("Geomacro finds China Daily issued a regional update")).toBeNull();
 });
 it("serves country-specific articles and 585-cell mention coverage from static archive without D1",async()=>{
   const rows=[
     {...story(0),geography:"India"},
     {...story(1),geography:"Ukraine"},
     {...story(2),geography:"State of Palestine"},
     {...story(3),geography:null},
   ];
   const mock=vi.fn(async(input:RequestInfo|URL)=>{
     expect(String(input)).toBe("https://geomacro-public-finds-archive.daspallab202391.workers.dev/latest.json");
     return Response.json(feed(rows));
   });
   const path="https://geomacro.live/api/v1/intelligence/query";
   const scoped=await derivedNewsStructuralResponse(new Request(
     path+"?view=structural-72h&country=IND"),mock as typeof fetch,NOW);
   expect(scoped.status).toBe(200);
   const doc=await scoped.json();
   expect(doc.items).toHaveLength(1);
   expect(doc.items[0].geography_mentioned).toBe("India");
   expect(doc.country).toMatchObject({iso3:"IND",country_subject_verified:false,
     all_news_exhaustive:false,no_matching_rows_does_not_mean_no_news:true});
   expect(doc.counts).toEqual({geopolitics:1,macro:0,rare_earth:0});
   const matrix=await derivedNewsStructuralResponse(new Request(
     path+"?view=country-coverage-195x3"),mock as typeof fetch,NOW);
   expect(matrix.status).toBe(200);
   const m=await matrix.json();
   expect(m.cells).toHaveLength(585);
   expect(m.total_country_category_cells).toBe(585);
   const one=await derivedNewsStructuralResponse(new Request(
     path+"?view=country-coverage-195x3&country=IND&domain=macro"),
     mock as typeof fetch,NOW);
   expect((await one.json()).cells).toMatchObject([{country_iso3:"IND",
     category:"macro",observed_derived_records_72h:0,all_news_exhaustive:false}]);
   const reusable=await derivedNewsStructuralResponse(new Request(
     path+"?view=reusable-news-json"),mock as typeof fetch,NOW);
   expect(reusable.status).toBe(200);
   const reusableBody=await reusable.json();
   expect(reusableBody.source_scope).toBe("PERMANENT_STATIC_ARCHIVE_ROLLING_LATEST_250");
   expect(reusableBody.registered_source_reader_state).toBe("NOT_QUERIED_PUBLIC_READ_PATH_IS_STATIC_ONLY");
   expect(mock).toHaveBeenCalledTimes(4);
   expect(mock.mock.calls.every(([input])=>String(input)==="https://geomacro-public-finds-archive.daspallab202391.workers.dev/latest.json")).toBe(true);
   for(const prohibited of ["https://","source_id","source_url","raw_html","publisher_name"])
     expect(JSON.stringify(m)).not.toContain(prohibited);
   expect(JSON.stringify(doc)).not.toContain("raw_payload");
   for(const query of ["country=ZZZ","country=ind","country=USA&country=IND",
     "country=","view=structural-72h&country=IND&country=USA",
     "domain=macro&domain=rare_earth"]){
      const url=query.startsWith("view=")?path+"?"+query:
        path+"?view=country-coverage-195x3&"+query;
      const resp=await derivedNewsStructuralResponse(new Request(url),mock as typeof fetch,NOW);
      expect(resp.status).toBe(400);
   }
 });
 it("keeps a stable 3-category status even when no official release is qualified",async()=>{
   const f=vi.fn(async(input:RequestInfo|URL)=>{
     expect(String(input)).toBe("https://geomacro-public-finds-archive.daspallab202391.workers.dev/latest.json");
     return Response.json(feed([],0,false));
   });
   const result=await derivedNewsStructuralResponse(new Request(
     "https://geomacro.live/api/v1/intelligence/query?view=structural-72h"
   ),f as typeof fetch,NOW);
   expect(result.status).toBe(200);
   const data=await result.json();
   expect(data.items).toEqual([]);
   expect(data.counts).toEqual({geopolitics:0,macro:0,rare_earth:0});
   for(const category of domains){
     expect(data.availability_by_category[category]).toMatchObject({
       status:"NO_QUALIFIED_RELEASE_IN_72H",
       latest_original_published_at:null,
       observed_derived_records_24h:0,
       observed_derived_records_72h:0,
       producer_run_freshness_verified:false,
       real_time_commercial_event_certified:false,
     });
   }
   expect(structuralNewsAvailability([],NOW)).toEqual(data.availability_by_category);
   expect(data.payment_required_now).toBe(false);
   expect(data.chargeable).toBe(false);
 });

 it("fails closed on broken cursor, duplicate IDs, forged extra source metadata and unpaged old Workers",async()=>{
   const cases=[
     feed([story(0)],0,true),
     {...feed([story(0)]),page_offset:250},
     {...feed([story(0)]),page_size:600},
     {...feed([story(0)]),has_more:"yes"},
     {...feed([story(0)]),signals:[{...story(0),raw_article:"bad"}]},
   ];
   for(const item of cases.slice(0,4)){
     const f=vi.fn(async()=>Response.json(item));
     await expect(fetchAllDerivedNews(f as typeof fetch,NOW)).rejects.toThrow();
   }
   const old=vi.fn(async(input:RequestInfo|URL)=>{
     expect(String(input)).toBe("https://geomacro-public-finds-archive.daspallab202391.workers.dev/latest.json");
     return new Response("unavailable",{status:503});
   });
   const r=await derivedNewsStructuralResponse(
     new Request("https://geomacro.live/api/v1/intelligence/query?view=structural-72h"),
     old as typeof fetch,NOW);
   expect(r.status).toBe(503);
   for(const invalid of ["?view=structural-72h&domain=other",
       "?view=structural-72h&view=structural-72h","?view=structural-72h&payment=1"]){
     const result=await derivedNewsStructuralResponse(new Request(
       "https://geomacro.live/api/v1/intelligence/query"+invalid),old as typeof fetch,NOW);
     expect(result.status).toBe(400);
   }
 });
 it("keeps old D1 reader compatible and exposes strict 250/500 pages",async()=>{
   const signals=Array.from({length:520},(_,i)=>story(i));
   const env={DB:{prepare:()=>({bind:(_a:string,_b:string,offset=0)=>({
     all:async()=>({results:signals.slice(offset,offset+251).map(s=>({story_json:JSON.stringify(s)}))}),
   })})}};
   const page0=await (await readDerivedStories(env,NOW)).json();
   const page250=await (await readDerivedStories(env,NOW,250)).json();
   const page500=await (await readDerivedStories(env,NOW,500)).json();
   expect([page0.signals.length,page250.signals.length,page500.signals.length])
     .toEqual([250,250,20]);
   expect([page0.has_more,page250.has_more,page500.has_more]).toEqual([true,true,false]);
   expect([page0.next_offset,page250.next_offset,page500.next_offset]).toEqual([250,500,null]);
   expect((await readDerivedStories(env,NOW,1)).status).toBe(400);
 });
 it("uses one source pipeline, idempotent bounded D1 batches and the existing canonical paid safety gate",()=>{
   const source=readFileSync("src/lib/stateless-public-intelligence.server.ts","utf8");
   const publish=readFileSync("scripts/ops/publish-website-derived-news.ts","utf8");
   const route=readFileSync("src/routes/api.v1.intelligence.query.ts","utf8");
   const paid=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
   expect(source).toContain("deriveStatelessSignals(originalCandidates, now,{maxSignals})");
   expect(route).toContain('"country-coverage-195x3"');
   expect(publish).toContain("privateOriginals.push(...candidates),200");
   expect(publish).toContain("prepareDerivedNewsBatches(eligible)");
   expect(route).toContain("derivedNewsStructuralResponse(request)");
   expect(paid).toContain("auto_ingest_72h_drafts_commercially_eligible:false");
   expect(paid).toContain("const finalConfig = resolveEligibleCoinbaseCapabilityConfig");
 });
});
