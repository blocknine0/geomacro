import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {inspectObservedCountryGrid,verifyProductionObserved195x3}
 from "../ops/verify-production-observed-195x3.mjs";
const now=new Date("2026-10-22T12:00:00.000Z");
const reg=readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
const names=/const COUNTRY_ROWS=`([^`]+)`/u.exec(reg)?.[1].trim().split("\n").map(s=>{
 const parts=s.split("|");
 return {iso3:parts[0],name:parts[2]};
});
assert.equal(names?.length,195);
function fixture(events=[]){
 const categories=["geopolitics","macro","rare_earth"];
 const rows=names.flatMap(country=>categories.map(category=>{
   const observed=events.find(e=>e.country_iso3===country.iso3&&e.category===category);
   const count=observed?.count??0;
   return {country_iso3:country.iso3,country_name:country.name,category,
    status:count?"DERIVED_COUNTRY_MENTION_OBSERVED_UNVERIFIED":
      "NO_MATCHING_COUNTRY_MENTION_IN_ROLLING_STATIC_ARCHIVE",
    observed_derived_records_72h:count,classified_topic_releases_72h:count,
    unclassified_candidates_72h:0,
    latest_original_published_at:count?"2026-10-22T10:00:00.000Z":null,
    country_subject_verified:false,local_original_publisher_verified:false,
    independent_same_event_verified:false,commercial_rights_verified:false,
    all_news_exhaustive:false,paid_delivery_eligible:false};
 }));
 const totals={geopolitics:0,macro:0,rare_earth:0};
 for(const row of rows)totals[row.category]+=row.observed_derived_records_72h;
 return {schema:"geomacro.195x3-public-finds-coverage.v2",
   country_count:195,category_count:3,total_country_category_cells:585,
   returned_cells:585,coverage_scope:"OBSERVED_PUBLIC_GEOMACRO_FINDS_IN_PERMANENT_STATIC_ARCHIVE_ROLLING_LATEST_250",
   country_routing_basis:"EXACT_PUBLIC_TITLE_OR_GEOGRAPHY_MENTION_ONLY",
   not_observed_means_no_news:false,
   exhaustive_country_news_coverage_verified:false,
   producer_country_original_coverage_verified:false,
   original_release_delay_minutes:0,retention_hours:72,
   generated_at:now.toISOString(),
   source_neutral_derived_records_in_public_archive_latest_250:rows.reduce((a,r)=>a+r.observed_derived_records_72h,0),
   unassigned_or_regional_derived_records_72h:0,
   observed_derived_records_by_category:totals,payment_required_now:false,
   chargeable:false,scored:false,signed:false,raw_upstream_delivered:false,
   cells:rows};
}
test("checks genuine full 585-country-category observed journal without pretending signed or 585 news cells",()=>{
 const doc=fixture([{country_iso3:"IND",category:"geopolitics",count:1},
    {country_iso3:"CHL",category:"rare_earth",count:2}]);
 const accepted=inspectObservedCountryGrid(doc,now);
 assert.equal(accepted.country_routes,195);
 assert.equal(accepted.returned_cells,585);
 assert.equal(accepted.observed_country_category_cells,2);
 assert.equal(accepted.cells_without_matching_derivation,583);
 assert.equal(accepted.actual_72h_public_archive_latest_records,3);
 assert.equal(accepted.observed_country_mentions_by_category.macro,0);
 assert.equal(accepted.latest_original_published_at,"2026-10-22T10:00:00.000Z");
 assert.equal(accepted.original_source_presence_585_cells_verified,false);
 assert.equal(accepted.signed_hot_products_verified,false);
 assert.equal(accepted.payments,0);
 assert.equal(JSON.stringify(accepted).includes("country_name"),false);
});
test("an honest day with zero events passes transport, never fabricates country news",()=>{
 const x=inspectObservedCountryGrid(fixture(),now);
 assert.equal(x.observed_country_category_cells,0);
 assert.equal(x.actual_72h_public_archive_latest_records,0);
 assert.equal(x.no_observation_does_not_mean_no_news,true);
});
test("invalid 585 routing, forged qualified news and stale clocks all fail",()=>{
 const malformed=[];
 const duplicate=fixture();duplicate.cells[584]={...duplicate.cells[0]};
 malformed.push(duplicate);
 const incomplete=fixture();incomplete.cells.pop();malformed.push(incomplete);
 const fakeSigned=fixture();fakeSigned.signed=true;malformed.push(fakeSigned);
 const fakeCurrent=fixture([{country_iso3:"IND",category:"geopolitics",count:1}]);
 fakeCurrent.cells.find(r=>r.country_iso3==="IND"&&r.category==="geopolitics").commercial_rights_verified=true;
 malformed.push(fakeCurrent);
 const stale=fixture();stale.generated_at="2026-10-21T11:00:00Z";malformed.push(stale);
 const wrong=fixture([{country_iso3:"USA",category:"macro",count:1}]);
 wrong.cells.find(r=>r.country_iso3==="USA"&&r.category==="macro").latest_original_published_at="2026-10-23T12:00:00Z";
 malformed.push(wrong);
 const missing=fixture();missing.cells.find(r=>r.country_iso3==="VAT"&&r.category==="rare_earth").country_iso3="ZZZ";
 malformed.push(missing);
 for(const x of malformed)assert.throws(()=>inspectObservedCountryGrid(x,now),/LIVE_195X3_/u);
});
test("live GET is no-key no-redirect and fails on 503",async()=>{
 const calls=[];
 const ok=await verifyProductionObserved195x3({now,fetchImpl:async(url,opts)=>{
   calls.push({url,opts});return Response.json(fixture());
 }});
 assert.equal(ok.observed_country_category_cells,0);
 assert.equal(calls[0].url,"https://geomacro.live/api/v1/intelligence/query?view=country-coverage-195x3");
 assert.equal(calls[0].opts.redirect,"error");
 assert.equal(calls[0].opts.method,"GET");
 assert.equal(calls[0].opts.headers.Accept,"application/json");
 await assert.rejects(()=>verifyProductionObserved195x3({now,fetchImpl:async()=>new Response(null,{status:503})}),/LIVE_195X3_WEBSITE_HTTP_UNAVAILABLE/u);
});
