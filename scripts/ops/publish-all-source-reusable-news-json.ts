#!/usr/bin/env bun
import {buildNewsProductPacket,NEWS_PRODUCT_FACTORY_VERSION} from "../../src/lib/news-product-factory.ts";
// Production collector: registered sources -> one factual JSON -> protected
// Cloudflare D1 -> D1 readback. No raw source, premium, Supabase or x402.
import {createHmac,createHash} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {collectRegisteredReusableNews} from "../lib/registered-reusable-news-source-collector.mjs";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {deriveStatelessSignals} from "../../src/lib/stateless-intelligence-model.ts";
import {buildPhase2hPrivateRawRecords,postPhase2hPrivateRawRecords} from "../lib/phase2h-raw-original-records.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {countryMentionFromTitle} from "../lib/country-news-mentions-195.mjs";
import {prepareReusableNewsBatches} from "../lib/prepare-reusable-news-batches.mjs";
import {observedCountryCategoryCoverage} from "../lib/observed-country-category-coverage.mjs";

const root=(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
if(root.length<32)throw Error("REUSABLE_SOURCE_NEWS_PROTECTED_TOKEN_MISSING");
const token=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
const endpoint="https://geomacro-control-plane.daspallab202391.workers.dev";
const phase2hOriginals=[];
const phase2hKnown=new Set();
const collected=await collectRegisteredReusableNews({
  normalize:normalizeReusableNewsJson,
  resolveCountry:title=>countryMentionFromTitle(title,COUNTRIES_195),
  onOriginalCandidate:raw=>{
    if(!raw||typeof raw.article_url!=="string"||
       typeof raw.title!=="string"||typeof raw.published_at!=="string"||
       !["geopolitics","macro","rare_earth"].includes(raw.category))return;
    const key=raw.category+"|"+raw.article_url+"|"+raw.published_at;
    if(phase2hKnown.has(key))return;
    phase2hKnown.add(key);
    let sourceId="";
    try{sourceId=new URL(raw.source_url).hostname}catch{}
    phase2hOriginals.push({category:raw.category,title:raw.title,
      articleUrl:raw.article_url,publishedAt:raw.published_at,
      sourceId,credit:null});
  },
});
// The existing registered-source batch now also preserves private original
// feed observations before its public source-neutral factual projection.
const phase2h=buildPhase2hPrivateRawRecords(phase2hOriginals,{
 now:new Date(),derive:deriveStatelessSignals,
});
const phase2hD1=await postPhase2hPrivateRawRecords({
 records:phase2h.records,controlPlaneRoot:endpoint,token,
});
console.log(JSON.stringify({schema:"geomacro.phase2h.registered-source-originals.v1",
 by_category:phase2h.counts,stored:phase2hD1.stored,
 duplicate:phase2hD1.duplicate,excluded_invalid:phase2h.discarded_invalid,
 canonical_d1_readback_verified:phase2hD1.readback_verified,
 b2_verified:false,rights_verified:false,payments:0}));
const info=collected.summary;
if(collected.checks.length===0)throw Error("REUSABLE_SOURCE_NEWS_NO_ATTEMPTS");
const packing=prepareReusableNewsBatches({
  schema:collected.schema,items:collected.items,checks:collected.checks,
});
const groups=packing.batches;
if(packing.sent_items!==collected.items.length||
   packing.sent_checks!==collected.checks.length||
   packing.dropped_items!==0||packing.dropped_checks!==0)
 throw Error("REUSABLE_NEWS_BATCH_COMPLETENESS_FAILED");
let checked=0,accepted=0,capacityExcluded=0,firstSeenWithin15m=0,firstSeenLate15m=0,reobserved=0;
for(const group of groups){
  const reply=await fetch(endpoint+"/v1/reusable-source-news",{
    method:"PUT",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify(group),signal:AbortSignal.timeout(15000),
  });
  if(reply.status!==200){
    const data=await reply.json().catch(()=>null);
    const diagnostic=typeof data?.error==="string"&&
      /^REUSABLE_SOURCE_NEWS_[A-Z_]{3,72}$/u.test(data.error)?
        data.error:"REUSABLE_SOURCE_NEWS_NO_SAFE_DIAGNOSTIC";
    throw Error("REUSABLE_SOURCE_NEWS_D1_WRITE_HTTP_"+reply.status+"_"+diagnostic);
  }
  const body=await reply.json();
  if(body.ok!==true||body.d1_readback_verified!==true||
     body.accepted+body.capacity_excluded!==group.items.length||
     body.checked_sources!==group.checks.length||
     body.retention_hours!==25||
     !Number.isSafeInteger(body.first_observed_within_15m_count)||
     !Number.isSafeInteger(body.first_observed_later_than_15m_count)||
     !Number.isSafeInteger(body.previously_observed_count)||
     body.first_observation_is_not_independent_verification!==true||
     body.first_observed_within_15m_count+body.first_observed_later_than_15m_count+
       body.previously_observed_count!==body.accepted||
     body.raw_upstream_stored!==false||body.paid_product_authorized!==false)
    throw Error("REUSABLE_SOURCE_NEWS_D1_ACK_INVALID");
  accepted+=body.accepted;capacityExcluded+=body.capacity_excluded;
  checked+=body.checked_sources;
  firstSeenWithin15m+=body.first_observed_within_15m_count;
  firstSeenLate15m+=body.first_observed_later_than_15m_count;
  reobserved+=body.previously_observed_count;
}
const status=await fetch(endpoint+"/v1/public/reusable-source-news",{
  method:"GET",redirect:"error",cache:"no-store",
  headers:{Accept:"application/json",Authorization:"Bearer "+token},
  signal:AbortSignal.timeout(12000),
});
if(!status.ok)throw Error("REUSABLE_SOURCE_NEWS_PUBLIC_READ_UNAVAILABLE");
const publicBody=await status.json();
if(publicBody.schema!=="geomacro.reusable-source-news-feed.v1"||
   publicBody.window_hours!==25||
   publicBody.commercial_product_ready!==false||
   publicBody.public_raw_article_delivery!==false||
   !Array.isArray(publicBody.items))
  throw Error("REUSABLE_SOURCE_NEWS_PUBLIC_READ_CONTRACT_INVALID");
// A real downloadable JSON artifact is produced by the SAME authenticated
// D1-readback production run, even if Lovable has not published new code.
const complete=[...publicBody.items];
const ids=new Set(complete.map((x:any)=>x.id));
let cursor=publicBody.has_more?publicBody.next_offset:null;
while(cursor!==null){
  if(!Number.isSafeInteger(cursor)||cursor%200!==0||cursor<200||
     cursor>=4000)throw Error("REUSABLE_SOURCE_NEWS_PAGING_UNBOUNDED");
  const page=await fetch(endpoint+"/v1/public/reusable-source-news?offset="+cursor,{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Accept:"application/json",Authorization:"Bearer "+token},signal:AbortSignal.timeout(12000),
  });
  if(!page.ok)throw Error("REUSABLE_SOURCE_NEWS_PAGE_READ_UNAVAILABLE");
  const doc=await page.json();
  if(doc.ok!==true||doc.schema!==publicBody.schema||
     doc.offset!==cursor||doc.window_hours!==25||
     !Array.isArray(doc.items)||doc.items.length>200||
     doc.commercial_product_ready!==false||doc.public_raw_article_delivery!==false)
    throw Error("REUSABLE_SOURCE_NEWS_PAGE_CONTRACT_INVALID");
  for(const row of doc.items){
    if(ids.has(row.id))throw Error("REUSABLE_SOURCE_NEWS_PAGE_ID_REPEATED");
    ids.add(row.id);complete.push(row);
  }
  cursor=doc.has_more?doc.next_offset:null;
}
const archive={...publicBody,offset:0,has_more:false,next_offset:null,
  page_size:complete.length,items:complete,
  artifact_scope:"BOUNDED_REGISTERED_SOURCE_FACTUAL_JSON_25H",
  snapshot_generated_at:new Date().toISOString()};
mkdirSync("artifacts/reusable-source-news",{recursive:true});
writeFileSync("artifacts/reusable-source-news/news.json",
  JSON.stringify(archive,null,2)+"\n",{mode:0o600});
// A PRIVATE gap matrix is built exclusively from the already authenticated
// 25h D1 readback. No per-country upstream polling and no additional D1 query.
// Publisher country is NOT event country; all unmentioned and stale rows stay
// explicitly uncovered even if all 195 routing entries are present.
const actualCoverage=observedCountryCategoryCoverage(complete,COUNTRIES_195);
writeFileSync("artifacts/reusable-source-news/coverage.json",
  JSON.stringify(actualCoverage,null,2)+"\n",{mode:0o600});
// The scheduled ingest automatically compiles every retained input once per
// snapshot, with no 12-way source retrieval or paid-model calls. D1 remains
// canonical; these artifacts are reproducible derived packets, not a new DB.
let factoryCount=0,factoryExpired=0;
const factoryNow=Date.now(),factoryHash=createHash("sha256"),factorySample=[];
for(const item of complete){
  const native=Date.parse(item?.source?.original_published_at??"");
  if(Number.isFinite(native)&&factoryNow-native>25*3600000){factoryExpired++;continue;}
  const packet=await buildNewsProductPacket(item,{now:factoryNow});
  factoryHash.update(packet.input_id+"\n"+packet.packet_sha256+"\n");
  if(factorySample.length===0)factorySample.push(packet);
  factoryCount++;
}
// Persist a bounded receipt/sample, not 4,000 x 12 repeated full payloads on
// every scheduled run. Full packets are reproducible from canonical D1 via
// the authenticated private reader; no second data store is needed.
writeFileSync("artifacts/reusable-source-news/products.json",JSON.stringify({
  schema:NEWS_PRODUCT_FACTORY_VERSION,count:factoryCount,
  ordered_packet_manifest_sha256:factoryHash.digest("hex"),sample:factorySample,
  full_packet_reader:"/v1/internal/news-product-factory",
  generated_at:archive.snapshot_generated_at,paid_delivery_authorized:false,
})+"\n",{mode:0o600});
console.log(JSON.stringify({
  schema:"geomacro.source-news-json-production-run.v1",
  news_product_factory_packets:factoryCount,
  news_product_factory_expired_during_readback:factoryExpired,
  product_variants_per_news:12,
  source_registry_endpoints:info.registered_source_endpoints,
  supported_registered_sources_by_category:info.supported_registered_sources_by_category,
  actual_observed_country_count_by_category:info.actual_observed_country_count_by_category,
  observed_country_count_is_not_195x3_coverage_certification:true,
  d1_readback_observed_countries_by_category:actualCoverage.actual_observed_countries_by_category,
  d1_readback_missing_countries_by_category:Object.fromEntries(
    Object.entries(actualCoverage.missing_countries_by_category).map(([k,v])=>[k,v.length])),
  d1_readback_observed_country_category_cells:actualCoverage.observed_cells,
  d1_readback_585_cell_completeness_verified:false,
  pinned_presidential_sources_selected:info.pinned_presidential_sources_selected,
  source_poll_slot_minutes:info.nominal_poll_slot_minutes,
  nominal_category_revisit_minutes:info.nominal_max_category_revisit_minutes,
  github_schedule_15m_sla_guaranteed:false,
  initial_source_observation_within_15m:firstSeenWithin15m,
  initial_source_observation_later_than_15m:firstSeenLate15m,
  existing_items_reobserved:reobserved,
  first_seen_latencies_are_independent_original_verification:false,
  source_endpoints_selected:info.selected_source_endpoints,
  max_safe_bundle_items:40,max_safe_bundle_checks:48,
  bounded_bundle_count:groups.length,
  all_collected_items_bundled_without_drops:true,
  source_checks_persisted:checked,
  factual_json_rows_accepted:accepted,
  factual_json_rows_excluded_by_capacity:capacityExcluded,
  news_excluded_by_collector_capacity:info.excluded_by_collector_capacity,
  all_matching_items_captured_within_scanned_feeds:
    info.all_matching_items_captured_within_scanned_feeds&&capacityExcluded===0,
  rolling_database_retention_hours:25,
  source_states:info.source_states,
  d1_private_write_readback:true,public_api_readback:true,
  public_items_page_count:publicBody.items.length,
  original_page_verified:false,source_rights_commercial_authorized:false,
  paid_product_authorized:false,raw_upstream_stored:false,
}));

if(firstSeenLate15m>0||info.nominal_max_category_revisit_minutes>15)
  console.warn("::warning title=15-minute OSINT discovery objective not met::"+
    "late_first_observations="+firstSeenLate15m+
    " nominal_revisit_minutes="+info.nominal_max_category_revisit_minutes+
    " (not independently verified breaking events)");
