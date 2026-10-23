#!/usr/bin/env node
// Additional official-publisher release/structural observation lane.
// Read-only and PRIVATE: never a scoring, rights, B2, D1, Supabase or x402
// writer. Source polling success is NOT event occurrence or 195-country proof.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fetchVerifiedPublisherPageDate, ORIGINAL_ARTICLE_MAX_PROBES_PER_DOMAIN, SAFE_PUBLISHER_PAGE_PROBE_CODES, SAFE_ORIGINAL_PAGE_DATE_REASONS } from "../lib/official-original-article-date.mjs";
import { originalPublisherPrivateCandidates, originalPublisherPrivatePageDateCandidate } from "../lib/private-original-publisher-candidates.mjs";
import { officialOriginalRssArticleUrl } from "../lib/official-rss-original-link.mjs";
import { officialItemNativePublicationMs } from "../lib/official-native-item-publication-date.mjs";
import { observeUndatedFirstPartyAtomFeed } from "../lib/private-undated-feed-observations.mjs";
import { isQuarantinedOfficialRoute, quarantinedOfficialSourceReceipt } from "../lib/official-source-quarantine.mjs";

const MAX_BODY_BYTES=192*1024;
// Eurostat twice-daily official catalogue feed can exceed the small news-RSS
// ceiling. Explicit one-source 1 MiB hard cap; never allow unlimited bodies.
const EUROSTAT_MAX_BODY_BYTES=1024*1024;
const DAY_MS=86_400_000;
const SIX_HOURS_MS=6*60*60*1000;
const NINETY_MINUTES_MS=90*60*1000;
const THIRTY_MINUTES_MS=30*60*1000;
export const EXPANDED_OFFICIAL_SOURCES=Object.freeze([
  Object.freeze({
    id:"eu_sanctions_guidance_official_rss_review",
    domain:"geopolitics",kind:"policy_guidance_release",
    url:"https://finance.ec.europa.eu/node/1296/rss_en",
    media:"rss",rights:"UNVERIFIED",poll:"six_hourly",
    event_intelligence:false,country_coverage_verified:false,
  }),
  Object.freeze({
    id:"ecb_statistical_press_official_rss_review",
    domain:"macro",kind:"statistical_press_release",
    url:"https://www.ecb.europa.eu/rss/statpress.html",
    media:"rss",rights:"UNVERIFIED",poll:"six_hourly",
    event_intelligence:false,country_coverage_verified:false,
  }),
  Object.freeze({
    id:"eurostat_stats_update_official_rss_review",
    domain:"macro",kind:"statistical_dataset_release",
    url:"https://ec.europa.eu/eurostat/api/dissemination/catalogue/rss/en/statistics-update.rss",
    // Same originating publisher, NOT independent corroboration. One alternate
    // only for a primary 404 or server-side error (never a 401/403/429 bypass).
    alternate_url:"https://ec.europa.eu/eurostat/api/dissemination/catalogue/rss/de/statistics-update.rss",
    media:"rss",rights:"UNVERIFIED",poll:"six_hourly",
    event_intelligence:false,country_coverage_verified:false,
  }),
  Object.freeze({
    id:"eiti_implementing_country_official_api_review",
    domain:"rare_earth",kind:"structural_extractives_country_metadata",
    url:"https://eiti.org/api/v2.0/implementing_country",
    media:"json",rights:"UNVERIFIED",poll:"six_hourly",
    event_intelligence:false,country_coverage_verified:false,
  }),
  Object.freeze({
    id:"eu_official_featured_news_minerals_private_rss_review",
    domain:"rare_earth",kind:"cross_sector_original_publisher_link_discovery",
    url:"https://european-union.europa.eu/node/309/rss_en",
    media:"rss",rights:"UNVERIFIED",poll:"six_hourly",
    event_intelligence:false,country_coverage_verified:false,
    topic:/\b(?:critical raw materials?|rare[- ]earths?|lithium|cobalt|nickel|graphite|gallium|germanium|tungsten|magnesium|strategic minerals?|mineral (?:supply|projects?|security))\b/iu,
  }),
  Object.freeze({
    id:"nrcan_simply_science_official_rss_review",
    domain:"rare_earth",kind:"natural_resources_science_release",
    url:"https://natural-resources.canada.ca/simply-science/rss.xml",
    media:"rss",rights:"UNVERIFIED",poll:"six_hourly",
    event_intelligence:false,country_coverage_verified:false,
  }),
  // Additional independent original publisher lanes. Existing EITI and
  // Simply Science failures remain observable; never silently replace them.
  Object.freeze({
    id:"un_news_security_original_rss_review",
    domain:"geopolitics",kind:"original_publisher_peace_security_release",
    url:"https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml",
    // Same UN News publisher, not an independent corroborator. One bounded
    // fallback for a transport error/404/5xx; never on 401/403/429.
    alternate_url:"https://news.un.org/feed/subscribe/en/news/all/rss.xml",
    network_fallback_same_publisher:true,
    media:"rss",rights:"UNVERIFIED",poll:"six_hourly",
    event_intelligence:false,country_coverage_verified:false,
    original_hosts:Object.freeze(["news.un.org"]),
    topic:/\b(?:security council|ceasefire|sanctions?|conflict|war|airstrikes?|military|peace talks|peacekeeping|armed groups?|displacement|border)\b/iu,
  }),
  Object.freeze({
    id:"statcan_prices_original_atom_review",
    domain:"macro",kind:"original_publisher_prices_release",
    url:"https://www150.statcan.gc.ca/n1/rss/dai-quo/18-eng.atom",
    media:"atom",rights:"UNVERIFIED",poll:"six_hourly",
    event_intelligence:false,country_coverage_verified:false,
    original_hosts:Object.freeze(["www150.statcan.gc.ca","www.statcan.gc.ca"]),
    topic:/\b(?:consumer prices?|producer prices?|price index|price indices|inflation|cost of living|industrial product price|raw materials price)\b/iu,
  }),
  Object.freeze({
    id:"nrcan_government_news_original_atom_review",
    domain:"rare_earth",kind:"original_publisher_government_minerals_release",
    url:"https://api.io.canada.ca/io-server/gc/news/en/v2?dept=naturalresourcescanada&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=50&format=atom&atomtitle=Natural%20Resources%20Canada",
    media:"atom",rights:"UNVERIFIED",poll:"six_hourly",
    event_intelligence:false,country_coverage_verified:false,
    original_hosts:Object.freeze(["www.canada.ca","canada.ca","natural-resources.canada.ca"]),
    topic:/\b(?:critical minerals?|critical raw materials?|rare[- ]earths?|lithium|cobalt|nickel|graphite|gallium|germanium|neodymium|dysprosium|terbium|strategic minerals?|mining|minerals? (?:supply|production|processing|trade|projects?|sector))\b/iu,
  }),
  // Additional original *publisher* sources, three independent public
  // institutions. RSS discoverability is NEVER commercial licensing.
  // These sources are standalone bounded probes; cannot bypass existing
  // blocked EITI / Simply Science status or generate risk scores.
  Object.freeze({
    id:"uk_fcdo_original_foreign_policy_atom_review",
    domain:"geopolitics",kind:"original_publisher_uk_foreign_policy",
    // UN Geneva feed timed out in the real PR runner. FCDO has a publicly
    // reachable government first-party Atom URL, no off-domain fallback.
    url:"https://www.gov.uk/government/organisations/foreign-commonwealth-development-office.atom",
    media:"atom",rights:"UNVERIFIED",poll:"ninety_minutes",
    event_intelligence:false,country_coverage_verified:false,
    original_hosts:Object.freeze(["www.gov.uk","gov.uk"]),
    topic:/\b(?:security council|ceasefire|armed conflict|sanctions?|conflict|peace talks|war|diplomatic|foreign policy|disarmament|human rights|border|peacekeeping|military|humanitarian crisis|displacement|attacks?|defence|foreign secretary)\b/iu,
  }),
  Object.freeze({
    id:"fed_monetary_original_press_rss_review",
    domain:"macro",kind:"original_publisher_central_bank_monetary_release",
    url:"https://www.federalreserve.gov/feeds/press_all.xml",
    // Monetary Policy is a separately published first-party Fed RSS feed.
    // Real production observed press_all HTTP 404; retry the exact official
    // monetary feed only on primary transport failure/404/5xx, never 401,
    // 403 or 429, and never treat it as a second independent issuer.
    alternate_url:"https://www.federalreserve.gov/feeds/press_monetary.xml",
    network_fallback_same_publisher:true,
    media:"rss",rights:"UNVERIFIED",poll:"ninety_minutes",
    event_intelligence:false,country_coverage_verified:false,
    original_hosts:Object.freeze(["www.federalreserve.gov","federalreserve.gov"]),
    topic:/\b(?:interest rates?|federal funds|monetary policy|inflation|economic activity|financial stability|foreign exchange|currency|central bank|discount rate|FOMC|liquidity|supervision|banking regulation)\b/iu,
  }),
  Object.freeze({
    id:"usgs_minerals_original_news_rss_review",
    domain:"rare_earth",kind:"original_publisher_mineral_resources_release",
    url:"https://www.usgs.gov/news/minerals/feed",
    media:"rss",rights:"UNVERIFIED",poll:"ninety_minutes",
    event_intelligence:false,country_coverage_verified:false,
    original_hosts:Object.freeze(["www.usgs.gov","usgs.gov"]),
    topic:/\b(?:critical minerals?|critical raw materials?|rare[- ]earths?|lithium|cobalt|nickel|graphite|gallium|germanium|copper|tungsten|mineral deposits?|mining|rare earth elements?|mineral supply|strategic minerals?)\b/iu,
  }),
  // Australian Government ministerial release feed, independently published
  // from USGS/NRCan. Public RSS subscription is not commercial rights proof.
  Object.freeze({
    id:"australia_industry_minister_original_rss_review",
    domain:"rare_earth",kind:"original_publisher_australian_industry_minerals_release",
    url:"https://www.minister.industry.gov.au/feed/t-ayres/rss.xml",
    media:"rss",rights:"UNVERIFIED",poll:"ninety_minutes",
    event_intelligence:false,country_coverage_verified:false,
    original_hosts:Object.freeze(["www.minister.industry.gov.au"]),
    topic:/\b(?:critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|gallium|germanium|copper|strategic minerals?|mineral supply|mineral processing|mineral project|mining projects?|Arafura)\b/iu,
  }),
  // Independent UK Department for Business and Trade official publisher.
  // Private discovery only; free RSS does NOT imply commercial rights.
  Object.freeze({
    id:"uk_dbt_critical_minerals_atom_pending_review",
    domain:"rare_earth",kind:"original_publisher_uk_critical_minerals",
    url:"https://www.gov.uk/government/organisations/department-for-business-and-trade.atom",
    media:"atom",rights:"UNVERIFIED",poll:"ninety_minutes",
    event_intelligence:false,country_coverage_verified:false,
    original_hosts:Object.freeze(["www.gov.uk","gov.uk"]),
    topic:/\b(?:critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|gallium|germanium|neodymium|dysprosium|terbium|mineral (?:supply|production|processing|trade)|mining|strategic minerals?)\b/iu,
  }),
  // Official ECB RSS press-releases feed, documented at
  // https://www.ecb.europa.eu/home/html/rss.en.html
  // ECB is independently authored vs US Fed and Statistics Canada. This is
  // only free first-party discovery, NOT a license or same-event proof.
  Object.freeze({
    id:"ecb_press_original_rss_review",
    domain:"macro",kind:"original_publisher_central_bank_press_release",
    url:"https://www.ecb.europa.eu/rss/press.html",
    media:"rss",rights:"UNVERIFIED",poll:"ninety_minutes",
    event_intelligence:false,country_coverage_verified:false,
    original_hosts:Object.freeze(["www.ecb.europa.eu"]),
    topic:/\b(?:monetary policy|interest rates?|inflation|economic growth|financial stability|exchange rates?|liquidity|euro area|central bank|bank supervision|balance of payments|market operations)\b/iu,
  }),
  // Three public government first-party Atom feeds: distinct departmental
  // editorial organizations, NOT evidence of external independent review.
  // The weekly canary/HTTP 403 quarantine of unrelated sources is untouched.
  Object.freeze({
    id:"uk_mod_original_defence_atom_review",
    domain:"geopolitics",kind:"original_publisher_defence_policy_release",
    url:"https://www.gov.uk/government/organisations/ministry-of-defence.atom",
    media:"atom",rights:"UNVERIFIED",poll:"ninety_minutes",
    event_intelligence:false,country_coverage_verified:false,
    original_hosts:Object.freeze(["www.gov.uk","gov.uk"]),
    topic:/\b(?:defence|defense|military|armed forces|security|conflict|war|peacekeeping|deployment|airstrike|sanctions?|border|NATO|naval|missile|weapons?|Ukraine)\b/iu,
  }),
  Object.freeze({
    id:"uk_hmt_original_treasury_atom_review",
    domain:"macro",kind:"original_publisher_treasury_macro_release",
    url:"https://www.gov.uk/government/organisations/hm-treasury.atom",
    media:"atom",rights:"UNVERIFIED",poll:"ninety_minutes",
    event_intelligence:false,country_coverage_verified:false,
    original_hosts:Object.freeze(["www.gov.uk","gov.uk"]),
    topic:/\b(?:inflation|monetary|economy|economic growth|fiscal|budget|finance|financial|foreign exchange|currency|interest rates?|treasury|tax|GDP|public spending)\b/iu,
  }),
  Object.freeze({
    id:"uk_desnz_original_energy_minerals_atom_review",
    domain:"rare_earth",kind:"original_publisher_energy_materials_policy",
    url:"https://www.gov.uk/government/organisations/department-for-energy-security-and-net-zero.atom",
    media:"atom",rights:"UNVERIFIED",poll:"ninety_minutes",
    event_intelligence:false,country_coverage_verified:false,
    original_hosts:Object.freeze(["www.gov.uk","gov.uk"]),
    topic:/\b(?:critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|gallium|germanium|copper|magnet|battery|materials? supply|supply chain|mineral processing|energy security)\b/iu,
  }),
  // Verified first-party public publisher feeds, private review only.
  // Feed authorship proves NO legal permission or independent same-event
  // corroboration. Pages still need exact native clock/body readback.
  Object.freeze({
    id:"uk_cabinet_security_original_atom_review",
    domain:"geopolitics",kind:"original_publisher_uk_cabinet_security",
    url:"https://www.gov.uk/government/organisations/cabinet-office.atom",
    media:"atom",rights:"UNVERIFIED",poll:"ninety_minutes",
    event_intelligence:false,country_coverage_verified:false,
    original_hosts:Object.freeze(["www.gov.uk","gov.uk"]),
    topic:/\b(?:security|national security|government|international|foreign policy|conflict|sanctions?|crisis|terrorism|defence|border|emergency|diplomatic)\b/iu,
  }),
  Object.freeze({
    id:"uk_dbt_macro_trade_original_atom_review",
    domain:"macro",kind:"original_publisher_uk_trade_economic",
    url:"https://www.gov.uk/government/organisations/department-for-business-and-trade.atom",
    media:"atom",rights:"UNVERIFIED",poll:"ninety_minutes",
    event_intelligence:false,country_coverage_verified:false,
    original_hosts:Object.freeze(["www.gov.uk","gov.uk"]),
    topic:/\b(?:trade|economic|economy|exports?|imports?|tariffs?|industry|business|growth|financial|currency|foreign investment|supply chains?)\b/iu,
  }),
  Object.freeze({
    id:"bc_minerals_original_rss_review",
    domain:"rare_earth",kind:"original_publisher_british_columbia_minerals",
    url:"https://news.gov.bc.ca/ministries/mining-and-critical-minerals/feed",
    media:"rss",rights:"UNVERIFIED",poll:"ninety_minutes",
    event_intelligence:false,country_coverage_verified:false,
    original_hosts:Object.freeze(["news.gov.bc.ca"]),
    topic:/\b(?:critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|copper|mining|minerals?|processing|supply chain)\b/iu,
  }),
]);

const XML_MIME=/^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:;|$)/iu;
const JSON_MIME=/^(?:application\/(?:json|[a-z0-9.+-]+\+json))(?:;|$)/iu;
const SOURCE_DOMAINS=["geopolitics","macro","rare_earth"];
// Organization identity is never inferred from feed URLs or article titles.
// All six pinned original lanes map to an independently reviewed first-party
// institution; a second feed from one institution is NOT two corroborators.
const ORIGINAL_ORGANIZATION_BY_SOURCE=Object.freeze({
  un_news_security_original_rss_review:"un_news",
  uk_cabinet_security_original_atom_review:"uk_cabinet",
  statcan_prices_original_atom_review:"statistics_canada",
  uk_dbt_macro_trade_original_atom_review:"uk_dbt",
  nrcan_government_news_original_atom_review:"natural_resources_canada",
  bc_minerals_original_rss_review:"bc_ministry_mining",
  uk_fcdo_original_foreign_policy_atom_review:"uk_fcdo",
  fed_monetary_original_press_rss_review:"federal_reserve",
  ecb_press_original_rss_review:"ecb",
  usgs_minerals_original_news_rss_review:"usgs",
  australia_industry_minister_original_rss_review:"australian_industry_minister",
  uk_dbt_critical_minerals_atom_pending_review:"uk_dbt",
  uk_mod_original_defence_atom_review:"uk_mod",
  uk_hmt_original_treasury_atom_review:"uk_hmt",
  uk_desnz_original_energy_minerals_atom_review:"uk_desnz",
});
// Source-native event articles require the actual first-party article path;
// a link to the publisher homepage, Atom/RSS endpoint or other press index
// is NOT original per-event article evidence. Strict and intentionally
// conservative: an unknown news URL requires a separately reviewed adapter.
const ORIGINAL_ARTICLE_PATHS=Object.freeze({
  un_news_security_original_rss_review:/^\/en\/story\/\d{4}\/\d{1,2}\//u,
  uk_cabinet_security_original_atom_review:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\/[a-z0-9-]+$/u,
  statcan_prices_original_atom_review:/^\/n1\/(?:en\/)?daily-quotidien\/\d{6}\//u,
  uk_dbt_macro_trade_original_atom_review:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\/[a-z0-9-]+$/u,
  nrcan_government_news_original_atom_review:/^\/en\/natural-resources-canada\/news\//u,
  bc_minerals_original_rss_review:/^\/releases\/20\d{2}[A-Z]{2,6}\d{4}-\d{6}$/u,
  uk_fcdo_original_foreign_policy_atom_review:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
  fed_monetary_original_press_rss_review:/^\/newsevents\/pressreleases\/[A-Za-z0-9][^/?#]*/u,
  // Only actual ECB first-party original release pages, never RSS indexes.
  ecb_press_original_rss_review:/^\/press\/(?:pr|key)\/date\/20[0-9]{2}\/html\/[a-zA-Z0-9.~_-]{6,190}\.html$/u,
  usgs_minerals_original_news_rss_review:/^\/(?:news|programs\/mineral-resources-program\/news)(?:\/|$)/u,
  australia_industry_minister_original_rss_review:/^\/(?:t-ayres|king)\/media\//u,
  uk_dbt_critical_minerals_atom_pending_review:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
  uk_mod_original_defence_atom_review:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
  uk_hmt_original_treasury_atom_review:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
  uk_desnz_original_energy_minerals_atom_review:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
});

// The original publisher documents www.statcan.gc.ca/daily-quotidien/
// YYMMDD/dqYYMMDD[a-z]-eng.htm as its first-party Daily article family.
// The real 2026-10-11 private production feed had 59 such *path-prefix*
// candidates on www.statcan.gc.ca, not www150 /n1/. We require the
// filename's date to match its exact 6-digit directory, no queries/redirects,
// and an article-specific dq basename. A catalogue/portal stays rejected.
function statcanOfficialRootDailyArticle(source,link) {
  if(source?.id!=="statcan_prices_original_atom_review" ||
      link.hostname!=="www.statcan.gc.ca" ||
      link.search || link.hash || link.port || link.username || link.password)
    return false;
  const m=/^\/daily-quotidien\/([0-9]{6})\/dq([0-9]{6})([a-z][a-z0-9-]{0,35})-eng\.(htm|html)$/u.exec(link.pathname);
  return Boolean(m && m[1]===m[2]);
}

// Coarse lexical buckets ONLY: never log invalid date text, time values,
// article identifiers or a customer event. Strict Date.parse gate unchanged.
function nativeRssDateShape(raw) {
  const value=String(raw??"").trim();
  if(/^<!\[CDATA\[/iu.test(value))return "CDATA_WRAPPER";
  if(/^([A-Za-z]{3,9}),?\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}\s+\d{1,2}:\d{2}/u.test(value))
    return /[A-Z]{2,5}\s*$/u.test(value)?"RFC_ALPHA_ZONE":"RFC_OTHER_ZONE";
  if(/^\d{4}-\d{2}-\d{2}[T ]/u.test(value))return "ISO_LIKE";
  if(/^\d{1,2}\/\d{1,2}\/\d{4}/u.test(value))return "SLASH_DATE_LIKE";
  return "OTHER";
}
const NATIVE_SHAPES=Object.freeze([
  "CDATA_WRAPPER","RFC_ALPHA_ZONE","RFC_OTHER_ZONE",
  "ISO_LIKE","SLASH_DATE_LIKE","OTHER",
]);
function numericRssDateShapeCounters() {
  return Object.fromEntries(NATIVE_SHAPES.map(s=>[s,0]));
}

function rssDateCounts(xml,now,topic=null,hosts=null,source=null) {
  if (!/<rss(?:\s|>)/iu.test(xml) || /<!DOCTYPE|<!ENTITY/iu.test(xml)) return null;
  const entries=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)].slice(0,80);
  let dated=0,recent=0,openSevenDay=0,topicalRecent=0;
  let missingNativeDate=0,invalidOrFutureDate=0,rejectedOriginalLink=0;
  let invalidNativeDate=0,futureNativeDate=0;
  const unparseableNativeDateShapes=numericRssDateShapeCounters();
  let unsafeOrMalformedLink=0,wrongPublisherHost=0,wrongOriginalPath=0;
  let nativeDataUpdates=0,otherCatalogueChanges=0;
  let topicalSixHours=0,topicalNinetyMinutes=0,topicalThirtyMinutes=0;
  for(const [,item] of entries) {
    const date=item.match(/<pubDate(?:\s[^>]*)?>([\s\S]*?)<\/pubDate>/iu)?.[1];
    // Only a source-native per-item date. Never the channel clock, retrieval,
    // processing time, or feed update time; and never an event risk claim.
    if (!date){missingNativeDate++;continue;}
    const ms=officialItemNativePublicationMs(date);
    if(!Number.isFinite(ms)){
      invalidOrFutureDate++;invalidNativeDate++;
      unparseableNativeDateShapes[nativeRssDateShape(date)]++;
      continue;
    }
    if(ms>now.getTime()){
      invalidOrFutureDate++;futureNativeDate++;continue;
    }
    const originalLink=officialOriginalRssArticleUrl(item,source)??"";
    if(!originalHref(originalLink,hosts,source)){
      rejectedOriginalLink++;
      const why=originalLinkRejectionKind(originalLink,hosts,source);
      if(why==="publisher_host_mismatch")wrongPublisherHost++;
      else if(why==="original_article_path_mismatch")wrongOriginalPath++;
      else unsafeOrMalformedLink++;
      continue;
    }
    dated++;
    if(now.getTime()-ms<=7*DAY_MS)openSevenDay++;
    if(now.getTime()-ms<=DAY_MS){
      recent++;
      const headline=item.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/iu)?.[1]??"";
      // The official aggregator is a discovery pointer, not an independent
      // original publisher, and headline relevance is NOT event acceptance.
      if(topic?.test(headline)){
        topicalRecent++;
        if(now.getTime()-ms<=SIX_HOURS_MS)topicalSixHours++;
        if(now.getTime()-ms<=NINETY_MINUTES_MS)topicalNinetyMinutes++;
        if(now.getTime()-ms<=THIRTY_MINUTES_MS)topicalThirtyMinutes++;
      }
      // Eurostat documents these item-native category values. A catalogue
      // change to a code list or structure is NOT a new macro datapoint, and
      // even a genuine dataset update is NOT by itself a scored macro shock.
      const category=item.match(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/iu)?.[1]?.trim()??"";
      if(/^(?:UPDATED_DATASET_DATA|UPDATED_DATASET_STRUCTURE_DATA)$/u.test(category))
        nativeDataUpdates++;
      else otherCatalogueChanges++;
    }
  }
  return {seen:entries.length,native_dated:dated,within_24h:recent,
    open_original_or_release_within_7d:openSevenDay,
    topical_within_24h:topicalRecent,
    topical_within_6h:topicalSixHours,
    topical_within_90m:topicalNinetyMinutes,
    topical_within_30m:topicalThirtyMinutes,
    item_provenance_diagnostics:{
      entries_parsed:entries.length,
      item_native_published_missing:missingNativeDate,
      item_native_published_invalid_or_future:invalidOrFutureDate,
      original_article_link_rejected:rejectedOriginalLink,
      item_native_published_invalid_date:invalidNativeDate,
      item_native_published_future_date:futureNativeDate,
      original_article_link_wrong_host:wrongPublisherHost,
      original_article_link_wrong_path:wrongOriginalPath,
      original_article_link_other_invalid:unsafeOrMalformedLink,
      accepted_first_party_older_than_7d:dated-openSevenDay,
      accepted_first_party_native_dated:dated,
    },
    unparseable_native_rss_date_shapes:unparseableNativeDateShapes,
    native_dataset_data_updates_24h:nativeDataUpdates,
    other_catalogue_changes_24h:otherCatalogueChanges};
}

// For these three original-publisher lanes an item must have a fixed HTTPS
// publisher article link. A governmental syndication API hostname is NOT an
// acceptable article origin, and Atom <updated> is NOT <published>.
function originalHref(href, hosts, source=null) {
  if (!hosts?.length) return true;
  try {
    const link=new URL(String(href??"").replace(/&amp;/giu,"&"));
    return link.protocol==="https:" && !link.username && !link.password &&
      !link.hash && !link.port && link.href.length<=2048 &&
      hosts.includes(link.hostname.toLowerCase()) &&
      (!source || (
        Object.hasOwn(ORIGINAL_ARTICLE_PATHS,source.id) &&
        (ORIGINAL_ARTICLE_PATHS[source.id].test(link.pathname) ||
         statcanOfficialRootDailyArticle(source,link)) &&
        // A feed cannot attest to itself as a separately dated article.
        link.pathname!==new URL(source.url).pathname &&
        !/(?:^|\/)(?:feed|rss|atom)(?:\/|$)/iu.test(link.pathname)
      ));
  } catch {return false;}
}

function originalLinkRejectionKind(href,hosts,source=null) {
  // Diagnostics ONLY. Authoritative originalHref() validity remains unchanged.
  // Never log or return the actual publisher URL, host, title or article bytes.
  try {
    const link=new URL(String(href??"").replace(/&amp;/giu,"&"));
    if(link.protocol!=="https:" || link.username || link.password ||
       link.port || link.hash || link.href.length>2048)
      return "unsafe_or_malformed";
    if(Array.isArray(hosts) && hosts.length && !hosts.includes(link.hostname.toLowerCase()))
      return "publisher_host_mismatch";
    if(source && (!(ORIGINAL_ARTICLE_PATHS[source.id]?.test(link.pathname) ||
                     statcanOfficialRootDailyArticle(source,link)) ||
       link.pathname===new URL(source.url).pathname ||
       /(?:^|\/)(?:feed|rss|atom)(?:\/|$)/iu.test(link.pathname)))
      return "original_article_path_mismatch";
    return "other_rejected";
  } catch {return "unsafe_or_malformed";}
}

function atomDateCounts(xml,now,topic,hosts,source=null) {
  if(!/<(?:atom:)?feed(?:\s|>)/iu.test(xml) ||
      /<!DOCTYPE|<!ENTITY/iu.test(xml))return null;
  const entries=[...xml.matchAll(/<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/giu)].slice(0,80);
  let dated=0,recent=0,openSevenDay=0,topicalRecent=0;
  let missingNativeDate=0,invalidOrFutureDate=0,rejectedOriginalLink=0;
  let invalidNativeDate=0,futureNativeDate=0;
  let unsafeOrMalformedLink=0,wrongPublisherHost=0,wrongOriginalPath=0;
  let topicalSixHours=0,topicalNinetyMinutes=0,topicalThirtyMinutes=0;
  for(const [,item] of entries){
    const publication=item.match(/<(?:atom:)?published(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?published>/iu)?.[1];
    if(!publication){missingNativeDate++;continue;}
    const at=officialItemNativePublicationMs(publication);
    if(!Number.isFinite(at)){
      invalidOrFutureDate++;invalidNativeDate++;continue;
    }
    if(at>now.getTime()){
      invalidOrFutureDate++;futureNativeDate++;continue;
    }
    // A dated Atom article may include multiple rel=alternate links.
    // The undated-page verifier already walks them all; do the same before
    // declaring the original link rejected. Never trust an unapproved host.
    let href="",firstRejected="";
    for(const [,attrs] of item.matchAll(/<(?:atom:)?link\b([^>]*?)\/?\s*>/giu)){
      const rel=attrs.match(/\brel\s*=\s*["']([^"']+)["']/iu)?.[1]??"alternate";
      if(rel!=="alternate"&&rel!=="canonical")continue;
      const candidate=attrs.match(/\bhref\s*=\s*["']([^"']+)["']/iu)?.[1]??"";
      if(!candidate)continue;
      if(!firstRejected)firstRejected=candidate;
      if(originalHref(candidate,hosts,source)){href=candidate;break;}
    }
    if(!href){
      rejectedOriginalLink++;
      const why=originalLinkRejectionKind(firstRejected,hosts,source);
      if(why==="publisher_host_mismatch")wrongPublisherHost++;
      else if(why==="original_article_path_mismatch")wrongOriginalPath++;
      else unsafeOrMalformedLink++;
      continue;
    }
    dated++;
    if(now.getTime()-at<=7*DAY_MS)openSevenDay++;
    if(now.getTime()-at<=DAY_MS){
      recent++;
      const title=item.match(/<(?:atom:)?title(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?title>/iu)?.[1]??"";
      if(topic?.test(title)){
        topicalRecent++;
        if(now.getTime()-at<=SIX_HOURS_MS)topicalSixHours++;
        if(now.getTime()-at<=NINETY_MINUTES_MS)topicalNinetyMinutes++;
        if(now.getTime()-at<=THIRTY_MINUTES_MS)topicalThirtyMinutes++;
      }
    }
  }
  return {seen:entries.length,native_dated:dated,
    within_24h:recent,open_original_or_release_within_7d:openSevenDay,
    topical_within_24h:topicalRecent,
    topical_within_6h:topicalSixHours,
    topical_within_90m:topicalNinetyMinutes,
    topical_within_30m:topicalThirtyMinutes,
    item_provenance_diagnostics:{
      entries_parsed:entries.length,
      item_native_published_missing:missingNativeDate,
      item_native_published_invalid_or_future:invalidOrFutureDate,
      original_article_link_rejected:rejectedOriginalLink,
      item_native_published_invalid_date:invalidNativeDate,
      item_native_published_future_date:futureNativeDate,
      original_article_link_wrong_host:wrongPublisherHost,
      original_article_link_wrong_path:wrongOriginalPath,
      original_article_link_other_invalid:unsafeOrMalformedLink,
      accepted_first_party_older_than_7d:dated-openSevenDay,
      accepted_first_party_native_dated:dated,
    },
  };
}

/**
 * Scan all already-valid original article links, but fetch at most two pages.
 * Rotate BOTH page slots across the bounded, original-publisher-validated
 * candidate pool. Some feeds pin an old article first forever; re-fetching
 * that same old page in every 30-minute pulse halves fresh coverage.
 * This never increases HTTP request count (two page GETs maximum/source).
 * Never substitute Atom <updated> as publication or fetch a rejected URL.
 */
export function selectRotatingFirstPartyPages(eligible,now,{rotate=false,rotationSlot=null}={}) {
  if(!Array.isArray(eligible)||eligible.length>80||
     !(now instanceof Date)||!Number.isFinite(now.getTime())||
     eligible.some(x=>typeof x!=="string"||x.length<12||x.length>2048)||
     (rotationSlot!==null&&(!Number.isSafeInteger(rotationSlot)||rotationSlot<0)))
    throw Error("ORIGINAL_PUBLISHER_ROTATION_INPUT_INVALID");
  const unique=[...new Set(eligible)];
  if(!rotate||unique.length<=ORIGINAL_ARTICLE_MAX_PROBES_PER_DOMAIN)
    return unique.slice(0,ORIGINAL_ARTICLE_MAX_PROBES_PER_DOMAIN);
  const slot=rotationSlot??Math.floor(now.getTime()/(30*60*1000));
  // Publisher-rotating callers supply their per-source opportunity ordinal.
  // A global slot aliases with a source sampled only in fixed modulo phases.
  // Standalone callers retain their existing half-hour rotation.
  // Sequential disjoint pairs, including a wrap-around for odd list lengths.
  // Every accepted link is eventually probed, and no single stale first item
  // consumes a permanent 50% of the two-page budget.
  const start=(slot*ORIGINAL_ARTICLE_MAX_PROBES_PER_DOMAIN)%unique.length;
  return [unique[start],unique[(start+1)%unique.length]];
}

// Only Atom entries with NO per-entry publication date may receive bounded
// original-article same-host date verification. Do not use feed <updated>.
function undatedAtomArticleCandidates(xml,source,{openDiscovery=false}={}) {
  if(source.media!=="atom"||!source.original_hosts)return [];
  const list=[];
  for(const [,item] of [...xml.matchAll(/<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/giu)].slice(0,80)){
    if(/<(?:atom:)?published(?:\s[^>]*)?>/iu.test(item))continue;
    const title=item.match(/<(?:atom:)?title(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?title>/iu)?.[1]??"";
    if(!openDiscovery && !source.topic?.test(title))continue;
    const hrefs=[...item.matchAll(/<(?:atom:)?link\b([^>]*?)\/?\s*>/giu)]
      .map(x=>x[1]).filter(tag=>{
        const rel=tag.match(/\brel\s*=\s*["']([^"']+)["']/iu)?.[1]??"alternate";
        return rel==="alternate"||rel==="canonical";
      });
    for(const attr of hrefs){
      const href=attr.match(/\bhref\s*=\s*["']([^"']+)["']/iu)?.[1]??"";
      if(originalHref(href,source.original_hosts,source)){
        list.push(href);
        break;
      }
    }
    if(list.length>=80)break;
  }
  return [...new Set(list)].slice(0,80);
}

// Diagnose Atom first-party link *selection* independently of dates.
// Entirely numeric output; never copy any upstream URL, article, hostname,
// title, or date into a public receipt. We never fetch diagnostic links.
function undatedAtomOriginalLinkDiagnostic(xml,source) {
  if(source?.media!=="atom"||!Array.isArray(source.original_hosts))return null;
  const codes={
    undated_entries:0,rel_missing_alternate_or_canonical:0,
    alternate_missing_href:0,valid_first_party_article_links:0,
    rejected_publisher_host:0,rejected_original_path:0,
    rejected_unsafe_or_malformed:0,
    statcan_unapproved_path_families:source.id==="statcan_prices_original_atom_review"
      ?{N1_EN_DAILY:0,N1_DAILY:0,N1_PUB:0,N1_RSS:0,N1_EN_OTHER:0,OTHER:0}
      :null,
    statcan_other_path_shapes:source.id==="statcan_prices_original_atom_review"
      ?{ROOT:0,N1_OTHER:0,NON_N1:0,SUFFIX_HTML:0,SUFFIX_XML:0,SUFFIX_OTHER:0,QUERY_PRESENT:0}
      :null,
    // Only fixed bucket counts for already rejected same-publisher paths.
    // This cannot identify a single article or admit a URL for a GET.
    statcan_non_n1_publisher_hosts:source.id==="statcan_prices_original_atom_review"
      ?{WWW150:0,WWW:0}:null,
    statcan_non_n1_prefix_families:source.id==="statcan_prices_original_atom_review"
      ?{EN_DAILY:0,EN_SUBJECTS_OR_CATALOGUE:0,EN_OTHER:0,
        ROOT_DAILY:0,ROOT_CATALOGUE:0,OTHER:0}:null,
  };
  const classifyStatcanPath=raw=>{
    try{
      const p=new URL(raw).pathname;
      if(/^\/n1\/en\/daily-quotidien\//u.test(p))return "N1_EN_DAILY";
      if(/^\/n1\/daily-quotidien\//u.test(p))return "N1_DAILY";
      if(/^\/n1\/pub\//u.test(p))return "N1_PUB";
      if(/^\/n1\/rss\//u.test(p))return "N1_RSS";
      if(/^\/n1\/en\//u.test(p))return "N1_EN_OTHER";
    }catch{ /* no URLs or exceptions leave this diagnostic */ }
    return "OTHER";
  };
  const entries=[...xml.matchAll(/<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/giu)].slice(0,80);
  for(const [,item] of entries){
    if(/<(?:atom:)?published(?:\s[^>]*)?>/iu.test(item))continue;
    codes.undated_entries++;
    const tags=[...item.matchAll(/<(?:atom:)?link\b([^>]*?)\/?\s*>/giu)]
      .map(m=>m[1]).filter(attr=>{
        const rel=attr.match(/\brel\s*=\s*["']([^"']+)["']/iu)?.[1]??"alternate";
        return rel==="alternate"||rel==="canonical";
      });
    if(!tags.length){codes.rel_missing_alternate_or_canonical++;continue;}
    let valid=false,reason=null,hasHref=false,rejectedPath=null;
    for(const attrs of tags) {
      const href=attrs.match(/\bhref\s*=\s*["']([^"']+)["']/iu)?.[1]??"";
      if(!href)continue;
      hasHref=true;
      if(originalHref(href,source.original_hosts,source)){valid=true;break;}
      reason??=originalLinkRejectionKind(href,source.original_hosts,source);
      if(reason==="original_article_path_mismatch"&&rejectedPath===null)
        rejectedPath=href;
    }
    if(valid){codes.valid_first_party_article_links++;continue;}
    if(!hasHref){codes.alternate_missing_href++;continue;}
    if(reason==="publisher_host_mismatch")codes.rejected_publisher_host++;
    else if(reason==="original_article_path_mismatch"){
      codes.rejected_original_path++;
      if(codes.statcan_unapproved_path_families){
        codes.statcan_unapproved_path_families[classifyStatcanPath(rejectedPath)]++;
        if(codes.statcan_other_path_shapes &&
            classifyStatcanPath(rejectedPath)==="OTHER"){
          try{
            const url=new URL(rejectedPath);
            const p=url.pathname;
            const shape=codes.statcan_other_path_shapes;
            if(p==="/")shape.ROOT++;
            else if(p.startsWith("/n1/"))shape.N1_OTHER++;
            else shape.NON_N1++;
            if(/\.html?$/iu.test(p))shape.SUFFIX_HTML++;
            else if(/\.xml$/iu.test(p))shape.SUFFIX_XML++;
            else shape.SUFFIX_OTHER++;
            if(url.search)shape.QUERY_PRESENT++;
            // The published Atom feed has 60 real first-party link-path
            // mismatches, mostly .html and outside /n1/. Distinguish actual
            // immutable prefix family and allowed publisher alias before
            // reviewing any narrow future adapter. Still NO url fetch.
            if(!p.startsWith("/n1/")){
              const host=codes.statcan_non_n1_publisher_hosts;
              const family=codes.statcan_non_n1_prefix_families;
              if(url.hostname==="www150.statcan.gc.ca")host.WWW150++;
              else if(url.hostname==="www.statcan.gc.ca")host.WWW++;
              if(/^\/en\/(?:dai-quo|daily-quotidien)(?:\/|$)/u.test(p))
                family.EN_DAILY++;
              else if(/^\/en\/(?:subjects?|catalogue)(?:\/|$)/u.test(p))
                family.EN_SUBJECTS_OR_CATALOGUE++;
              else if(/^\/en\//u.test(p))family.EN_OTHER++;
              else if(/^\/(?:dai-quo|daily-quotidien)(?:\/|$)/u.test(p))
                family.ROOT_DAILY++;
              else if(/^\/catalogue(?:\/|$)/u.test(p))
                family.ROOT_CATALOGUE++;
              else family.OTHER++;
            }
          }catch{/* strictly aggregated rejection remains OTHER */}
        }
      }
    }
    else codes.rejected_unsafe_or_malformed++;
  }
  return codes;
}

function undatedRssArticleCandidates(xml,source,{openDiscovery=false}={}) {
  // Recover only missing original item pubDate via exact first-party
  // article datePublished; never rescue a future/malformed source pubDate.
  if(source.media!=="rss"||!source.original_hosts)return [];
  const list=[];
  for(const [,item] of [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)].slice(0,80)){
    if(/<pubDate(?:\s[^>]*)?>/iu.test(item))continue;
    const title=item.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/iu)?.[1]??"";
    if(!openDiscovery && !source.topic?.test(title))continue;
    const href=officialOriginalRssArticleUrl(item,source)??"";
    if(originalHref(href,source.original_hosts,source))list.push(href);
    if(list.length>=80)break;
  }
  return [...new Set(list)].slice(0,80);
}

function jsonShape(value) {
  // A structural country listing only; no annual series or event time inferred.
  if (!value || typeof value!=="object" || Array.isArray(value)) return false;
  return Array.isArray(value.data) || Array.isArray(value.results) ||
    Array.isArray(value.items);
}

export async function probeExpandedSource(source,{
  fetchImpl=fetch,now=new Date(), timeoutMs=5000,collectPrivateCandidates=false,
  openDiscovery=false,originalPageRotationSlot=null,
}={}) {
  if(originalPageRotationSlot!==null&&
     (!Number.isSafeInteger(originalPageRotationSlot)||originalPageRotationSlot<0))
    throw Error("ORIGINAL_PUBLISHER_ROTATION_INPUT_INVALID");
  if(!EXPANDED_OFFICIAL_SOURCES.includes(source))throw Error("SOURCE_NOT_FIXED");
  const row={
    source_id:source.id,domain:source.domain,kind:source.kind,
    publisher_reachable:false,format_valid:false,
    source_native_release_items:null,source_native_24h_release_items:null,
    source_native_7d_release_items:null,
    original_publisher_open_24h_count:null,
    source_item_provenance_diagnostics:null,
    private_undated_feed_observations:[],
    undated_observed_entry_count:0,
    unparseable_native_rss_date_shapes:null,
    first_party_original_page_probe_codes:null,
    first_party_original_page_date_reason_codes:null,
    undated_atom_article_link_candidates:null,
    undated_atom_link_diagnostic:null,
    // Populated only for the Eurostat dataset catalogue, not RSS headlines.
    eurostat_native_dataset_data_updates_24h:null,
    eurostat_other_catalogue_changes_24h:null,
    topical_private_release_links_24h:null,
    original_publisher_topical_6h:null,
    original_publisher_topical_90m:null,
    original_publisher_topical_30m:null,
    original_page_precise_date_checks:0,original_page_precise_date_24h:0,
    official_locale_fallback_attempted:false,
    official_locale_fallback_used:false,
    official_same_publisher_fallback_attempted:false,
    official_same_publisher_fallback_used:false,
    // Zero-current original-publisher all-topic discovery is same issuer;
    // never independent corroboration or even a qualified original article.
    official_same_publisher_zero_fresh_expansion_attempted:false,
    official_same_publisher_zero_fresh_expansion_used:false,
    // Sanitized numeric transport status only; never forward upstream bodies.
    primary_http_status:null,fallback_http_status:null,
    same_event_independent_corroboration_verified:false,
    source_native_release_is_scored_event:false,
    country_coverage_verified:false,commercial_rights_verified:false,
    current_scored_intelligence_verified:false,
    commercial_eligible:false,reason:"TRANSPORT_UNAVAILABLE",
  };
  const fetchOfficial=async url=>fetchImpl(url,{
    redirect:"error",
    signal:AbortSignal.timeout(timeoutMs),
    // Eurostat returns HTTP 406 to GitHub's explicit RSS negotiation.
    // Accept any response *format* for this one official endpoint; strict
    // XML MIME + RSS shape checks below still deny HTML/untrusted content.
    headers:{accept:source.id==="eurostat_stats_update_official_rss_review"?"*/*":source.media==="rss"
      ?"application/rss+xml, application/xml;q=0.9, text/xml;q=0.8"
      :source.media==="atom"
      ?"application/atom+xml, application/xml;q=0.9, text/xml;q=0.8"
      :"application/json","user-agent":"Geomacro-Official-Expanded-Source-Private-Monitor/1.0"},
  });
  let response;
  let retriedAfterTransportError=false;
  try{response=await fetchOfficial(source.url);}catch{
    // Only a fixed, same-organization official feed can recover a network
    // outage. A redirect or failed alternate still remains unverified.
    if(!source.network_fallback_same_publisher||!source.alternate_url)return row;
    retriedAfterTransportError=true;
    row.official_same_publisher_fallback_attempted=true;
    try{response=await fetchOfficial(source.alternate_url);}catch{return row;}
    row.fallback_http_status=response.status;
  }
  if(!retriedAfterTransportError)row.primary_http_status=response.status;
  // Documented language variant at the SAME official publisher. Do not
  // retry on 401/403/429, network/redirect error or MIME/body/shape rejection.
  // Strictly one extra request; primary or alternate stays fail-closed.
  if(source.alternate_url && !retriedAfterTransportError && (response.status===404 ||
    (response.status>=500 && response.status<=599))){
    if(source.network_fallback_same_publisher)
      row.official_same_publisher_fallback_attempted=true;
    else row.official_locale_fallback_attempted=true;
    try{response=await fetchOfficial(source.alternate_url);}catch{return row;}
    row.fallback_http_status=response.status;
  }
  if(!response.ok) {
    row.reason=response.status===429?"PUBLISHER_RATE_LIMITED":
      response.status===401||response.status===403?"PUBLISHER_DENIED":"PUBLISHER_HTTP_NOT_OK";
    return row;
  }
  const mime=response.headers.get("content-type")??"";
  const maxBodyBytes=source.id==="eurostat_stats_update_official_rss_review"
    ? EUROSTAT_MAX_BODY_BYTES:MAX_BODY_BYTES;
  if(!(source.media==="rss"||source.media==="atom"?XML_MIME:JSON_MIME).test(mime)) {
    row.reason="SOURCE_CONTENT_TYPE_INVALID";return row;
  }
  if(Number(response.headers.get("content-length")||0)>maxBodyBytes||!response.body) {
    row.reason="SOURCE_BODY_UNAVAILABLE_OR_OVERSIZE";return row;
  }
  const reader=response.body.getReader();
  const chunks=[];let size=0;
  try {
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>maxBodyBytes){row.reason="SOURCE_BODY_UNAVAILABLE_OR_OVERSIZE";return row;}
      chunks.push(Buffer.from(value));
    }
  }catch{row.reason="SOURCE_BODY_READ_FAILURE";return row;}
  finally{reader.releaseLock();}
  let body;
  try{body=new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks));}
  catch{row.reason="SOURCE_ENCODING_INVALID";return row;}
  let valid=false,counts=null;
  if(source.media==="rss"){
    counts=rssDateCounts(body,now,source.topic??null,source.original_hosts??null,source);
    valid=counts!==null;
  }else if(source.media==="atom"){
    counts=atomDateCounts(body,now,source.topic??null,source.original_hosts,source);
    valid=counts!==null;
  }else{
    try{valid=jsonShape(JSON.parse(body));}catch{valid=false;}
  }
  if(!valid){row.reason="SOURCE_SHAPE_UNVERIFIED";return row;}
  // The security-topic UN News RSS sometimes has no new first-party item
  // even when UN News all-topic (same official publisher) does. Under a
  // PRIVATE open-discovery pulse, one extra pinned same-issuer RSS GET may
  // recover original native-dated evidence. A second UN feed is NEVER a
  // second independent issuer; no freshness from retrieval/channel clocks.
  if(source.id==="un_news_security_original_rss_review" && openDiscovery &&
      !retriedAfterTransportError && row.primary_http_status===200 &&
      source.network_fallback_same_publisher===true &&
      source.alternate_url &&
      new URL(source.url).origin===new URL(source.alternate_url).origin &&
      counts?.within_24h===0) {
    row.official_same_publisher_zero_fresh_expansion_attempted=true;
    try {
      const second=await fetchOfficial(source.alternate_url);
      // Explicit access denials and rate limits never cause another fallback.
      // Retain the already valid primary feed on every alternate error.
      if(second.ok && XML_MIME.test(second.headers.get("content-type")??"") &&
          Number(second.headers.get("content-length")||0)<=MAX_BODY_BYTES &&
          second.body) {
        const nextChunks=[];let length=0;
        const nextReader=second.body.getReader();
        try {
          for(;;){
            const {done,value}=await nextReader.read();
            if(done)break;
            length+=value.byteLength;
            if(length>MAX_BODY_BYTES)break;
            nextChunks.push(Buffer.from(value));
          }
        }finally{nextReader.releaseLock();}
        if(length<=MAX_BODY_BYTES) {
          const alternateBody=new TextDecoder("utf-8",{fatal:true})
            .decode(Buffer.concat(nextChunks));
          const alternateCounts=rssDateCounts(alternateBody,now,
            source.topic??null,source.original_hosts??null,source);
          // Require actual <item> pubDate + pinned UN original story URL,
          // NOT a merely updated channel or different third-party source.
          if(alternateCounts && alternateCounts.within_24h>0) {
            body=alternateBody;counts=alternateCounts;
            row.official_same_publisher_zero_fresh_expansion_used=true;
          }
        }
      }
    }catch{/* Preserve valid primary; never log upstream URL/body/error. */}
  }
  row.publisher_reachable=true;
  row.format_valid=true;
  // Original publication may be unknowable at discovery time (notably Atom).
  // Keep SHA-only first-party observations separate from dated candidates.
  // Never infer a published_at from Atom updated, retrieval or D1 poll time.
  if(collectPrivateCandidates && openDiscovery && source.media==="atom" && source.original_hosts){
    try{
      row.private_undated_feed_observations=observeUndatedFirstPartyAtomFeed(
        body,source,{now});
      row.undated_observed_entry_count=row.private_undated_feed_observations.length;
    }catch{
      row.private_undated_feed_observations=[];
      row.undated_observation_parse_failed=true;
    }
  }
  if(collectPrivateCandidates && source.original_hosts && ["rss","atom"].includes(source.media)){
    try { row.private_original_article_candidates=originalPublisherPrivateCandidates(
      body,source,now,{captureAllTopics:openDiscovery}); }
    catch { row.private_original_article_candidates=[]; row.private_original_candidate_parse_failed=true; }
  }
  row.official_locale_fallback_used=row.official_locale_fallback_attempted;
  row.official_same_publisher_fallback_used=row.official_same_publisher_fallback_attempted;
  row.reason="PRIVATE_SOURCE_TRANSPORT_ONLY";
  if(counts){
    row.source_native_release_items=counts.native_dated;
    row.source_native_24h_release_items=counts.within_24h;
    row.source_native_7d_release_items=counts.open_original_or_release_within_7d;
    row.source_item_provenance_diagnostics=counts.item_provenance_diagnostics??null;
    if(source.media==="atom"&&source.original_hosts)
      row.undated_atom_link_diagnostic=undatedAtomOriginalLinkDiagnostic(body,source);
    row.unparseable_native_rss_date_shapes=counts.unparseable_native_rss_date_shapes??null;
    if(source.original_hosts)row.original_publisher_open_24h_count=counts.within_24h;
    if(source.topic)row.topical_private_release_links_24h=counts.topical_within_24h;
    if(source.original_hosts){
      row.original_publisher_topical_6h=counts.topical_within_6h;
      row.original_publisher_topical_90m=counts.topical_within_90m;
      row.original_publisher_topical_30m=counts.topical_within_30m;
    }
    if(source.id==="eurostat_stats_update_official_rss_review"){
      row.eurostat_native_dataset_data_updates_24h=counts.native_dataset_data_updates_24h;
      row.eurostat_other_catalogue_changes_24h=counts.other_catalogue_changes_24h;
    }
  }
  // Strict 2-page max per ORIGINAL Atom source, only if the government feed
  // gave no currently topical original per-entry publication time.
  // The helper reconstructs fixed official article URL paths and does not
  // follow redirects, trust feed updated clocks or leak publisher HTML.
  if((source.media==="atom"||source.media==="rss") &&
      source.original_hosts && (openDiscovery || counts?.topical_within_24h===0)){
    const eligible=source.media==="atom"
      ? undatedAtomArticleCandidates(body,source,{openDiscovery})
      : undatedRssArticleCandidates(body,source,{openDiscovery});
    const articles=selectRotatingFirstPartyPages(eligible,now,{
      rotate:openDiscovery,rotationSlot:originalPageRotationSlot,
    });
    // This is a count of fixed-allowlist links, NOT verified fresh articles.
    row.original_page_eligible_link_pool_count=eligible.length;
    row.original_page_rotation_applied=openDiscovery && eligible.length>2;
    row.undated_atom_article_link_candidates=
      source.media==="atom"?eligible.length:null;
    // Aggregate only the existing, fixed-enum publisher page verifier codes.
    // No article URLs, response bodies or original date text appear in logs.
    const pageCodes=Object.create(null);
    const dateReasons=Object.create(null);
    let topicalOriginalPages=0,physicalPageGets=0;
    // The same TWO page-side requests also cover an optional first-party
    // GOV.UK Content API check. Two article pages OR one HTML+API pair,
    // never both. Feed GET remains accounted by its existing source reader.
    const boundedPageFetch=async(input,init)=>{
      if(physicalPageGets>=ORIGINAL_ARTICLE_MAX_PROBES_PER_DOMAIN)
        throw Error("ORIGINAL_ISSUER_PAGE_BUDGET_HELD");
      physicalPageGets++;
      return fetchImpl(input,init);
    };
    for(const article of articles){
      if(physicalPageGets>=ORIGINAL_ARTICLE_MAX_PROBES_PER_DOMAIN)break;
      const pageDiagnostics={};
      const published=await fetchVerifiedPublisherPageDate(article,source.domain,{
        now,fetchImpl:boundedPageFetch,diagnostics:pageDiagnostics,
        allowGovUkContentApi:true,
      });
      const safeCode=pageDiagnostics.code;
      if(SAFE_PUBLISHER_PAGE_PROBE_CODES.includes(safeCode))
        pageCodes[safeCode]=(pageCodes[safeCode]??0)+1;
      const safeReason=pageDiagnostics.date_reason;
      if(SAFE_ORIGINAL_PAGE_DATE_REASONS.includes(safeReason))
        dateReasons[safeReason]=(dateReasons[safeReason]??0)+1;
      row.original_page_precise_date_checks++;
      if(!published)continue;
      // An independently checked publisher article page date can rescue an
      // undated feed entry. Retrieval and feed-update clocks never substitute.
      const candidate=originalPublisherPrivatePageDateCandidate(
        body,source,{articleUrl:article,publishedAt:published,now,
          captureAllTopics:openDiscovery});
      if(!candidate)continue;
      if(collectPrivateCandidates &&
          !row.private_original_article_candidates?.some(
            c=>c.original_article_sha256===candidate.original_article_sha256)){
        row.private_original_article_candidates ??= [];
        row.private_original_article_candidates.push(candidate);
      }
      row.original_page_precise_date_24h++;
      if(openDiscovery)row.original_publisher_open_24h_count++;
      // Broad original discovery is not a topical current event. Keep the
      // previous topical metric exact; otherwise open capture would launder
      // unrelated articles into "fresh geopolitical/mineral stories".
      if(!candidate.discovery_topic_matched)continue;
      topicalOriginalPages++;
      const ageMs=now.getTime()-Date.parse(published);
      if(ageMs>=0&&ageMs<=SIX_HOURS_MS)
        row.original_publisher_topical_6h++;
      if(ageMs>=0&&ageMs<=NINETY_MINUTES_MS)
        row.original_publisher_topical_90m++;
      if(ageMs>=0&&ageMs<=THIRTY_MINUTES_MS)
        row.original_publisher_topical_30m++;
    }
    row.topical_private_release_links_24h+=topicalOriginalPages;
    row.original_page_physical_gets=physicalPageGets;
    row.first_party_original_page_probe_codes=pageCodes;
    row.first_party_original_page_date_reason_codes=dateReasons;
  }
  return row;
}

export async function probeExpandedOfficialMesh({fetchImpl=fetch,now=new Date()}={}){
  const entries=[];
  for(const source of EXPANDED_OFFICIAL_SOURCES){
    // Historical denied/robot-blocked URLs are never re-requested.
    // Active original issuers remain independently sampled at normal cadence.
    if(isQuarantinedOfficialRoute(source.id))
      entries.push(quarantinedOfficialSourceReceipt(source));
    else entries.push(await probeExpandedSource(source,{fetchImpl,now}));
  }
  const active=entries.filter(x=>x.quarantined!==true);
  const quarantined=entries.filter(x=>x.quarantined===true);
  const activeOk=active.every(x=>x.format_valid===true);
  return {
    schema:"geomacro.expanded-official-source-observation.v1",
    observed_at:now.toISOString(),
    status:activeOk
      ? "ACTIVE_SOURCE_TRANSPORT_OBSERVED_WITH_QUARANTINE"
      : "ACTIVE_SOURCE_TRANSPORT_DEGRADED",
    // Active transport success != old blocked sources magically working.
    active_source_transport_healthy:activeOk,
    active_source_count:active.length,
    quarantined_source_count:quarantined.length,
    historical_quarantined_source_ids:quarantined.map(x=>x.source_id),
    all_registered_sources_transport_healthy:quarantined.length===0&&activeOk,
    // All three domains included is NOT global geographical or event coverage.
    domains_observed:SOURCE_DOMAINS,
    globally_current_scored_coverage_verified:false,
    verified_country_count:0,verified_current_event_domains:0,
    commercial_eligible:false,
    source_rights_verified:false,source_family_independence_verified:false,
    supabase_reads:0,supabase_writes:0,d1_writes:0,b2_requests:0,
    payment_performed:false,
    original_publisher_native_24h_topic_counts:Object.fromEntries(
      SOURCE_DOMAINS.map(domain=>[domain,entries.filter(x=>
        x.domain===domain &&
        EXPANDED_OFFICIAL_SOURCES.find(source=>source.id===x.source_id)?.original_hosts
      ).reduce((n,x)=>n+(x.topical_private_release_links_24h??0),0)])),
    original_publisher_freshness_windows:Object.fromEntries(
      SOURCE_DOMAINS.map(domain=>{
        const original=entries.filter(x=>x.domain===domain&&
          EXPANDED_OFFICIAL_SOURCES.find(s=>s.id===x.source_id)?.original_hosts);
        const bucket=name=>original.reduce((sum,x)=>sum+(x[name]??0),0);
        return [domain,{
          within_90m:bucket("original_publisher_topical_90m"),
          within_6h:bucket("original_publisher_topical_6h"),
          within_24h:bucket("topical_private_release_links_24h"),
          // With no available publisher transport, zero is NOT global absence.
          original_publisher_transport_healthy:original.every(x=>x.format_valid),
        }];
      })),
    independent_original_origin_lanes:Object.fromEntries(
      SOURCE_DOMAINS.map(domain=>{
        const original=entries.filter(x=>x.domain===domain&&
          Object.hasOwn(ORIGINAL_ORGANIZATION_BY_SOURCE,x.source_id));
        const orgs6h=new Set(original.filter(x=>
          x.original_publisher_topical_6h>0).map(x=>
          ORIGINAL_ORGANIZATION_BY_SOURCE[x.source_id]));
        const orgs90m=new Set(original.filter(x=>
          x.original_publisher_topical_90m>0).map(x=>
          ORIGINAL_ORGANIZATION_BY_SOURCE[x.source_id]));
        return [domain,{
          organizations_with_6h_originals:orgs6h.size,
          organizations_with_90m_originals:orgs90m.size,
          possible_two_independent_origins_in_6h:orgs6h.size>=2,
          // Separate subject/article-level claim match, newsroom independence,
          // native rights and reviewer signatures STILL required downstream.
          same_event_independent_corroboration_verified:false,
          source_rights_verified:false,
          current_scored_intelligence_verified:false,
          commercial_eligible:false,
        }];
      })),
    // These counts have no country, rights, corroboration or severity proof.
    sources:entries,
  };
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const result=await probeExpandedOfficialMesh();
  mkdirSync("artifacts/expanded-official-source",{recursive:true});
  writeFileSync("artifacts/expanded-official-source/transport.json",
    JSON.stringify(result,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(result));
  if(result.status==="ACTIVE_SOURCE_TRANSPORT_DEGRADED")process.exitCode=3;
}
