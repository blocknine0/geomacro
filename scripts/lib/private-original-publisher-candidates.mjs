/**
 * #1827 PRIVATE original-publisher candidate ingestion handoff.
 *
 * Source-native RSS/Atom article dates only; never use feed updated, retrieval,
 * article archive restore, or GitHub scheduler timestamps as publication time.
 * Emit irreversible bounded URL/headline fingerprints, never raw titles/URLs.
 * Equal URL = same article; equal title is only a POSSIBLE same-event signal.
 * Neither forms independent corroboration or commercial rights evidence.
 */
import {createHash} from "node:crypto";
import {officialOriginalRssArticleUrl} from "./official-rss-original-link.mjs";
import {officialItemNativePublicationMs} from "./official-native-item-publication-date.mjs";

const MAX_ITEMS=40;
// The free homepage's 24h recent-news window: never derive from feed updated.
const MAX_AGE_MS=24*60*60*1000;
const MAX_TITLE=300;
const MAX_URL=1600;
const ORIGINAL_ARTICLE_PATHS=Object.freeze({
  uk_cabinet_security_original_atom_review:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\/[a-z0-9-]+$/u,
  un_news_security_original_rss_review:/^\/en\/story\/\d{4}\/\d{1,2}\//u,
  uk_fcdo_original_foreign_policy_atom_review:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
  fed_monetary_original_press_rss_review:/^\/newsevents\/pressreleases\/[A-Za-z0-9][^/?#]*/u,
  ecb_press_original_rss_review:/^\/press\/(?:pr|key)\/date\/20[0-9]{2}\/html\/[a-zA-Z0-9.~_-]{6,190}\.html$/u,
  uk_dbt_macro_trade_original_atom_review:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\/[a-z0-9-]+$/u,
  statcan_prices_original_atom_review:/^\/n1\/(?:en\/)?daily-quotidien\/\d{6}\//u,
  bc_minerals_original_rss_review:/^\/releases\/20\d{2}[A-Z]{2,6}\d{4}-\d{6}$/u,
  nrcan_government_news_original_atom_review:/^\/en\/natural-resources-canada\/news\//u,
  usgs_minerals_original_news_rss_review:/^\/(?:news|programs\/mineral-resources-program\/news)(?:\/|$)/u,
  australia_industry_minister_original_rss_review:/^\/(?:t-ayres|king)\/media\//u,
  uk_dbt_critical_minerals_atom_pending_review:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
  uk_mod_original_defence_atom_review:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
  uk_hmt_original_treasury_atom_review:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
  uk_desnz_original_energy_minerals_atom_review:/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u,
});
const APPROVED_SOURCE_ORGS=Object.freeze({
  uk_cabinet_security_original_atom_review:"uk_cabinet",
  un_news_security_original_rss_review:"un_news",
  uk_fcdo_original_foreign_policy_atom_review:"uk_fcdo",
  fed_monetary_original_press_rss_review:"federal_reserve",
  ecb_press_original_rss_review:"ecb",
  uk_dbt_macro_trade_original_atom_review:"uk_dbt",
  statcan_prices_original_atom_review:"statistics_canada",
  bc_minerals_original_rss_review:"bc_ministry_mining",
  nrcan_government_news_original_atom_review:"natural_resources_canada",
  usgs_minerals_original_news_rss_review:"usgs",
  australia_industry_minister_original_rss_review:"australian_industry_minister",
  uk_dbt_critical_minerals_atom_pending_review:"uk_dbt",
  uk_mod_original_defence_atom_review:"uk_mod",
  uk_hmt_original_treasury_atom_review:"uk_hmt",
  uk_desnz_original_energy_minerals_atom_review:"uk_desnz",
});
const digest=s=>createHash("sha256").update(s,"utf8").digest("hex");
function textValue(s) {
  if(typeof s!=="string"||s.length>MAX_TITLE*5) return null;
  // Keep XML entities opaque; never unescape potentially nested HTML
  // into a second parser/renderer. Only hashed text leaves this function.
  const normalized=s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/giu,"$1")
    .replace(/\s+/gu," ").trim();
  if(normalized.length<8||normalized.length>MAX_TITLE||
     /<[^>]*>|\p{Cc}/u.test(normalized))return null;
  return normalized;
}
function canonicalOriginalUrl(raw,source) {
  if(typeof raw!=="string"||raw.length>MAX_URL||
     !Array.isArray(source?.original_hosts))return null;
  let url;
  try {url=new URL(raw)}catch{return null}
  // Keep this existing fingerprint/claim-binding guard aligned with the
  // authoritative original publisher resolver. Admission of an official
  // redirected Daily alias must not get lost *after* page-date verification.
  const rootStatcanMatch=source.id==="statcan_prices_original_atom_review" &&
    url.hostname==="www.statcan.gc.ca" && !url.search
      ? /^\/daily-quotidien\/([0-9]{6})\/dq([0-9]{6})([a-z][a-z0-9-]{0,35})-eng\.(htm|html)$/u.exec(url.pathname)
      :null;
  const documentedStatcanRootDaily=Boolean(rootStatcanMatch &&
    rootStatcanMatch[1]===rootStatcanMatch[2]);
  if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
     !source.original_hosts.includes(url.hostname) ||
     (!/^\/(?!\/)/u.test(url.pathname) ||
     !(ORIGINAL_ARTICLE_PATHS[source.id]?.test(url.pathname) ||
       documentedStatcanRootDaily))) return null;
  // Tracking parameters are not article identity. Preserve nontracking query.
  for(const key of [...url.searchParams.keys()]) {
    if(/^utm_|^(?:fbclid|gclid|mc_cid|mc_eid)$/iu.test(key))
      url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.href;
}
function xmlTag(chunk,name) {
  const m=chunk.match(new RegExp("<(?:atom:)?"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:atom:)?"+name+">","iu"));
  return m?.[1]?.trim()??null;
}
function atomArticleLink(chunk,source) {
  // One Atom entry may have several alternates (including empty/off-host
  // links). Align the SHA handoff with the upstream original-link verifier:
  // select the first FULLY validated publisher article, not merely the
  // first rel=alternate. Never enlarge the trusted source host/path set.
  for(const m of chunk.matchAll(/<(?:atom:)?link\b([^>]*?)\/?\s*>/giu)){
    const rel=m[1].match(/\brel\s*=\s*["']([^"']+)["']/iu)?.[1]??"alternate";
    if(rel!=="alternate"&&rel!=="canonical")continue;
    const href=m[1].match(/\bhref\s*=\s*["']([^"']+)["']/iu)?.[1]??"";
    if(canonicalOriginalUrl(href,source))return href;
  }
  return null;
}
export function originalPublisherPrivateCandidates(xml,source,now=new Date(),{captureAllTopics=false}={}) {
  if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
     !Object.hasOwn(APPROVED_SOURCE_ORGS,source?.id)||
     !["rss","atom"].includes(source?.media)||
     !Array.isArray(source.original_hosts)||source.original_hosts.length===0)
    throw Error("PRIVATE_ORIGINAL_SOURCE_NOT_APPROVED_FOR_METADATA_PROBE");
  if(typeof xml!=="string"||Buffer.byteLength(xml,"utf8")>192*1024||
     /<!DOCTYPE|<!ENTITY/iu.test(xml))throw Error("PRIVATE_ORIGINAL_FEED_UNTRUSTED");
  const rss=source.media==="rss";
  if(rss&&!/<rss(?:\s|>)/iu.test(xml))throw Error("PRIVATE_ORIGINAL_RSS_INVALID");
  if(!rss&&!/<(?:atom:)?feed(?:\s|>)/iu.test(xml))throw Error("PRIVATE_ORIGINAL_ATOM_INVALID");
  const entries=rss?
    [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)]:
    [...xml.matchAll(/<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/giu)];
  const result=[];
  const seen=new Set();
  for(const [,item] of entries.slice(0,MAX_ITEMS)){
    const native=xmlTag(item,rss?"pubDate":"published");
    if(!native)continue;
    const timestamp=officialItemNativePublicationMs(native);
    if(!Number.isFinite(timestamp)||timestamp>now.getTime()||
      now.getTime()-timestamp>MAX_AGE_MS)continue;
    const title=textValue(xmlTag(item,"title"));
    // Discovery is never conditional on a curated keyword list. An official
    // publisher may report a material event using unexpected terminology.
    // Topic match remains only a downstream relevance hint, NOT acceptance.
    if(!title || (!captureAllTopics &&
       (!(source.topic instanceof RegExp)||!source.topic.test(title))))continue;
    const original=canonicalOriginalUrl(rss?officialOriginalRssArticleUrl(item,source):atomArticleLink(item,source),source);
    if(!original)continue;
    const articleFingerprint=digest(original);
    if(seen.has(articleFingerprint))continue;
    seen.add(articleFingerprint);
    const headlineFingerprint=digest(title.toLowerCase()
      .normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu," ")
      .replace(/\s+/gu," ").trim());
    result.push({
      schema:"geomacro.private-original-article-candidate.v1",
      domain:source.domain,
      original_publisher_organization_id:APPROVED_SOURCE_ORGS[source.id],
      source_id:source.id,
      discovery_topic_matched:source.topic instanceof RegExp && source.topic.test(title),
      article_category_relevance_verified:false,
      original_article_sha256:articleFingerprint,
      headline_fingerprint_sha256:headlineFingerprint,
      native_published_at:new Date(timestamp).toISOString(),
      read_transport_verified:true,
      original_article_content_verified:false,
      same_event_claim_identity_verified:false,
      independently_authored_reporting_verified:false,
      commercial_derived_use_rights_verified:false,
      eligible_for_scoring:false,
      eligible_for_publication:false,
    });
  }
  return result;
}
/**
 * Only after the trusted, category-bound first-party article page verifier
 * returned an original publication time may an undated RSS/Atom item enter
 * the PRIVATE SHA-only observation queue. Neither feed <updated> nor article
 * modified-time is sufficient. Source content and rights remain unverified.
 */
export function originalPublisherPrivatePageDateCandidate(xml,source,{
  articleUrl,publishedAt,now=new Date(),captureAllTopics=false,
}={}) {
  if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
     !Object.hasOwn(APPROVED_SOURCE_ORGS,source?.id)||
     !["rss","atom"].includes(source?.media)||
     !Array.isArray(source.original_hosts)||source.original_hosts.length===0||
     typeof xml!=="string"||Buffer.byteLength(xml,"utf8")>192*1024||
     /<!DOCTYPE|<!ENTITY/iu.test(xml))
    throw Error("PRIVATE_ORIGINAL_PAGE_DATE_SOURCE_INVALID");
  if(source.media==="rss"&&!/<rss(?:\s|>)/iu.test(xml))return null;
  if(source.media==="atom"&&!/<(?:atom:)?feed(?:\s|>)/iu.test(xml))return null;
  const published=typeof publishedAt==="string"?Date.parse(publishedAt):NaN;
  const ms=now.getTime();
  if(!Number.isFinite(published)||published>ms||ms-published>MAX_AGE_MS)
    return null;
  const original=canonicalOriginalUrl(articleUrl,source);
  if(!original)return null;
  const rss=source.media==="rss";
  const entries=rss
    ?[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)]
    :[...xml.matchAll(/<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/giu)];
  for(const [,item] of entries.slice(0,MAX_ITEMS)){
    // A supplied feed item pubDate/published (including FUTURE and invalid
    // values) must never be silently overwritten with another timestamp.
    if(xmlTag(item,rss?"pubDate":"published")!==null)continue;
    const title=textValue(xmlTag(item,"title"));
    if(!title || (!captureAllTopics &&
       (!(source.topic instanceof RegExp)||!source.topic.test(title))))
      continue;
    const link=canonicalOriginalUrl(rss?officialOriginalRssArticleUrl(item,source):atomArticleLink(item,source),source);
    if(link!==original)continue;
    return {
      schema:"geomacro.private-original-article-candidate.v1",
      domain:source.domain,
      original_publisher_organization_id:APPROVED_SOURCE_ORGS[source.id],
      source_id:source.id,
      discovery_topic_matched:source.topic instanceof RegExp && source.topic.test(title),
      article_category_relevance_verified:false,
      original_article_sha256:digest(original),
      headline_fingerprint_sha256:digest(title.toLowerCase()
        .normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu," ")
        .replace(/\s+/gu," ").trim()),
      native_published_at:new Date(published).toISOString(),
      publication_clock_evidence:"verified_first_party_original_article_published",
      read_transport_verified:true,
      original_article_content_verified:false,
      same_event_claim_identity_verified:false,
      independently_authored_reporting_verified:false,
      commercial_derived_use_rights_verified:false,
      eligible_for_scoring:false,eligible_for_publication:false,
    };
  }
  return null;
}
export function classifyPrivateOriginalCandidateDuplicates(candidates) {
  if(!Array.isArray(candidates)||candidates.length>240)
    throw Error("PRIVATE_ORIGINAL_CANDIDATE_ARRAY_INVALID");
  const exact=new Map();
  const headlineGroups=new Map();
  for(const c of candidates) {
    if(!c||c.schema!=="geomacro.private-original-article-candidate.v1"||
       !["geopolitics","macro","rare_earth"].includes(c.domain)||
       !/^[a-f0-9]{64}$/u.test(String(c.original_article_sha256))||
       !/^[a-f0-9]{64}$/u.test(String(c.headline_fingerprint_sha256))||
       !Object.values(APPROVED_SOURCE_ORGS).includes(c.original_publisher_organization_id)||
       c.eligible_for_scoring!==false||c.eligible_for_publication!==false)
      throw Error("PRIVATE_ORIGINAL_CANDIDATE_NOT_VERIFIED");
    const articleId=c.domain+":"+c.original_article_sha256;
    if(!exact.has(articleId))exact.set(articleId,c);
  }
  for(const c of exact.values()) {
    const key=c.domain+":"+c.headline_fingerprint_sha256;
    const group=headlineGroups.get(key)??new Set();
    group.add(c.original_publisher_organization_id);
    headlineGroups.set(key,group);
  }
  return {
    schema:"geomacro.private-original-candidate-dedup-receipt.v1",
    observed_candidate_count:candidates.length,
    exact_article_unique_count:exact.size,
    same_url_article_duplicates_suppressed:candidates.length-exact.size,
    possible_cross_publisher_same_headline_groups:
      [...headlineGroups.values()].filter(x=>x.size>=2).length,
    same_event_corroborated_count:0,
    independently_scored_events_count:0,
    source_rights_verified:false,
    signed_gro_published:false,
    chargeable:false,
    // A title match can be syndicated, and a different title can describe
    // the same event: neither result automatically satisfies event identity.
    event_identity_review_required:true,
  };
}
