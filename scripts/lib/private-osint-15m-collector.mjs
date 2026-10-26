/**
 * Private, bounded global OSINT monitor. All already registered, pinned
 * HTTPS news feed endpoints are checked in small parallel batches on each
 * 5-minute best-effort invocation. Global 195-country routing is TITLE
 * MATCHING ONLY, not a false assertion that 585 local feeds exist.
 *
 * Reuse the existing noncommercial factual tag extractor and 25h native
 * source-clock window, with NO original texts, titles, links or scraped
 * article bodies persisted. Never promote OSINT to verified/paid news.
 */
import {collectRegisteredReusableNews} from "./registered-reusable-news-source-collector.mjs";
import {privateOsintGlobalSources,PRIVATE_OSINT_TOPICS,privateOsintContinentCoverage,privateOsintCorridorReferenceCoverage,privateOsintPublisherCountryCoverage,privateOsintCountryCategoryCoverage} from "./private-osint-global-sources.mjs";
export const PRIVATE_OSINT_TARGET_MINUTES=15;
export const PRIVATE_OSINT_POLL_MINUTES=5;
export const PRIVATE_OSINT_MAX_SOURCES=512;
export const PRIVATE_OSINT_MAX_RESULTS_PER_TICK=768;
const DOMAINS=["geopolitics","macro","rare_earth"];
export async function collectPrivateOsint15m({
  now=new Date(),fetchImpl=fetch,registry=privateOsintGlobalSources(),
  normalize,resolveCountry,concurrency=8,onOriginalCandidate=null,
}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
     !Array.isArray(registry)||registry.length<1||
     registry.length>PRIVATE_OSINT_MAX_SOURCES||
     typeof normalize!=="function"||typeof resolveCountry!=="function"||
     !(onOriginalCandidate===null||typeof onOriginalCandidate==="function")||
     !Number.isSafeInteger(concurrency)||concurrency<1||concurrency>8)
    throw Error("PRIVATE_OSINT_COLLECTOR_CONFIG_INVALID");
  const seenUrls=new Set();
  for(const source of registry){
    if(!source||typeof source.url!=="string"||!source.url.startsWith("https://")||
       seenUrls.has(source.url)||!Array.isArray(source.categories)||
       source.categories.length<1||source.categories.some(x=>!DOMAINS.includes(x)))
      throw Error("PRIVATE_OSINT_SOURCE_NOT_REGISTERED");
    seenUrls.add(source.url);
  }
  // Check every accepted endpoint, with eight global and two per-host slots.
  // A large news-index catalogue must not block unrelated original publishers.
  const responses=Array(registry.length),running=new Set(),hosts=new Map();
  const pending=registry.map((source,index)=>({source,index,host:new URL(source.url).hostname}));
  const privateFetch=(url,options)=>fetchImpl(url,new URL(url).hostname==="news.google.com"?
    {...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(3500)])}:options);
  try{
    while(pending.length||running.size){
      while(running.size<concurrency){
        const next=pending.findIndex(p=>(hosts.get(p.host)??0)<2);
        if(next<0)break;
        const {source,index,host}=pending.splice(next,1)[0];
        hosts.set(host,(hosts.get(host)??0)+1);
        let task;
        task=collectRegisteredReusableNews({
          now,fetchImpl:privateFetch,registry:[source],perCategory:8,normalize,resolveCountry,
          networkConcurrency:1,topicPatterns:PRIVATE_OSINT_TOPICS,
          allowRdfNativeDates:true,maxFeedBytes:1024*1024,
          deduplicateIndexItems:true,onOriginalCandidate,
        }).then(r=>{responses[index]=r}).finally(()=>{
          hosts.set(host,hosts.get(host)-1);running.delete(task);
        });
        running.add(task);
      }
      if(running.size)await Promise.race(running);
    }
  }catch(error){await Promise.allSettled(running);throw error}
  const dedup=new Map(),checks=new Map(),count={};
  let collectorExcluded=0;
  for(const r of responses){
    collectorExcluded+=r.summary.excluded_by_collector_capacity;
    for(const check of r.checks){
      if(checks.has(check.source_ref))throw Error("PRIVATE_OSINT_DUPLICATE_SOURCE_CHECK");
      checks.set(check.source_ref,check);
      count[check.state]=(count[check.state]??0)+1;
    }
    for(const item of r.items){
      if(!dedup.has(item.id))dedup.set(item.id,item);
    }
  }
  const all=[...dedup.values()].sort((a,b)=>b.source.original_published_at.localeCompare(a.source.original_published_at)||a.id.localeCompare(b.id));
  const recent=all.filter(x=>Date.parse(x.source.original_published_at)>=now.getTime()-PRIVATE_OSINT_TARGET_MINUTES*60_000);
  // A burst of fresh headlines must not starve previously unseen news
  // arriving >15 minutes after its publisher-native clock. In a bounded
  // overflow, reserve every fifth per-category selection for eligible late
  // items; keep newest-first behavior unchanged when no overflow exists.
  const cutoff=now.getTime()-PRIVATE_OSINT_TARGET_MINUTES*60_000;
  const lanes=DOMAINS.map(category=>{
    const domainItems=all.filter(x=>x.category===category);
    if(all.length<=PRIVATE_OSINT_MAX_RESULTS_PER_TICK)return domainItems;
    const fresh=domainItems.filter(x=>Date.parse(x.source.original_published_at)>=cutoff);
    const late=domainItems.filter(x=>Date.parse(x.source.original_published_at)<cutoff);
    if(!fresh.length||!late.length)return domainItems;
    const mixed=[];
    let fi=0,li=0;
    while(fi<fresh.length||li<late.length){
      for(let n=0;n<4&&fi<fresh.length;n++)mixed.push(fresh[fi++]);
      if(li<late.length)mixed.push(late[li++]);
      if(fi===fresh.length&&li<late.length){mixed.push(...late.slice(li));break}
    }
    return mixed;
  }),selected=[];
  for(let n=0;selected.length<PRIVATE_OSINT_MAX_RESULTS_PER_TICK&&lanes.some(l=>n<l.length);n++)
    for(const lane of lanes)if(lane[n]&&selected.length<PRIVATE_OSINT_MAX_RESULTS_PER_TICK)selected.push(lane[n]);
  return {
    schema:"geomacro.private-osint-15m-batch.v1",
    items:selected.sort((a,b)=>b.source.original_published_at.localeCompare(a.source.original_published_at)||a.id.localeCompare(b.id)),
    checks:[...checks.values()],
    summary:{
      configured_country_routes:195,configured_categories:3,configured_country_category_routes:585,
      registered_source_endpoints:registry.length,source_endpoints_attempted:registry.length,
      source_checks:checks.size,source_states:count,
      index_items_deduplicated_across_queries:true,
      working_source_endpoints:registry.filter(s=>s.categories.some(category=>
        [...checks.values()].some(c=>c.source_ref===sourceRef(s,category)&&
          ["OBSERVED","EMPTY_OR_OUTSIDE_WINDOW"].includes(c.state)))).length,
      continent_coverage:privateOsintContinentCoverage(registry,[...checks.values()],all),
      publisher_country_source_coverage:privateOsintPublisherCountryCoverage(registry,[...checks.values()]),
      country_category_source_coverage:privateOsintCountryCategoryCoverage(registry,[...checks.values()],all),
      corridor_discovery_reference_coverage:privateOsintCorridorReferenceCoverage(),
      discovered_within_15m_native_clock:recent.length,
      discovered_after_15m_native_clock:all.length-recent.length,
      selected_after_15m_native_clock:selected.filter(x=>
        Date.parse(x.source.original_published_at)<cutoff).length,
      late_arrivals_not_rejected_by_15m_cutoff:true,
      factual_items_25h:all.length,excluded_by_capacity:Math.max(0,all.length-PRIVATE_OSINT_MAX_RESULTS_PER_TICK)+collectorExcluded,
      selected_items_by_category:Object.fromEntries(DOMAINS.map(c=>[c,selected.filter(x=>x.category===c).length])),
      excluded_items_by_category:Object.fromEntries(DOMAINS.map(c=>[c,all.filter(x=>x.category===c).length-selected.filter(x=>x.category===c).length])),
      first_discovery_latency_measured_at_d1:false,
      independent_verification_required_for_ingestion:false,
      each_country_has_a_registered_feed:false,
      all_world_breaking_claimed:false,real_time_guaranteed:false,
      source_clock_independently_verified:false,
      source_original_page_independently_verified:false,
      confidential_private_osint_only:true,
      telegram_public_channel_scraping:false,
      publicly_served:false,rights_verified:false,signed:false,chargeable:false,
    },
  };
}
import {createHash} from "node:crypto";
const sourceRef=(s,c)=>createHash("sha256").update([s.id,s.url,c].join("\n")).digest("hex");
