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
import {privateOsintRuntimeSources,COUNTRY_DISCOVERY_NOMINAL_CYCLE_MINUTES,COUNTRY_DISCOVERY_LOCAL_LANE_CYCLE_MINUTES,COUNTRY_DISCOVERY_HUB_LOCAL_CYCLE_MINUTES,COUNTRY_DISCOVERY_HUB_NOMINAL_CYCLE_MINUTES} from "./private-osint-country-rotation.mjs";
import {privateOsintGlobalSources,PRIVATE_OSINT_TOPICS,privateOsintContinentCoverage,privateOsintCorridorReferenceCoverage,privateOsintPublisherCountryCoverage,privateOsintCountryCategoryCoverage,privateOsintCorridorSourceCoverage,privateOsintCategoryLiveCoverage} from "./private-osint-global-sources.mjs";
export const PRIVATE_OSINT_TARGET_MINUTES=15;
export const PRIVATE_OSINT_POLL_MINUTES=5;
export const PRIVATE_OSINT_MAX_SOURCES=512;
export const PRIVATE_OSINT_MAX_RESULTS_PER_TICK=768;
const DOMAINS=["geopolitics","macro","rare_earth"];
/**
 * Under a true >768-item burst, an intensely covered country must not starve
 * another country which has genuinely observed dated source items.
 * Fairness uses the existing conservative title-based country attribution,
 * never guesses a country from source publisher or index-query location.
 * The normal non-overflow newest-first ordering remains unchanged.
 */
function roundRobinAttributedCountries(items){
 const groups=new Map();
 for(const item of items){
  const country=/^[A-Z]{3}$/u.test(item.country_iso3??"")?
   item.country_iso3:"UNATTRIBUTED";
  if(!groups.has(country))groups.set(country,[]);
  groups.get(country).push(item);
 }
 if(groups.size<2)return items;
 const cohorts=[...groups.values()],result=[];
 for(let n=0;result.length<items.length;n++)
  for(const cohort of cohorts)if(cohort[n])result.push(cohort[n]);
 return result;
}

const FEED_REDIRECT_STATUSES=new Set([301,302,303,307,308]);
const normalizedPublicFeedHost=host=>{
 const lower=host.toLowerCase();
 return lower.startsWith("www.")?lower.slice(4):lower;
};
function safeFeedRedirect(from,to){
 let target;try{target=new URL(to,from)}catch{return null}
 const host=target.hostname.toLowerCase();
 const labels=host.split(".");
 const isIpv4=labels.length===4&&labels.every(label=>label.length>0&&label.length<=3&&
   [...label].every(char=>char>="0"&&char<="9")&&Number(label)<=255);
 if(target.protocol!=="https:"||target.username||target.password||target.port||target.hash||
    !host.includes(".")||normalizedPublicFeedHost(host)!==normalizedPublicFeedHost(from.hostname)||
    host==="localhost"||["local","internal","test","invalid"].some(suffix=>host.endsWith("."+suffix))||
    isIpv4||host.startsWith("["))return null;
 return target;
};
/**
 * Some official publisher RSS endpoints redirect to their canonical same-host
 * URL. Follow at most three HTTPS redirects, allowing only exact host or the
 * same host with/without www. This avoids dropping readable feeds while
 * refusing cross-site redirect chains or protocol downgrades. No redirects
 * are used for article URLs; this is only the pinned feed transport.
 */
async function fetchPrivateFeedSafely(url,options,fetchImpl){
 const original=new URL(url);
 let current=original,didRedirect=false;
 const headers=new Headers(options?.headers??{});
 if(!headers.has("user-agent"))headers.set("user-agent","GeomacroOSINT/1.0 (+https://geomacro.live)");
 for(let hop=0;hop<=3;hop++){
  const response=await fetchImpl(current.href,{...options,headers,redirect:"manual"});
  if(!FEED_REDIRECT_STATUSES.has(response.status)){
   if(didRedirect&&response.status===200)
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers:response.headers});
   return response;
  }
  const location=response.headers.get("location");
  if(!location||hop===3)return response;
  const next=safeFeedRedirect(current,location);
  if(!next)return new Response(null,{status:502});
  try{await response.body?.cancel()}catch{}
  current=next;didRedirect=true;
 }
 return new Response(null,{status:502});
}
export async function collectPrivateOsint15m({
  now=new Date(),fetchImpl=fetch,registry=privateOsintRuntimeSources(now),
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
  const privateFetch=(url,options)=>fetchPrivateFeedSafely(url,
    new URL(url).hostname==="news.google.com"?
      {...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(3500)])}:options,
    fetchImpl);
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
          deduplicateIndexItems:true,
          onOriginalCandidate:source.private_discovery_index_only?null:onOriginalCandidate,
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
    const fresh=roundRobinAttributedCountries(domainItems.filter(x=>
      Date.parse(x.source.original_published_at)>=cutoff));
    const late=roundRobinAttributedCountries(domainItems.filter(x=>
      Date.parse(x.source.original_published_at)<cutoff));
    if(!fresh.length||!late.length)return roundRobinAttributedCountries(domainItems);
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
      rotating_country_index_sources_this_tick:registry.filter(s=>s.private_discovery_index_only===true).length,
      rotating_country_index_nominal_full_cycle_minutes:
        registry.some(s=>s.private_hub_overlay===true)?
          (registry.some(s=>s.private_country_local_candidate===true)?
            COUNTRY_DISCOVERY_HUB_LOCAL_CYCLE_MINUTES:COUNTRY_DISCOVERY_HUB_NOMINAL_CYCLE_MINUTES):
        registry.some(s=>s.private_country_local_candidate===true)?
          COUNTRY_DISCOVERY_LOCAL_LANE_CYCLE_MINUTES:COUNTRY_DISCOVERY_NOMINAL_CYCLE_MINUTES,
      global_multilateral_hub_candidates_this_tick:
        registry.filter(s=>s.private_hub_overlay===true).length,
      global_multilateral_hubs_live_verified_by_registration:false,
      local_publisher_candidate_endpoints_this_tick:
        registry.filter(s=>s.private_country_local_candidate===true).length,
      local_publisher_country_candidates_this_tick:new Set(registry
        .filter(s=>s.private_country_local_candidate===true)
        .map(s=>s.publisher_country_iso3)).size,
      local_publisher_native_time_and_category_required:true,
      publisher_country_does_not_assign_event_country:true,
      rotating_country_index_is_not_original_publisher:true,
      rotating_country_index_does_not_supply_event_country:true,
      source_checks:checks.size,source_states:count,
      index_items_deduplicated_across_queries:true,
      working_source_endpoints:registry.filter(s=>s.categories.some(category=>
        [...checks.values()].some(c=>c.source_ref===sourceRef(s,category)&&
          ["OBSERVED","EMPTY_OR_OUTSIDE_WINDOW"].includes(c.state)))).length,
      category_live_source_coverage:privateOsintCategoryLiveCoverage(registry,[...checks.values()],all),
      continent_coverage:privateOsintContinentCoverage(registry,[...checks.values()],all),
      publisher_country_source_coverage:privateOsintPublisherCountryCoverage(registry,[...checks.values()]),
      country_category_source_coverage:privateOsintCountryCategoryCoverage(registry,[...checks.values()],all),
      corridor_discovery_reference_coverage:privateOsintCorridorReferenceCoverage(),
      corridor_source_coverage:privateOsintCorridorSourceCoverage(registry,[...checks.values()]),
      discovered_within_15m_native_clock:recent.length,
      discovered_after_15m_native_clock:all.length-recent.length,
      selected_after_15m_native_clock:selected.filter(x=>
        Date.parse(x.source.original_published_at)<cutoff).length,
      late_arrivals_not_rejected_by_15m_cutoff:true,
      overflow_selection_fair_to_attributed_countries:true,
      title_based_country_matching_is_not_independent_geolocation:true,
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
