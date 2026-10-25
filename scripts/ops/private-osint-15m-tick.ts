#!/usr/bin/env bun
/** No public output, external dataset, paid API, raw or Telegram data. */
import {collectPrivateOsint15m} from "../lib/private-osint-15m-collector.mjs";
import {privateGdeltGlobalDiscovery} from "../lib/private-osint-gdelt-global.mjs";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {countryMentionFromTitle} from "../lib/country-news-mentions-195.mjs";
const result=await collectPrivateOsint15m({
 normalize:normalizeReusableNewsJson,
 resolveCountry:title=>countryMentionFromTitle(title,COUNTRIES_195)
});
const index=await privateGdeltGlobalDiscovery({
 resolveCountry:title=>countryMentionFromTitle(title,COUNTRIES_195),
});
const checkCounts={};
for(const row of result.checks){
 const k=row.category+"_"+row.state;
 checkCounts[k]=(checkCounts[k]??0)+1;
}
const scanned=result.summary.source_checks;
if(result.summary.configured_country_routes!==195||
 result.summary.configured_country_category_routes!==585||
 result.summary.configured_categories!==3||
 scanned<result.summary.registered_source_endpoints||
 result.summary.source_endpoints_attempted!==result.summary.registered_source_endpoints)
 throw Error("PRIVATE_OSINT_ROUTING_OR_SOURCE_COVERAGE_FAILED");
console.log(JSON.stringify({
 schema:"geomacro.private-osint-15m-scan-only.v1",
 objective_minutes:15,poll_target_minutes:5,
 ...result.summary,
 source_checks_by_domain_state:checkCounts,
 osint_records_transient:result.items.length,
 gdelt_global_index:index,
 data_persisted_to_private_d1:false,
 public_news_updated:false,
 verified_originals_added:0,
 signed_or_paid_publications:0,
}));
