#!/usr/bin/env bun
/**
 * Private OSINT ONLY: 195-country routing, 3 categories, 5m best-effort,
 * source-native RSS/Atom clocks and D1 durable first-seen readback.
 * No customer endpoint, original titles/URLs, paid rights or fake verification.
 */
import {createHmac} from "node:crypto";
import {collectPrivateOsint15m} from "../lib/private-osint-15m-collector.mjs";
import {persistPrivateOsintBatch} from "../lib/private-osint-15m-durable-publisher.mjs";
import {privateGdeltGlobalDiscovery} from "../lib/private-osint-gdelt-global.mjs";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {privateOsintCountryMention} from "../lib/private-osint-country-mentions.mjs";

const root=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
if(root.length<32)throw Error("PRIVATE_OSINT_PRODUCTION_CREDENTIAL_REQUIRED");
const control=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
const privateToken=createHmac("sha256",control)
  .update("geomacro-private-osint-15m-v1").digest("hex");
const timestamp=new Date();
const result=await collectPrivateOsint15m({
 now:timestamp,normalize:normalizeReusableNewsJson,
 resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195)
});
const scanned=result.summary.source_checks;
if(result.summary.configured_country_routes!==195||
 result.summary.configured_country_category_routes!==585||
 result.summary.configured_categories!==3||
 scanned<result.summary.registered_source_endpoints||
 result.summary.source_endpoints_attempted!==result.summary.registered_source_endpoints)
 throw Error("PRIVATE_OSINT_ROUTING_OR_SOURCE_COVERAGE_FAILED");

// Do not spend extra provider calls or GDELT throttling time before private
// source-clock JSON is durably written and independently read back.
const persisted=await persistPrivateOsintBatch({
 result,privateToken,now:Date.now(),
 controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
});
if(persisted.source_checks_persisted!==result.checks.length||
 !persisted.d1_write_exact_readback_verified||
 !persisted.separate_private_d1_readback_verified)
 throw Error("PRIVATE_OSINT_15M_DURABLE_PRODUCTION_ACCEPTANCE_FAILED");

const index=await privateGdeltGlobalDiscovery({
 resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195)
});
console.log(JSON.stringify({
 schema:"geomacro.private-osint-15m-production-status.v1",
 objective_minutes:15,poll_target_minutes:5,
 ...result.summary,
 source_checks_by_domain_state:result.checks.reduce((a,row)=>{
  const k=row.category+"_"+row.state;
  a[k]=(a[k]??0)+1;return a;
 },{}),
 ...persisted,
 gdelt_global_index:index,
 private_osint_d1_persisted:true,
 private_durable_first_seen_clock_verified:true,
 independent_verification_required_for_ingestion:false,
 original_page_independently_verified:false,
 current_signed_commercial_intelligence_verified:false,
 public_news_updated:false,
 signed_or_paid_publications:0,
}));
