#!/usr/bin/env node
/** Physical GET-only acceptance of country-publisher source-gap candidates.
 * Verified transport/parser + native dated items are distinct from event-country
 * attribution and from private D1 end-to-end write verification.
 */
import {writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {privateUnverifiedOsintRegistry,collectPrivateUnverifiedOsint} from "../lib/private-unverified-osint-intake.mjs";
import {privateOsintCountryMention} from "../lib/private-osint-country-mentions.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
const normalize=row=>({
 schema:"geomacro.reusable-news-json.v1",category:row.category,
 country_iso3:row.country_iso3??null,
 source:{publisher_name:null,original_url:null,original_published_at:row.published_at},
 usage_rights:{commercial_reuse_authorized:false},
 delivery:{raw_article_included:false},
});
const categories=["geopolitics","macro","rare_earth"];
const ref=(s,c)=>createHash("sha256").update([s.id,s.url,c].join("\n")).digest("hex");
const registry=privateUnverifiedOsintRegistry(undefined,{includeGapLane:true})
 .filter(s=>s.id.startsWith("private_gaplane_"));
if(registry.length<1||registry.length>100)throw Error("PRIVATE_GAPLANE_REGISTRY_RANGE_INVALID");
const canonical=new Set(COUNTRIES_195.map(c=>c.iso3));
const countries=[...new Set(registry.map(s=>s.publisher_country_iso3))].sort();
if(countries.length!==registry.length-2||countries.some(c=>!canonical.has(c)))
 throw Error("PRIVATE_GAPLANE_COUNTRY_SET_INVALID");
const now=new Date();
const report={
 schema:"geomacro.private-local-gaplane-native-rss-probe.v1",
 checked_at:now.toISOString(),scope:"READ_ONLY_SOURCE_PROBES_NO_D1_OR_PUBLIC_WRITE",
 candidate_endpoints:registry.length,targeted_missing_countries:countries.length,
 country_sources:[],source_health_by_state:{},native_dated_item_count:0,
 country_attributed_category_cells_this_tick:0,
 publisher_country_is_not_event_country:true,verified_delivery:false,
};
try{
 const result=await collectPrivateUnverifiedOsint({
  now,registry,normalize,
  resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195),
 });
 const state=new Map(result.checks.map(x=>[x.source_ref,x.state]));
 const healthy=new Set(["OBSERVED","EMPTY_OR_OUTSIDE_WINDOW"]);
 const known=new Set(countries);
 report.source_checks=result.checks.length;
 report.native_dated_item_count=result.items.length;
 report.country_attributed_category_cells_this_tick=
  new Set(result.items.filter(x=>x.country_iso3&&known.has(x.country_iso3))
    .map(x=>x.country_iso3+":"+x.category)).size;
 report.country_sources=registry.map(s=>({
  source_id:s.id,publisher_country_iso3:s.publisher_country_iso3,
  category_states:categories.map(c=>({category:c,state:state.get(ref(s,c))??"UNOBSERVED"})),
  healthy_feed_this_tick:categories.some(c=>healthy.has(state.get(ref(s,c)))),
 }));
 report.healthy_endpoints=report.country_sources.filter(x=>x.healthy_feed_this_tick).length;
 report.countries_with_healthy_local_source_this_tick=
  new Set(report.country_sources.filter(x=>x.healthy_feed_this_tick).map(x=>x.publisher_country_iso3)).size;
 report.countries_without_healthy_local_source_this_tick=
  countries.filter(c=>!report.country_sources.some(x=>x.publisher_country_iso3===c&&x.healthy_feed_this_tick));
 for(const check of result.checks)
  report.source_health_by_state[check.state]=(report.source_health_by_state[check.state]??0)+1;
 report.status="PROBED_NO_D1_WRITE";
}catch(error){
 report.status="PROBE_FAILED";
 report.error_code=/^[A-Z0-9_:]+$/u.test(error?.message??"")?
  error.message:"UNCLASSIFIED_PROBE_FAILURE";
 process.exitCode=1;
}
writeFileSync("/tmp/geomacro-private-local-gaplane-probe.json",
 JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({
 schema:report.schema,status:report.status,
 candidate_endpoints:report.candidate_endpoints,
 targeted_missing_countries:report.targeted_missing_countries,
 healthy_endpoints:report.healthy_endpoints??0,
 countries_with_healthy_local_source_this_tick:report.countries_with_healthy_local_source_this_tick??0,
 source_health_by_state:report.source_health_by_state,
 dated_items_observed:report.native_dated_item_count,
 attributed_event_cells:report.country_attributed_category_cells_this_tick,
 d1_write_verified:false,
}));
