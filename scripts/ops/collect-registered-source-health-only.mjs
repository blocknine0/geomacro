#!/usr/bin/env bun
/**
 * Independent registered-feed discovery while the D1 factual publisher is
 * quota-held. Does no D1 queries/writes, B2 operations, public publication,
 * paid rights promotion or third-party content persistence. Live sources
 * remain checked rather than falsely reported as "zero events".
 */
import {collectRegisteredReusableNews} from "../lib/registered-reusable-news-source-collector.mjs";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {privateOsintCountryMention} from "../lib/private-osint-country-mentions.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";

if(process.env.GITHUB_ACTIONS!=="true"||
   process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   process.env.GITHUB_REF!=="refs/heads/main")
 throw Error("REGISTERED_SOURCE_MONITOR_TRUSTED_MAIN_REQUIRED");

const collected=await collectRegisteredReusableNews({
 now:new Date(),normalize:normalizeReusableNewsJson,
 resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195),
 deduplicateIndexItems:true,
});
const states=collected.summary.source_states;
const checked=collected.checks.length;
const counted=Object.values(states).reduce((n,v)=>n+v,0);
if(checked!==counted)throw Error("REGISTERED_SOURCE_HEALTH_COUNTS_INVALID");
console.log(JSON.stringify({
 schema:"geomacro.registered-source-held-discovery.v1",
 checked_source_category_pairs:checked,
 observed_noncommercial_candidates:collected.items.length,
 source_states:states,
 excluded_by_collector_capacity:collected.summary.excluded_by_collector_capacity,
 live_discovery_does_not_imply_canonical_d1_admission:true,
 raw_upstream_stored:false,
 d1_queries:0,d1_writes:0,b2_requests:0,
 paid_eligible:false,publication_attempted:false,
}));
