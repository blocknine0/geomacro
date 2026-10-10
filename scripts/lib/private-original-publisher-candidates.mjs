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

const MAX_ITEMS=40;
const MAX_AGE_MS=6*60*60*1000;
const MAX_TITLE=300;
const MAX_URL=1600;
const APPROVED_SOURCE_ORGS=Object.freeze({
  un_news_security_original_rss_review:"un_news",
  uk_fcdo_original_foreign_policy_atom_review:"uk_fcdo",
  fed_monetary_original_press_rss_review:"federal_reserve",
  statcan_prices_original_atom_review:"statistics_canada",
  nrcan_government_news_original_atom_review:"natural_resources_canada",
  usgs_minerals_original_news_rss_review:"usgs",
});
const digest=s=>createHash("sha256").update(s,"utf8").digest("hex");
function textValue(s) {
  if(typeof s!=="string"||s.length>MAX_TITLE*5) return null;
  const normalized=s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/giu,"$1")
    .replace(/&amp;/giu,"&").replace(/&quot;/giu,'"')
    .replace(/&#39;|&apos;/giu,"'").replace(/&lt;/giu,"<")
    .replace(/&gt;/giu,">").replace(/\s+/gu," ").trim();
  if(normalized.length<8||normalized.length>MAX_TITLE||
     /<[^>]*>|\p{Cc}/u.test(normalized))return null;
  return normalized;
}
function canonicalOriginalUrl(raw,source) {
  if(typeof raw!=="string"||raw.length>MAX_URL||
     !Array.isArray(source?.original_hosts))return null;
  let url;
  try {url=new URL(raw.replace(/&amp;/giu,"&"))}catch{return null}
  if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
     !source.original_hosts.includes(url.hostname) ||
     !/^\/(?!\/)/u.test(url.pathname)) return null;
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
function atomArticleLink(chunk) {
  for(const m of chunk.matchAll(/<(?:atom:)?link\b([^>]*?)\/?\s*>/giu)){
    const rel=m[1].match(/\brel\s*=\s*["']([^"']+)["']/iu)?.[1]??"alternate";
    if(rel!=="alternate"&&rel!=="canonical")continue;
    return m[1].match(/\bhref\s*=\s*["']([^"']+)["']/iu)?.[1]??null;
  }
  return null;
}
export function originalPublisherPrivateCandidates(xml,source,now=new Date()) {
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
    const timestamp=Date.parse(native);
    if(!Number.isFinite(timestamp)||timestamp>now.getTime()||
      now.getTime()-timestamp>MAX_AGE_MS)continue;
    const title=textValue(xmlTag(item,"title"));
    if(!title||!(source.topic instanceof RegExp)||
       !source.topic.test(title))continue;
    const original=canonicalOriginalUrl(rss?xmlTag(item,"link"):atomArticleLink(item),source);
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
