#!/usr/bin/env node
/**
 * Read-only live probe of the private OSINT registry.
 * GET-only; no private D1/B2 writes, no secrets, no publication, no titles/URLs
 * or raw feed bodies in logs/artifacts. Coverage measures source health, not
 * whether every country has a local publisher or a news item on every tick.
 */
import {createHash} from "node:crypto";
import {writeFileSync} from "node:fs";
import {
 privateOsintGlobalSources,privateOsintCategoryLiveCoverage,
 privateOsintPublisherCountryCoverage,privateOsintCountryCategoryCoverage,
 privateOsintCorridorSourceCoverage,
} from "../lib/private-osint-global-sources.mjs";
import {collectPrivateOsint15m} from "../lib/private-osint-15m-collector.mjs";
import {privateOsintCountryMention} from "../lib/private-osint-country-mentions.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";

const normalize=item=>({
 schema:"geomacro.reusable-news-json.v1",
 category:item.category,
 country_iso3:item.country_iso3??null,
 source:{publisher_name:null,original_url:null,original_published_at:item.published_at},
 usage_rights:{commercial_reuse_authorized:false},
 delivery:{raw_article_included:false},
});
const sourceRef=(source,category)=>createHash("sha256")
 .update([source.id,source.url,category].join("\n")).digest("hex");
const outputPath="/tmp/geomacro-private-osint-live-coverage.json";
const startedAt=new Date();
const sources=privateOsintGlobalSources();
let checks=[],items=[],report;
try{
 const result=await collectPrivateOsint15m({
  now:startedAt,registry:sources,normalize,
  resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195),
  concurrency:8,
 });
 checks=result.checks;
 items=result.items;
 const expectedChecks=sources.reduce((count,source)=>count+source.categories.length,0);
 if(result.summary.source_endpoints_attempted!==sources.length||checks.length!==expectedChecks)
  throw Error("PRIVATE_OSINT_LIVE_PROBE_CHECK_COUNT_MISMATCH");
 const categoryLive=privateOsintCategoryLiveCoverage(sources,checks,items);
 const publisherCountry=privateOsintPublisherCountryCoverage(sources,checks);
 const countryCategory=privateOsintCountryCategoryCoverage(sources,checks,items,{includeCells:true});
 const corridor=privateOsintCorridorSourceCoverage(sources,checks,{includeCells:true});
 const endpointStatuses=sources.map(source=>({
  source_id:source.id,
  continent:source.continent??null,
  publisher_country_iso3:source.publisher_country_iso3??null,
  categories:source.categories.map(category=>{
   const check=checks.find(row=>row.source_ref===sourceRef(source,category));
   return {category,state:check?.state??"UNOBSERVED",checked_at:check?.checked_at??null};
  }),
 })).sort((a,b)=>a.source_id.localeCompare(b.source_id));
 const allCellsHealthy=countryCategory.coverage.cells_without_healthy_source===0;
 const everyCategoryHealthy=categoryLive.all_categories_have_healthy_feed_this_tick;
 const everyCategoryHasItems=categoryLive.all_categories_have_native_dated_items_this_tick;
 const fullLiveCoverage=allCellsHealthy&&everyCategoryHealthy&&everyCategoryHasItems;
 report={
  schema:"geomacro.private-osint-live-coverage-report.v1",
  generated_at:startedAt.toISOString(),completed_at:new Date().toISOString(),
  scope:"READ_ONLY_PUBLIC_FEED_GETS_NO_PRIVATE_D1_WRITE_NO_B2_WRITE_NO_PUBLICATION",
  source_registry_endpoints:sources.length,
  source_checks_completed:checks.length,
  observed_native_dated_items:items.length,
  status:fullLiveCoverage?"FULL_195X3_HEALTHY_FEEDS_AND_THREE_CATEGORIES_WITH_DATED_ITEMS_THIS_TICK":
   allCellsHealthy&&everyCategoryHealthy?"ALL_585_FALLBACKS_HEALTHY_BUT_CATEGORY_ITEM_GAP":
   everyCategoryHealthy&&everyCategoryHasItems?"THREE_CATEGORIES_HAVE_DATED_ITEMS_BUT_COUNTRY_CELL_HEALTH_GAPS_REMAIN":
   everyCategoryHealthy?"HEALTHY_FEEDS_BUT_AT_LEAST_ONE_CATEGORY_HAS_NO_DATED_ITEMS":
   "DEGRADED_LIVE_SOURCE_COVERAGE",
  full_585_cell_healthy_fallback:allCellsHealthy,
  all_three_category_lanes_healthy_this_tick:everyCategoryHealthy,
  all_three_categories_have_native_dated_items_this_tick:everyCategoryHasItems,
  category_live_source_coverage:categoryLive,
  publisher_country_inventory:publisherCountry,
  country_category_source_coverage:countryCategory,
  corridor_source_coverage:corridor,
  endpoint_statuses:endpointStatuses,
  evidence_limitations:{
   source_health_is_not_event_verification:true,
   a_healthy_feed_can_have_no_new_story:true,
   publisher_country_is_not_event_country:true,
   title_based_country_matching_is_not_independent_geolocation:true,
   provider_rights_verified:false,commercial_eligibility_verified:false,
   d1_write_performed:false,b2_write_performed:false,publicly_served:false,
   public_reuse_or_signed_delivery_authorized:false,
  },
 };
}catch(error){
 report={
  schema:"geomacro.private-osint-live-coverage-report.v1",
  generated_at:startedAt.toISOString(),completed_at:new Date().toISOString(),
  scope:"READ_ONLY_PUBLIC_FEED_GETS_NO_PRIVATE_D1_WRITE_NO_B2_WRITE_NO_PUBLICATION",
  source_registry_endpoints:sources.length,source_checks_completed:checks.length,
  status:"PROBE_EXECUTION_FAILED",
  error_code:typeof error?.message==="string"&&/^[A-Z0-9_:.-]{1,120}$/u.test(error.message)?error.message:"UNCLASSIFIED_PROBE_ERROR",
  evidence_limitations:{source_health_is_not_event_verification:true,d1_write_performed:false,b2_write_performed:false,publicly_served:false},
 };
 process.exitCode=1;
}
writeFileSync(outputPath,JSON.stringify(report,null,2)+"\n",{mode:0o600});
const summary={
 schema:report.schema,status:report.status,
 source_registry_endpoints:report.source_registry_endpoints,
 source_checks_completed:report.source_checks_completed,
 observed_native_dated_items:report.observed_native_dated_items??null,
 category_statuses:report.category_live_source_coverage?.category_coverage?.map(row=>({
  category:row.category,registered:row.registered,checked:row.checked,
  healthy_distinct_feed_endpoints:row.healthy_distinct_feed_endpoints,
  observed_items:row.native_dated_items_in_collector_batch,status:row.status,
 }))??[],
 country_category_cells:report.country_category_source_coverage?.returned_country_category_cells??null,
 healthy_country_category_cells:report.country_category_source_coverage?.coverage?.cells_with_any_healthy_source??null,
 all_three_categories_have_native_dated_items_this_tick:report.all_three_categories_have_native_dated_items_this_tick??false,
 country_specific_publisher_countries:report.country_category_source_coverage?.country_specific_source_countries_registered??null,
 endpoint_status_rows:report.endpoint_statuses?.length??0,
 raw_titles_or_feed_bodies_emitted:false,private_storage_writes:false,public_publication:false,
};
process.stdout.write(JSON.stringify(summary,null,2)+"\n");
if(!report.all_three_category_lanes_healthy_this_tick||!report.all_three_categories_have_native_dated_items_this_tick||!report.full_585_cell_healthy_fallback)
 process.stderr.write("WARNING: source gaps are recorded in the counts-only live coverage artifact.\n");
