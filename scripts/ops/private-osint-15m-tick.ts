#!/usr/bin/env bun
/**
 * Private OSINT ONLY: 195-country routing, 3 categories, 15m best-effort,
 * source-native RSS/Atom clocks and D1 durable first-seen readback.
 * No customer endpoint, original titles/URLs, paid rights or fake verification.
 */
import {createHmac,createHash} from "node:crypto";
import {collectPrivateOsint15m} from "../lib/private-osint-15m-collector.mjs";
import {privateOsintRuntimeSources} from "../lib/private-osint-country-rotation.mjs";
import {privateOsintGlobalSources} from "../lib/private-osint-global-sources.mjs";
import {persistPrivateOsintBatch} from "../lib/private-osint-15m-durable-publisher.mjs";
import {stagePhase2iOsintFairRaw} from "../lib/phase2i-osint-country-fair-raw-staging.mjs";
import {privateGdeltGlobalDiscovery} from "../lib/private-osint-gdelt-global.mjs";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {privateOsintCountryMention} from "../lib/private-osint-country-mentions.mjs";
import {officialWebsiteCandidateFromOsint,isKnownOfficialWebsiteFeed,unverifiedWebsiteSignalFromOsint,publishPrivateOsintWebsiteSignals} from "../lib/private-osint-website-bridge.mjs";
import {PRIVATE_OSINT_TOPICS} from "../lib/private-osint-global-sources.mjs";
import {actorActionNewsObservation} from "../../src/lib/release-news-observation.ts";
import {deriveStatelessSignals} from "../../src/lib/stateless-intelligence-model.ts";
import {fetchAllDerivedNews} from "../../src/lib/public-derived-news-client.ts";
import {isConcretePublicIntelligence,intelligenceDisplayRejection,intelligenceRequiredSourceCredits} from "../../src/lib/intelligence-concrete-publication.ts";
import {dedupeIntelligenceStories} from "../../src/lib/intelligence-news-dedupe.ts";
import {DERIVED_NEWS_TOPIC_POLICY_REVISION,requireDerivedNewsWorkerPolicy} from "../lib/derived-news-readback-policy.mjs";

const root=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
if(root.length<32)throw Error("PRIVATE_OSINT_PRODUCTION_CREDENTIAL_REQUIRED");
const control=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
const privateToken=createHmac("sha256",control)
  .update("geomacro-private-osint-15m-v1").digest("hex");
const controlPlaneRoot="https://geomacro-control-plane.daspallab202391.workers.dev";
// Private research must never depend on the public news journal, its policy
// health endpoint, a signer, a paid provider or website publication.
const researchPrivateOnly=process.env.GEOMACRO_OSINT_RESEARCH_PRIVATE_ONLY==="1";
const workerPolicy=researchPrivateOnly?null:await requireDerivedNewsWorkerPolicy({
 fetchImpl:globalThis.fetch,url:controlPlaneRoot+"/health",
 expectedRevision:DERIVED_NEWS_TOPIC_POLICY_REVISION,
});
if(workerPolicy)console.log(JSON.stringify(workerPolicy));
const timestamp=new Date();
// Ephemeral first-party issuer/link metadata, validated against exact pinned
// origin/permalink rules. Unverified private-only rows remain in private D1.
const originalCandidates=[];
const candidateIds=new Set();
const collectedPrivateOriginals=[];
const phase2hRawSeen=new Set();
// At most 300 most recent concrete reports from each lane; no publisher
// titles/links ever enter public D1 and no extra fetch or provider charge.
const observedByCategory=new Map(["geopolitics","macro","rare_earth"].map(c=>[c,new Map()]));
// The same bounded 15-minute production job now includes 24 native country
// publisher candidates and 25 index-only country leads per slot. This reuses
// the 49 optional GET positions; no parallel job, quota bypass or extra D1.
const runtimeSources=privateOsintRuntimeSources(timestamp,privateOsintGlobalSources(),
 COUNTRIES_195,{includeLocalGapLane:true});
const result=await collectPrivateOsint15m({
 now:timestamp,registry:runtimeSources,normalize:normalizeReusableNewsJson,
 resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195),
 onOriginalCandidate:(raw=>{
  // Store each discoverable native-dated original's private feed metadata
  // before the existing website candidate classifier can discard it.
  // This remains protected research: no original body fetch or rights grant.
  if(raw&&typeof raw.article_url==="string"&&
     typeof raw.title==="string"&&typeof raw.published_at==="string"&&
     ["geopolitics","macro","rare_earth"].includes(raw.category)){
    const rawKey=raw.category+"|"+raw.article_url+"|"+raw.published_at;
    if(!phase2hRawSeen.has(rawKey)){
      phase2hRawSeen.add(rawKey);
      let host="";
      try{host=new URL(raw.source_url).hostname}catch{}
      collectedPrivateOriginals.push({
       category:raw.category,title:raw.title,articleUrl:raw.article_url,
       publishedAt:raw.published_at,sourceId:host,credit:null,
      });
    }
  }
  if(researchPrivateOnly)return;

  const eligible=officialWebsiteCandidateFromOsint(raw,timestamp.getTime());
  if(eligible){
   const key=eligible.category+"|"+eligible.articleUrl;
   if(!candidateIds.has(key)){
    candidateIds.add(key);originalCandidates.push(eligible);
   }
   return;
  }
  // An invalid first-party pinned permalink NEVER downgrades to a looser
  // media-source observation. OSINT observations are source reports only.
  if(isKnownOfficialWebsiteFeed(raw.source_url,raw.category)||
     typeof raw.article_url!=="string"||
     !PRIVATE_OSINT_TOPICS[raw.category]?.test(raw.title))return;
  const event=actorActionNewsObservation(raw.title);
  if(!event)return;
  const lane=observedByCategory.get(raw.category);
  // Collapse one original item repeated in multiple search/feed queries.
  const identity=raw.category+"|"+raw.article_url;
  if(lane.has(identity))return;
  const row={...raw,news_id:"news-"+createHash("sha256").update(identity).digest("hex")};
  if(lane.size>=300){
   let oldestKey=null,oldestDate=null;
   for(const [k,value] of lane)if(oldestDate===null||value.published_at<oldestDate){
    oldestKey=k;oldestDate=value.published_at;
   }
   if(oldestDate!==null&&raw.published_at<=oldestDate)return;
   lane.delete(oldestKey);
  }
  lane.set(identity,{...row,event});
 }),
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
 // Preserve every fetched news item; write a third of unchanged health per tick.
 // Full source-health D1 refresh is nominally 45 minutes, NOT 15 minutes.
 sourceHealthSnapshotSlots:3,
 controlPlaneRoot,
});
if(persisted.source_checks_observed_this_tick!==result.checks.length||
 persisted.source_checks_persisted!==persisted.source_checks_selected_for_d1||
 persisted.source_checks_deferred_to_snapshot+persisted.source_checks_persisted!==result.checks.length||
 !persisted.d1_write_exact_readback_verified||
 !persisted.separate_private_d1_readback_verified)
 throw Error("PRIVATE_OSINT_15M_DURABLE_PRODUCTION_ACCEPTANCE_FAILED");
// The same quota-admitted private research collector now captures its
// original observed publisher metadata in the existing canonical D1, without
// adding a source read or modifying any public or partner feed.
const rawStage=await stagePhase2iOsintFairRaw({
 candidates:collectedPrivateOriginals,now:timestamp,
 derive:deriveStatelessSignals,controlPlaneRoot,token:control,
});
console.log(JSON.stringify(rawStage));
if(rawStage.selected_count>0&&rawStage.d1_readback_verified!==true)
 throw Error("PHASE2I_OSINT_NO_POSITIVE_CANONICAL_RAW_D1_RECEIPT");


// Production workflow sets GEOMACRO_OSINT_RESEARCH_PRIVATE_ONLY=1.
// Complete the existing authenticated D1 write + independent readback first,
// then emit aggregate-only status. No public website, signing, rights upgrade,
// partner feed or paid action executes in this mode.
if(researchPrivateOnly){
 const index=await privateGdeltGlobalDiscovery({
  resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195),
 });
 console.log(JSON.stringify({
  schema:"geomacro.private-osint-15m-private-production-status.v1",
  mode:"PROTECTED_INTERNAL_OSINT_RESEARCH_ONLY",
  ...result.summary,
  source_checks_by_domain_state:result.checks.reduce((counts,row)=>{
   const key=row.category+"_"+row.state;
   counts[key]=(counts[key]??0)+1;return counts;
  },{}),
  ...persisted,
  gdelt_global_index:index,
  private_osint_d1_persisted:true,
  separate_private_d1_readback_verified:true,
  website_publication_attempted:false,
  commercial_rights_approved:false,
  paid_publication_attempted:false,
  independent_original_page_verification_claimed:false,
 }));
 process.exit(0);
}

// Publish the same safe, unscored derived-card shape consumed by the existing
// /intelligence desk; never copy private tags or raw originals into public D1.
const ordered=originalCandidates.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
const lanes=["geopolitics","macro","rare_earth"].map(c=>ordered.filter(x=>x.category===c));
const balanced=[];
for(let n=0;balanced.length<200&&lanes.some(l=>n<l.length);n++)
 for(const lane of lanes)if(lane[n]&&balanced.length<200)balanced.push(lane[n]);
const firstPartySignals=deriveStatelessSignals(balanced,Date.now(),
 {websiteDelay:false,maxSignals:200}).filter(s=>s.status==="official_release_observed_unscored");
// Include concrete OSINT source reports without upgrading their verification.
// No generic publisher-candidate card, no third-party headline copy or links.
const observed=[...observedByCategory.values()].flatMap(lane=>[...lane.values()])
 .sort((a,b)=>b.published_at.localeCompare(a.published_at));
const osintSignals=observed.map(row=>
 unverifiedWebsiteSignalFromOsint(row,Date.now(),()=>row.event))
 .filter(Boolean).filter(isConcretePublicIntelligence);
// Fair latest-first scheduling; small categories cannot be buried by a large
// geopolitics batch, and the public journal retains up to 72h.
const eligible=dedupeIntelligenceStories([
 ...firstPartySignals.filter(isConcretePublicIntelligence),...osintSignals,
]);
const publishingLanes=["geopolitics","macro","rare_earth"].map(cat=>
 eligible.filter(row=>row.category===cat));
const websiteSignals=[];
const publishedIds=new Set();
const publicationNow=Date.now();
for(let n=0;websiteSignals.length<200&&publishingLanes.some(l=>n<l.length);n++)
 for(const lane of publishingLanes)if(lane[n]&&websiteSignals.length<200&&
   !publishedIds.has(lane[n].id)&&
   Date.parse(lane[n].published_at)>=publicationNow-72*3600000+120000){
  publishedIds.add(lane[n].id);websiteSignals.push(lane[n]);
 }
const website=await publishPrivateOsintWebsiteSignals({
 signals:websiteSignals,
 controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
 controlToken:control,readAll:fetchAllDerivedNews,
 dedupeAgainstExisting:dedupeIntelligenceStories,now:Date.now(),
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
 const eligibleRows=retained.filter(isConcretePublicIntelligence);
 const accepted=dedupeIntelligenceStories(eligibleRows);
 const summarize=(rows)=>Object.fromEntries(
  ["geopolitics","macro","rare_earth"].map(c=>[c,rows.filter(x=>x.category===c).length]));
 // Stable reason totals; no raw source titles, URLs or headline fragments.
 const rejectionByCategory=Object.fromEntries(
  ["geopolitics","macro","rare_earth"].map(category=>{
   const counts={};
   for(const row of retained.filter(s=>s.category===category)){
    const reason=intelligenceDisplayRejection(row)??"ELIGIBLE_BEFORE_DEDUPE";
    counts[reason]=(counts[reason]??0)+1;
   }
   return [category,counts];
  }));
 const visibleCredits=summarize(accepted.filter(row=>
  intelligenceRequiredSourceCredits(row).length>0));
 websiteDisplayReceipt={
  status:"PUBLIC_D1_READ_VERIFIED",total:retained.length,
  categories:summarize(retained),eligible:accepted.length,
  duplicate_category_events_hidden:eligibleRows.length-accepted.length,
  eligible_by_category:summarize(accepted),
  reasons_by_category:rejectionByCategory,
  source_credited_eligible_by_category:visibleCredits,
  unverified_candidates_hidden:retained.filter(x=>
   x.status==="osint_feed_observed_unverified"&&
   intelligenceDisplayRejection(x)!==null).length,
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
    concrete_osint_reports:osintSignals.length,
    concrete_event_eligible:websiteSignals.length,
    concrete_by_category:Object.fromEntries(
      ["geopolitics","macro","rare_earth"].map(key=>
        [key,websiteSignals.filter(row=>row.category===key).length])),
    candidate_generic_hidden:observed.length-osintSignals.length,
    required_attribution_not_removed:true,
  },
  website_unverified_feed_candidates:observed.length-osintSignals.length,
 private_osint_d1_persisted:true,
 private_durable_first_seen_clock_verified:true,
 independent_verification_required_for_ingestion:false,
 original_page_independently_verified:false,
 current_signed_commercial_intelligence_verified:false,
 public_news_updated:website.new_derived_stories>0,
 signed_or_paid_publications:0,
}));
