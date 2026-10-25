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
import {registeredReusableNewsSources,collectRegisteredReusableNews} from "./registered-reusable-news-source-collector.mjs";
export const PRIVATE_OSINT_TARGET_MINUTES=15;
export const PRIVATE_OSINT_POLL_MINUTES=5;
export const PRIVATE_OSINT_MAX_SOURCES=120;
export const PRIVATE_OSINT_MAX_RESULTS_PER_TICK=320;
const DOMAINS=["geopolitics","macro","rare_earth"];
export async function collectPrivateOsint15m({
  now=new Date(),fetchImpl=fetch,registry=registeredReusableNewsSources(),
  normalize,resolveCountry,concurrency=4,
}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
     !Array.isArray(registry)||registry.length<1||
     registry.length>PRIVATE_OSINT_MAX_SOURCES||
     typeof normalize!=="function"||typeof resolveCountry!=="function"||
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
  // Groups of 6 guarantee selectRegisteredNewsSources(... perCategory=8)
  // checks ALL sources in each group regardless of 15-minute rotation.
  const groups=[];
  for(let i=0;i<registry.length;i+=6)groups.push(registry.slice(i,i+6));
  const responses=Array(groups.length);let cursor=0;
  const worker=async()=>{
    while(cursor<groups.length){
      const index=cursor++;
      responses[index]=await collectRegisteredReusableNews({
        now,fetchImpl,registry:groups[index],perCategory:8,normalize,resolveCountry,
        // Outer worker count is the global network cap for PRIVATE OSINT;
        // avoid multiplying by reusable public-reader inner parallelism.
        networkConcurrency:1,
      });
    }
  };
  await Promise.all(Array.from({length:Math.min(concurrency,groups.length)},worker));
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
  return {
    schema:"geomacro.private-osint-15m-batch.v1",
    items:all.slice(0,PRIVATE_OSINT_MAX_RESULTS_PER_TICK),
    checks:[...checks.values()],
    summary:{
      configured_country_routes:195,configured_categories:3,configured_country_category_routes:585,
      registered_source_endpoints:registry.length,source_endpoints_attempted:registry.length,
      source_checks:checks.size,source_states:count,
      discovered_within_15m_native_clock:recent.length,
      factual_items_25h:all.length,excluded_by_capacity:Math.max(0,all.length-PRIVATE_OSINT_MAX_RESULTS_PER_TICK)+collectorExcluded,
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
