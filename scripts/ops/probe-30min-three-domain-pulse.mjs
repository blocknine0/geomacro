#!/usr/bin/env node
/**
 * Best-effort 30-minute original publisher intake, three domains in parallel.
 * This is a real transport/date observation, NOT a signed commercial event.
 * Probe one independent original publisher per domain, with one failover
 * publisher on transport failure. Never bypass 401/403/429 or publisher rights.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {
  EXPANDED_OFFICIAL_SOURCES, probeExpandedSource,
} from "./probe-expanded-official-source-mesh.mjs";
import {classifyPrivateOriginalCandidateDuplicates} from "../lib/private-original-publisher-candidates.mjs";
import {SAFE_PUBLISHER_PAGE_PROBE_CODES} from "../lib/official-original-article-date.mjs";

const INTERVAL_MS=30*60*1000;
export const THIRTY_MIN_PUBLISHER_PAIRS=Object.freeze({
  geopolitics:Object.freeze([
    "un_news_security_original_rss_review",
    "uk_fcdo_original_foreign_policy_atom_review",
  ]),
  macro:Object.freeze([
    "fed_monetary_original_press_rss_review",
    "statcan_prices_original_atom_review",
  ]),
  rare_earth:Object.freeze([
    "nrcan_government_news_original_atom_review",
    "uk_dbt_critical_minerals_atom_pending_review",
    "australia_industry_minister_original_rss_review",
  ]),
});
// Reviewed issuing institutions (not hostnames); this proves distinct
// operator identities for transport diversity, not independently confirmed
// reporting or legal rights for any shared event.
const ORIGINAL_PUBLISHER_ORG=Object.freeze({
  un_news_security_original_rss_review:"united_nations",
  uk_fcdo_original_foreign_policy_atom_review:"united_kingdom_fcdo",
  fed_monetary_original_press_rss_review:"federal_reserve",
  statcan_prices_original_atom_review:"statistics_canada",
  nrcan_government_news_original_atom_review:"natural_resources_canada",
  usgs_minerals_original_news_rss_review:"us_geological_survey",
  uk_dbt_critical_minerals_atom_pending_review:"uk_department_business_trade",
  australia_industry_minister_original_rss_review:"australian_industry_department",
});
const DOMAINS=Object.keys(THIRTY_MIN_PUBLISHER_PAIRS);
const lookup=Object.fromEntries(EXPANDED_OFFICIAL_SOURCES.map(s=>[s.id,s]));

export function select30MinPublishers(now=new Date()) {
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("30M_MONITOR_INVALID_CLOCK");
  const slot=Math.floor(now.getTime()/INTERVAL_MS);
  return Object.fromEntries(DOMAINS.map(domain=>{
    const pair=THIRTY_MIN_PUBLISHER_PAIRS[domain];
    if(![2,3].includes(pair.length)||
       pair.some(id=>lookup[id]?.domain!==domain||!lookup[id]?.original_hosts?.length)||
       new Set(pair).size!==pair.length ||
       pair.some(id=>!ORIGINAL_PUBLISHER_ORG[id]) ||
       new Set(pair.map(id=>ORIGINAL_PUBLISHER_ORG[id])).size!==pair.length)
      throw Error("30M_MONITOR_PUBLISHER_PAIR_INVALID");
    // Two independent official organizations per 30m window, including when
    // primary already has new items. A third minerals organization rotates
    // into the pair, rather than tripling per-run origin GET traffic.
    const idx=slot%pair.length;
    const current=lookup[pair[idx]];
    const next=lookup[pair[(idx+1)%pair.length]];
    return [domain,[current,next]];
  }));
}
function safeInt(x) {return Number.isSafeInteger(x)&&x>=0?x:null}
export async function probe30MinThreeDomainPulse({now=new Date(),probe=probeExpandedSource}={}) {
  const pairs=select30MinPublishers(now);
  const slot=Math.floor(now.getTime()/INTERVAL_MS);
  const rows=await Promise.all(DOMAINS.map(async domain=>{
    const [primary,standby]=pairs[domain];
    const attempted=[];
    async function observe(source){
      attempted.push(source.id);
      // Source-specific transport failure is an unknown, not zero news.
      // Open discovery: no topical/keyword gate before capturing a dated,
      // fixed-host first-party article. Semantic relevance is assessed later.
      try { return await probe(source,{now,collectPrivateCandidates:true,openDiscovery:true}); }
      catch { return {source_id:source.id,domain,format_valid:false,primary_http_status:null}; }
    }
    const valid=(result,source)=>result?.format_valid===true &&
      result?.publisher_reachable===true && result?.domain===domain &&
      result?.source_id===source.id &&
      [result.original_publisher_topical_30m,
       result.original_publisher_topical_90m,
       result.original_publisher_topical_6h].every(x=>safeInt(x)!==null) &&
      result.original_publisher_topical_30m<=result.original_publisher_topical_90m &&
      result.original_publisher_topical_90m<=result.original_publisher_topical_6h;
    const first=await observe(primary);
    const firstValid=valid(first,primary);
    let second=null,secondValid=false;
    // Always probe the second independent originating publisher when primary
    // transport succeeds, INCLUDING if the primary already had topical items:
    // previously this skipped independent discovery during busy news windows.
    // For degraded primary origins, do not reroute explicit 401/403/429.
    // A second publisher is a separate source, not verified same-event proof.
    if(firstValid || ![401,403,429].includes(first.primary_http_status)) {
      second=await observe(standby);
      secondValid=valid(second,standby);
    }
    const observed=[...(firstValid?[first]:[]),...(secondValid?[second]:[])];
    const healthy=observed.length>0;
    const count=healthy?observed.reduce((n,x)=>n+x.original_publisher_topical_30m,0):null;
    const ninety=healthy?observed.reduce((n,x)=>n+x.original_publisher_topical_90m,0):null;
    const sixh=healthy?observed.reduce((n,x)=>n+x.original_publisher_topical_6h,0):null;
    const complete=firstValid&&secondValid;
    // Numeric-only original feed diagnosis: every source ID is a pinned,
    // first-party original issuer, never a title, article URL or raw text.
    const issueFields=[
      "entries_parsed","item_native_published_missing",
      "item_native_published_invalid_or_future",
      "original_article_link_rejected",
      "item_native_published_invalid_date","item_native_published_future_date",
      "original_article_link_wrong_host","original_article_link_wrong_path",
      "original_article_link_other_invalid",
      "accepted_first_party_older_than_7d",
      "accepted_first_party_native_dated",
    ];
    // Stable coarse shape and permitted verifier enums only; no timestamp
    // string, headline, URL, HTML, HTTP body or upstream diagnostic text.
    const dateShapes=[
      "CDATA_WRAPPER","RFC_ALPHA_ZONE","RFC_OTHER_ZONE",
      "ISO_LIKE","SLASH_DATE_LIKE","OTHER",
    ];
    const sourceRecoveryDiagnostics=observed.map(item=>({
      source_id:item.source_id,
      rss_invalid_date_shapes:item.unparseable_native_rss_date_shapes
        ?Object.fromEntries(dateShapes.map(k=>[k,
          safeInt(item.unparseable_native_rss_date_shapes[k])]))
        :null,
      original_page_checked:safeInt(item.original_page_precise_date_checks),
      original_page_verified:safeInt(item.original_page_precise_date_24h),
      atom_undated_valid_article_link_candidates:
        safeInt(item.undated_atom_article_link_candidates),
      original_page_result_codes:Object.fromEntries(
        SAFE_PUBLISHER_PAGE_PROBE_CODES.map(code=>[code,
          safeInt(item.first_party_original_page_probe_codes?.[code])??0])),
    }));
    const sourceItemDiagnostics=observed.map(item=>({
      source_id:item.source_id,
      ...Object.fromEntries(issueFields.map(key=>[
        key,safeInt(item.source_item_provenance_diagnostics?.[key])===null
          ?null:item.source_item_provenance_diagnostics[key],
      ])),
    }));
    // These counts are *source-native publisher articles*, including
    // non-topic titles; 7d observations are NOT current 24h developments.
    const open24=healthy && observed.every(x=>safeInt(x.original_publisher_open_24h_count)!==null)
      ?observed.reduce((n,x)=>n+x.original_publisher_open_24h_count,0):null;
    const open7d=healthy && observed.every(x=>safeInt(x.source_native_7d_release_items)!==null)
      ?observed.reduce((n,x)=>n+x.source_native_7d_release_items,0):null;
    if(healthy && (!Number.isSafeInteger(count) || !Number.isSafeInteger(ninety) ||
       !Number.isSafeInteger(sixh) || count>1000 || ninety>1000 || sixh>1000))
      throw Error("30M_MONITOR_AGGREGATE_INVALID");
    return {
      domain,
      status:healthy?"ORIGINAL_PUBLISHER_DATE_OBSERVED":"SOURCE_TRANSPORT_DEGRADED",
      original_publisher_id:healthy?observed[0].source_id:null,
      primary_publisher_id:primary.id,
      publisher_failover_attempted:attempted.length===2&&!firstValid,
      publisher_zero_result_expansion_attempted:attempted.length===2&&firstValid&&first.original_publisher_topical_30m===0,
      independent_origin_crosscheck_attempted:attempted.length===2&&firstValid,
      independent_origin_pair_transport_healthy:complete,
      original_publishers_attempted:attempted.length,
      original_publishers_successful:observed.length,
      publisher_pair_sample_complete:complete,
      // Counts refer to originating publisher ITEMS, never de-duplicated
      // same-event intelligence. Do not promote counts to news or GRO.
      original_publisher_30m_topic_count:count,
      original_publisher_90m_topic_count:ninety,
      original_publisher_6h_topic_count:sixh,
      original_publisher_all_topics_24h_count:open24,
      original_publisher_all_topics_7d_count:open7d,
      source_item_provenance_diagnostics:sourceItemDiagnostics,
      source_feed_recovery_diagnostics:sourceRecoveryDiagnostics,
      open_discovery_keyword_gate_enabled:false,
      articles_captured_before_relevance_classification:true,
      unclassified_original_articles_are_verified_events:false,
      no_new_30m_original_topic_item_observed:healthy&&complete&&count===0,
      checked_at:now.toISOString(),
      // Private hashed article identities; never the raw news or a GRO.
      private_original_article_candidates:observed.flatMap(r=>r.private_original_article_candidates??[]).slice(0,80),
      // Two healthy originating publishers ≠ confirmation of one real event.
      event_same_subject_independent_corroboration_verified:false,
      commercial_rights_verified:false,
      signed_current_gro_verified:false,
      chargeable_intelligence_ready:false,
    };
  }));
  const status=rows.every(row=>row.status==="ORIGINAL_PUBLISHER_DATE_OBSERVED")
    ?"THREE_DOMAIN_ORIGINAL_PUBLISHER_TRANSPORT_OBSERVED":"THREE_DOMAIN_SOURCE_TRANSPORT_DEGRADED";
  const candidates=rows.flatMap(row=>row.private_original_article_candidates);
  if(candidates.length>240) throw Error("PRIVATE_ORIGINAL_CANDIDATE_BURST_INVALID");
  const privateCandidateDedup=classifyPrivateOriginalCandidateDuplicates(candidates);
  return {
    schema:"geomacro.private-three-domain-source-pulse-30m.v1",
    observed_at:now.toISOString(),
    target_poll_minutes:30,
    schedule_guaranteed:false,
    utc_slot_start:new Date(slot*INTERVAL_MS).toISOString(),
    status,
    // Stronger cross-original transport health is separate from basic
    // per-category first-party visibility; it never proves same-event review.
    independent_origin_pairs_healthy:rows.every(row=>row.independent_origin_pair_transport_healthy===true),
    source_domains_observed:DOMAINS,
    actual_original_publisher_rows:rows,
    private_original_candidate_dedup:privateCandidateDedup,
    open_original_discovery_enabled:true,
    original_article_keyword_admission_required:false,
    original_article_source_native_clock_required:true,
    source_catalog_entries_are_not_events:true,
    independently_verified_current_intelligence_count:0,
    user_api_delivery_verified:false,
    publisher_rights_verified:false,
    b2_reads:0,b2_writes:0,d1_writes:0,supabase_requests:0,
    payments_performed:0,
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const result=await probe30MinThreeDomainPulse();
    mkdirSync("artifacts/private-intake",{recursive:true});
    writeFileSync("artifacts/private-intake/three-domain-30m-source-pulse.json",
      JSON.stringify(result,null,2)+"\n",{mode:0o600});
    console.log(JSON.stringify(result));
    if(result.status!=="THREE_DOMAIN_ORIGINAL_PUBLISHER_TRANSPORT_OBSERVED")
      process.exitCode=3;
  }catch{
    console.error("::error::THREE_DOMAIN_30M_SOURCE_PULSE_INTERNAL_FAILURE");
    process.exitCode=2;
  }
}
