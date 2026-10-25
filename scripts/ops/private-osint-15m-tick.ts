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
import {officialWebsiteCandidateFromOsint,publishPrivateOsintWebsiteSignals} from "../lib/private-osint-website-bridge.mjs";
import {deriveStatelessSignals} from "../../src/lib/stateless-intelligence-model.ts";
import {fetchAllDerivedNews} from "../../src/lib/public-derived-news-client.ts";
import {isConcretePublicIntelligence} from "../../src/lib/intelligence-concrete-publication.ts";

const root=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
if(root.length<32)throw Error("PRIVATE_OSINT_PRODUCTION_CREDENTIAL_REQUIRED");
const control=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
const privateToken=createHmac("sha256",control)
  .update("geomacro-private-osint-15m-v1").digest("hex");
const timestamp=new Date();
// Ephemeral first-party issuer/link metadata, validated against exact pinned
// origin/permalink rules. Unverified private-only rows remain in private D1.
const originalCandidates=[];
const candidateIds=new Set();
const directVerifiedNewsIds=new Set();
const result=await collectPrivateOsint15m({
 now:timestamp,normalize:normalizeReusableNewsJson,
 resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195),
 onOriginalCandidate:raw=>{
  const eligible=officialWebsiteCandidateFromOsint(raw,timestamp.getTime());
  if(!eligible)return;
  directVerifiedNewsIds.add(raw.news_id);
  const key=eligible.category+"|"+eligible.articleUrl;
  if(!candidateIds.has(key)){
   candidateIds.add(key);originalCandidates.push(eligible);
  }
 },
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

// Publish the same safe, unscored derived-card shape consumed by the existing
// /intelligence desk; never copy private tags or raw originals into public D1.
const ordered=originalCandidates.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
const lanes=["geopolitics","macro","rare_earth"].map(c=>ordered.filter(x=>x.category===c));
const balanced=[];
for(let n=0;balanced.length<200&&lanes.some(l=>n<l.length);n++)
 for(const lane of lanes)if(lane[n]&&balanced.length<200)balanced.push(lane[n]);
const firstPartySignals=deriveStatelessSignals(balanced,Date.now(),
 {websiteDelay:false,maxSignals:200}).filter(s=>s.status==="official_release_observed_unscored");
// Never export unverified source-feed observations as website Intelligence.
// Private discovery and its counts remain intact; only concrete originals
// without mandatory attribution are accepted for public card publication.
const websiteSignals=firstPartySignals.filter(isConcretePublicIntelligence);
const website=await publishPrivateOsintWebsiteSignals({
 signals:websiteSignals,
 controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
 controlToken:control,readAll:fetchAllDerivedNews,now:Date.now(),
});
// Counts-only acceptance of the SAME live public journal consumed by the
// website. A full private collection can be green while every old D1 card
// remains ineligible for the requested concrete-only UI; do not claim zero
// means no observed news. Never log a title, URL, issuer or event text.
let websiteDisplayReceipt={status:"PUBLIC_D1_READ_UNAVAILABLE",total:0,
 categories:{geopolitics:0,macro:0,rare_earth:0},eligible:0,
 eligible_by_category:{geopolitics:0,macro:0,rare_earth:0}};
try{
 const retained=await fetchAllDerivedNews(fetch,Date.now());
 const accepted=retained.filter(isConcretePublicIntelligence);
 const summarize=(rows)=>Object.fromEntries(
  ["geopolitics","macro","rare_earth"].map(c=>[c,rows.filter(x=>x.category===c).length]));
 websiteDisplayReceipt={
  status:"PUBLIC_D1_READ_VERIFIED",total:retained.length,
  categories:summarize(retained),eligible:accepted.length,
  eligible_by_category:summarize(accepted),
  unverified_candidates_hidden:retained.filter(x=>
   x.status!=="official_release_observed_unscored").length,
  rights_or_actor_rejected:retained.filter(x=>
   x.status==="official_release_observed_unscored"&&!isConcretePublicIntelligence(x)).length,
 };
}catch{/* Report unknown, not fabricated zero availability. */}
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
  website_editorial_bridge:website,
  website_display_readback:websiteDisplayReceipt,
  website_release_eligibility:{
    private_first_party_original_links:originalCandidates.length,
    official_topic_selected:firstPartySignals.length,
    concrete_event_eligible:websiteSignals.length,
    concrete_by_category:Object.fromEntries(
      ["geopolitics","macro","rare_earth"].map(key=>
        [key,websiteSignals.filter(row=>row.category===key).length])),
    candidate_generic_hidden:result.items.length-websiteSignals.length,
    required_attribution_not_removed:true,
  },
  website_unverified_feed_candidates:0,
 private_osint_d1_persisted:true,
 private_durable_first_seen_clock_verified:true,
 independent_verification_required_for_ingestion:false,
 original_page_independently_verified:false,
 current_signed_commercial_intelligence_verified:false,
 public_news_updated:website.new_derived_stories>0,
 signed_or_paid_publications:0,
}));
