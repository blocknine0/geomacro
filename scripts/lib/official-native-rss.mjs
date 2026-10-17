import { fetchOriginalAlternate } from "./official-native-alternates.mjs";
import {validatePrivatePulseRefs,privateOriginalMatchesPulse,canonicalPrivateOriginalArticleSha,assertPrivatePulseArticleContext} from "./private-novel-pulse-match.mjs";
import {createD1ControlPlaneStateClient} from "./d1-control-plane-state.mjs";
import {selectPrivateNovelPulseRefs} from "./private-novel-pulse-match.mjs";
import {fetchPulseRotatedPrivateOriginals} from "./pulse-rotated-original-scorer.mjs";
import {PRIVATE_SCORING_ATTEMPTS_PIPELINE,validateClaimForPrivateScorer} from "./private-classifier-retry-ledger.mjs";
import {officialOriginalRssArticleUrl} from "./official-rss-original-link.mjs";
import {officialItemNativePublicationMs} from "./official-native-item-publication-date.mjs";
import { fetchOfficialThirdPublisherArticles } from "./official-native-third-fallback.mjs";
import { fetchOriginalPublisherWithRecovery } from "./official-native-network-retry.mjs";
import { fetchVerifiedPublisherPageDate, ORIGINAL_ARTICLE_MAX_PROBES_PER_DOMAIN } from "./official-original-article-date.mjs";
// Read-only original-publisher RSS evidence discovery. NO commercial admission,
// source-certification bypass, scoring, B2 writes or public/paid output.
// GDELT seendate/index timestamps are explicitly NOT publication evidence.
export const OFFICIAL_NATIVE_FEEDS = Object.freeze({
  geopolitics: Object.freeze({
    url: "https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml",
    host: "news.un.org",
    source_id: "un_news_peace_security_rss_pending_review",
    topics: /\b(?:security council|ceasefire|sanctions?|armed conflict|border conflict|military|missile|airstrikes?|invasion|displacement|peace talks|humanitarian crisis|war crimes|hostilities|geopolitical|peacekeeping)\b/iu,
  }),
  macro: Object.freeze({
    url: "https://www.federalreserve.gov/feeds/press_monetary.xml",
    host: "www.federalreserve.gov",
    source_id: "federal_reserve_monetary_rss_pending_review",
    topics: /\b(?:fomc|monetary|interest rates?|rate (?:cut|hike|increase|reduction)|federal funds|inflation|foreign exchange|currency|central bank|economic outlook|reserve balances)\b/iu,
  }),
  rare_earth: Object.freeze({
    url: "https://www.usgs.gov/news/minerals/feed",
    host: "www.usgs.gov",
    source_id: "usgs_mineral_news_rss_pending_review",
    topics: /\b(?:critical minerals?|rare earths?|lithium|cobalt|nickel|graphite|gallium|germanium|neodymium|dysprosium|terbium|mineral (?:supply|production|reserve|trade|deposit|resource|assessment)|mineral commodity|strategic minerals?)\b/iu,
  }),
});
const MAX_RESPONSE_BYTES = 384 * 1024;
const MAX_ITEM_COUNT = 100;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const VALID_TYPES = /^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:;|$)/iu;

function unescapeXml(value) {
  return String(value ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1")
    .replace(/&(?:amp|lt|gt|quot|apos|#(\d+)|#x([0-9a-f]+));/giu, (matched, dec, hex) => {
      const named = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
      if (named[matched.toLowerCase()]) return named[matched.toLowerCase()];
      const code = dec ? Number(dec) : Number.parseInt(hex, 16);
      return Number.isInteger(code) && code > 0 && code <= 0x10FFFF
        ? String.fromCodePoint(code) : "";
    })
    .replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
}
function field(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "iu"));
  return match ? unescapeXml(match[1]) : "";
}

function safeOriginalUrl(raw, host) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password ||
        u.hostname.toLowerCase() !== host || u.href.length > 2048) return null;
    return u.href;
  } catch {
    return null;
  }
}

// Does not infer a timestamp from feed updated, retrieval or GDELT discovery.
// A SOURCE-NATIVE per-item <pubDate> is essential.
export function parseOfficialNativeRss(xml, category, now = new Date(), maxAgeMs = MAX_AGE_MS, diagnostics = null, broadPrivateIntake = false) {
  const config = OFFICIAL_NATIVE_FEEDS[category];
  if (!config || typeof xml !== "string" || xml.length > MAX_RESPONSE_BYTES ||
      !xml.includes("<rss") || /<!DOCTYPE|<!ENTITY/iu.test(xml)) {
    throw new Error("OFFICIAL_NATIVE_RSS_DOCUMENT_INVALID");
  }
  const asOfMs = now.getTime();
  if (!Number.isFinite(asOfMs) || !Number.isFinite(maxAgeMs) ||
      maxAgeMs < 60_000 || maxAgeMs > MAX_AGE_MS) {
    throw new Error("OFFICIAL_NATIVE_RSS_CLOCK_INVALID");
  }
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)].slice(0, MAX_ITEM_COUNT);
  const dedupe = new Set();
  const rows = [];
  const stats = {
    item_count: items.length,
    item_native_pubdate_count: 0,
    item_native_date_in_window_count: 0,
    exact_publisher_host_count: 0,
    domain_topic_title_count: 0,
    admitted_private_count: 0,
  };
  for (const match of items) {
    const block = match[1];
    const title = field(block, "title");
    // UN News RSS may point to its /feed/view/ router while an exact
    // same-ID first-party permalink GUID names the true article identity.
    // Reuse the ORIGINAL pulse's strict, already-reviewed resolver so URL
    // SHA and source-native timestamp match the separately readback D1 row.
    const rawLink=field(block,"link");
    const canonical=category==="geopolitics"
      ?officialOriginalRssArticleUrl(block,{id:"un_news_security_original_rss_review"})
      :null;
    // Preserve existing non-router first-party RSS intake: historic live
    // same-host article paths are still discovery hints, but an actual UN
    // /feed/view/ router must NEVER enter the classifier without an exact
    // same-ID publisher permalink GUID.
    const isUnFeedRouter=category==="geopolitics" && (()=>{
      try {const u=new URL(rawLink);return u.hostname===config.host &&
        u.pathname.startsWith("/feed/");}catch{return false;}
    })();
    const link=category==="geopolitics"
      ?(canonical??(isUnFeedRouter?null:rawLink)):rawLink;
    const url = safeOriginalUrl(link, config.host);
    const original = field(block, "pubDate");
    const at = officialItemNativePublicationMs(original);
    if (Number.isFinite(at)) stats.item_native_pubdate_count += 1;
    // Publication dates later than the evaluation clock are not evidence of
    // a published event; even short future skew must fail closed.
    const current = Number.isFinite(at) && at <= asOfMs &&
      asOfMs - at <= maxAgeMs;
    if (current) stats.item_native_date_in_window_count += 1;
    if (url) stats.exact_publisher_host_count += 1;
    if (config.topics.test(title)) stats.domain_topic_title_count += 1;
    if (!url || title.length < 16 || title.length > 500 ||
        (!broadPrivateIntake && !config.topics.test(title)) || !current ||
        dedupe.has(url)) continue;
    dedupe.add(url);
    stats.admitted_private_count += 1;
    rows.push({
      title, description: "", url, publishedAt: new Date(at).toISOString(),
      source: config.host, sourceDomain: config.host,
      discoveryProvider: "official_native_rss",
      nativePublishedAtVerified: true,
      nativeTimeEvidence: "publisher_rss_item_pubDate",
      privateOnly: true,
      rightsVerified: false,
      commercialEligible: false,
    });
  }
  if (diagnostics && typeof diagnostics === "object" && !Array.isArray(diagnostics)) {
    Object.assign(diagnostics, stats);
  }
  return rows.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

// Reuse the exact first-party HTML datePublished authority used by the
// twelve-lane private monitor, but feed recovered candidates into the
// REAL canonical classifier rather than only emitting observation counts.
// Maximum 2 exact article pages per category, only for ABSENT item pubDate.
// Never rescue invalid/future pubDate or use channel, updated or fetch clock.
// The helper can only reconstruct compile-time Fed/USGS paths; an untrusted
// URL cannot add a new destination, even with a first-party hostname.
export async function recoverPrivateOfficialRssMissingDates(xml, category,{
  now=new Date(),maxAgeMs=MAX_AGE_MS,fetchImpl=fetch,diagnostics=null,
  broadPrivateIntake=false,pulseRefs=null,pulseExpectedClocks=null,
}={}) {
  assertPrivatePulseArticleContext(pulseRefs,pulseExpectedClocks);
  const config=OFFICIAL_NATIVE_FEEDS[category];
  const nowMs=now.getTime();
  if(!["macro","rare_earth"].includes(category) || !config ||
     typeof xml!=="string" || xml.length>MAX_RESPONSE_BYTES ||
     !/<rss(?:\s|>)/iu.test(xml) || /<!DOCTYPE|<!ENTITY/iu.test(xml) ||
     !Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs) ||
     maxAgeMs<60000 || maxAgeMs>MAX_AGE_MS) return [];
  const candidates=[],seen=new Set();
  for(const [,block] of [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)].slice(0,MAX_ITEM_COUNT)){
    if(/<pubDate\b[^>]*>/iu.test(block))continue;
    const title=field(block,"title"),url=safeOriginalUrl(field(block,"link"),config.host);
    if(!url || (!broadPrivateIntake && !config.topics.test(title)) || title.length<16 ||
       title.length>500 || seen.has(url))continue;
    if(pulseRefs instanceof Set){
      const id=canonicalPrivateOriginalArticleSha(url);
      if(!id||!pulseRefs.has(id))continue;
    }
    seen.add(url);
    candidates.push({title,url});
    if(candidates.length>=ORIGINAL_ARTICLE_MAX_PROBES_PER_DOMAIN)break;
  }
  const result=[];
  for(const row of candidates){
    const date=await fetchVerifiedPublisherPageDate(row.url,category,{
      now,fetchImpl,
    });
    if(diagnostics && typeof diagnostics==="object" && !Array.isArray(diagnostics))
      diagnostics.original_page_precise_date_checks=
        (diagnostics.original_page_precise_date_checks??0)+1;
    if(!date)continue;
    const asOf=Date.parse(date);
    if(!Number.isFinite(asOf)||asOf>nowMs||nowMs-asOf>maxAgeMs)continue;
    const article={
      title:row.title,description:"",url:row.url,
      publishedAt:date,source:config.host,sourceDomain:config.host,
      discoveryProvider:"official_native_rss",
      nativePublishedAtVerified:true,
      nativeTimeEvidence:"publisher_original_article_datePublished",
      privateOnly:true,rightsVerified:false,commercialEligible:false,
    };
    if(pulseRefs instanceof Set&&
       !privateOriginalMatchesPulse(article,pulseRefs,nowMs,pulseExpectedClocks))continue;
    result.push(article);
  }
  if(diagnostics && typeof diagnostics==="object" && !Array.isArray(diagnostics))
    diagnostics.original_page_precise_date_admitted=result.length;
  return result.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
}

async function boundedRssFetch(url, fetchImpl) {
  const response = await fetchOriginalPublisherWithRecovery(url, {
    fetchImpl,
    headers: { accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
      "user-agent": "Geomacro-Official-Source-Private-Discovery/1.0" },
  });
  if (!response.ok || !VALID_TYPES.test(response.headers.get("content-type") ?? "")) {
    throw new Error("OFFICIAL_NATIVE_RSS_TRANSPORT_INVALID");
  }
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_RESPONSE_BYTES) throw new Error("OFFICIAL_NATIVE_RSS_TOO_LARGE");
  if (!response.body) throw new Error("OFFICIAL_NATIVE_RSS_BODY_MISSING");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("OFFICIAL_NATIVE_RSS_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
  );
}

export async function fetchOfficialNativeArticles(category, {
  now = new Date(), fetchImpl = fetch, maxAgeMs = MAX_AGE_MS, diagnostics = null,
  includeSecondPublisher = false,
  includeThirdPublisher = false,
  includeOriginalPageDateFallback = false,
  sampleAllPublishers = false,
  broadPrivateIntake = false,
} = {}) {
  // Automatic D1 novel-article trigger: only the source-native articles
  // whose URL SHA matches the independently persisted D1 refs may proceed
  // to the existing private classifier. Other modes are unchanged.
  let refs=null;
  let expectedClocks=null;
  let originalPulseAt=null;
  // Only an authorized, typed reusable-workflow input may claim this is
  // the D1-novel-original automatic stage. Event names alone were unsafe:
  // GitHub may wake the same source pulse by schedule, push or workflow_run.
  // Those must ALL consume exactly the new URL-SHA refs verified from D1.
  // Manual dispatch/push scorer paths deliberately retain their prior mode.
  const automaticRequested=process.env.GEOMACRO_AUTOMATIC_D1_PULSE_STAGE==="true";
  const fromAutomaticPulse=automaticRequested &&
    process.argv.includes("--private-scored-stage") &&
    process.env.GITHUB_REPOSITORY==="blocknine0/geomacro" &&
    process.env.GITHUB_REF==="refs/heads/main";
  if(automaticRequested&&!fromAutomaticPulse)
    throw Error("PRIVATE_PULSE_AUTO_CONTEXT_UNVERIFIED");
  if(fromAutomaticPulse){
    const read=await createD1ControlPlaneStateClient({
      pipeline:"official_source_pulse_30m",
    }).loadRows();
    const snapshot=read.get(category);
    refs=selectPrivateNovelPulseRefs(snapshot,category,now.getTime());
    if(snapshot?.payload?.private_classifier_work_refs!==undefined){
      const attemptRow=(await createD1ControlPlaneStateClient({
        pipeline:PRIVATE_SCORING_ATTEMPTS_PIPELINE,
      }).loadRows()).get(category);
      const allowed=validateClaimForPrivateScorer(snapshot,attemptRow,
        category,process.env.GITHUB_RUN_ID,now.getTime());
      if(allowed.size!==refs.size||[...refs].some(x=>!allowed.has(x)))
        throw Error("PRIVATE_CLASSIFIER_WORK_CLAIM_MISMATCH");
    }
    // No claimed original in THIS category: no native network or model budget.
    if(refs.size===0)return [];
    originalPulseAt=snapshot.payload.checked_at;
    expectedClocks=new Map(
      snapshot.payload.recent_private_article_fingerprints
        .filter(x=>refs.has(x.article_sha256))
        .map(x=>[x.article_sha256,x.native_published_at]),
    );
    if(expectedClocks.size!==refs.size)
      throw Error("PRIVATE_PULSE_D1_NATIVE_CLOCKS_UNVERIFIED");
  } else if(process.env.GEOMACRO_PRIVATE_PULSE_SCOPED==="true"){
    let decoded;
    try{decoded=JSON.parse(process.env.GEOMACRO_PRIVATE_PULSE_REFS??"null")}
    catch{throw Error("PRIVATE_PULSE_REFS_INVALID")}
    refs=validatePrivatePulseRefs(category,decoded);
    if(refs.size===0)throw Error("PRIVATE_PULSE_REFS_INVALID");
  }
  const selected=rows=>refs
    ? rows.filter(row=>privateOriginalMatchesPulse(
        row,refs,now.getTime(),expectedClocks))
    : rows;
  const finish=async rows=>{
    const current=selected(rows);
    if(!fromAutomaticPulse||current.length>=refs.size)return current;
    // The D1 pulse rotates more first-party issuers than the legacy three
    // private RSS fallback lanes. Re-poll ONLY that pulse's exact fixed extra
    // issuers and only for real novel SHA+native-date readback. This is never
    // a scoring/signing/rights override, and costs zero GET on quiet polls.
    const extra=await fetchPulseRotatedPrivateOriginals({
      category,checkedAt:originalPulseAt,refs,expectedClocks,now,fetchImpl,
    });
    const seen=new Set(current.map(item=>item.url));
    return [...current,...extra.filter(item=>{
      if(seen.has(item.url))return false;
      seen.add(item.url);return true;
    })].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  };
  const config = OFFICIAL_NATIVE_FEEDS[category];
  if (!config) throw new Error("OFFICIAL_NATIVE_RSS_CATEGORY_INVALID");
  let primary = [];
  let primaryUnavailable = false;
  try {
    const rss=await boundedRssFetch(config.url,fetchImpl);
    primary=parseOfficialNativeRss(rss,category,now,maxAgeMs,diagnostics,broadPrivateIntake);
    if(selected(primary).length===0 && includeOriginalPageDateFallback &&
        (category==="macro" || category==="rare_earth")){
      primary=await recoverPrivateOfficialRssMissingDates(rss,category,{
        now,maxAgeMs,fetchImpl,diagnostics,broadPrivateIntake,
        pulseRefs:fromAutomaticPulse?refs:null,
        pulseExpectedClocks:fromAutomaticPulse?expectedClocks:null,
      });
    }
  } catch {
    primaryUnavailable = true;
  }
  if (diagnostics && typeof diagnostics === "object") {
    diagnostics.primary_feed_ok = !primaryUnavailable;
    diagnostics.alternate_feed_attempted = false;
    diagnostics.alternate_feed_ok = null;
  }
  // The primary official USGS mineral RSS may be empty, and agency monetary
  // and UN specialist feeds are intermittent. A SECOND FIXED original
  // publisher feed can add genuine new events without date laundering.
  // Default stays source-budget minimal. Explicit private dual-family staging
  // probes the fixed alternate even with eligible primary items. This widens
  // discovery ONLY: shared articles or distinct hosts do not prove corroboration,
  // commercial rights, severity, or any public publication eligibility.
  if (primary.length > 0 && !includeSecondPublisher && !sampleAllPublishers) return finish(primary);
  if (diagnostics && typeof diagnostics === "object")
    diagnostics.alternate_feed_attempted = true;
  let alternate = [];
  let alternateUnavailable = false;
  try {
    alternate = await fetchOriginalAlternate(category,{
      now,fetchImpl,diagnostics,maxAgeMs,broadPrivateIntake,
      pulseRefs:fromAutomaticPulse?refs:null,
      pulseExpectedClocks:fromAutomaticPulse?expectedClocks:null,
    });
    if (diagnostics && typeof diagnostics === "object")
      diagnostics.alternate_feed_ok = true;
  } catch {
    alternateUnavailable = true;
    if (diagnostics && typeof diagnostics === "object")
      diagnostics.alternate_feed_ok = false;
  }
  const seen = new Set(primary.map(row => row.url));
  const combined = [...primary,...alternate.filter(row => !seen.has(row.url))]
    .sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  if (diagnostics && typeof diagnostics === "object") {
    diagnostics.third_feed_attempted = false;
    diagnostics.third_feed_ok = null;
    diagnostics.third_feed_failure_code = null;
  }
  if (!sampleAllPublishers && (combined.length>0 || !includeThirdPublisher)) {
    if (!combined.length && primaryUnavailable && alternateUnavailable)
      throw new Error("OFFICIAL_ORIGINAL_FEEDS_UNAVAILABLE");
    return finish(combined);
  }
  // Default: consult the third feed only when the earlier feeds are empty.
  // Complete sampling: always inspect the fixed third feed, even when an
  // earlier publisher has news. This avoids suppressing unrelated new events.
  // Still at most three fixed feeds; downstream classifier quota is unchanged.
  // Never fill quiet periods using stale feed clocks or GDELT seen dates.
  if (diagnostics && typeof diagnostics === "object")
    diagnostics.third_feed_attempted = true;
  try {
    const third=await fetchOfficialThirdPublisherArticles(category,{
      now,fetchImpl,maxAgeMs,diagnostics,broadPrivateIntake,
      pulseRefs:fromAutomaticPulse?refs:null,
      pulseExpectedClocks:fromAutomaticPulse?expectedClocks:null,
    });
    if (diagnostics && typeof diagnostics === "object")
      diagnostics.third_feed_ok = true;
    const urls = new Set(combined.map(row => row.url));
    const merged = [...combined];
    for (const row of third) {
      if (!urls.has(row.url)) { urls.add(row.url); merged.push(row); }
    }
    return finish(merged.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)));
  } catch (error) {
    if (diagnostics && typeof diagnostics === "object") {
      diagnostics.third_feed_ok = false;
      const code = error instanceof Error ? error.message : "";
      // Explicit closed enum. Catch never prints arbitrary host, URL, HTML
      // or third-party error messages as operational diagnostics.
      const allowed = new Set([
        "OFFICIAL_THIRD_HTTP_FORBIDDEN",
        "OFFICIAL_THIRD_HTTP_NOT_FOUND",
        "OFFICIAL_THIRD_HTTP_RATE_LIMITED",
        "OFFICIAL_THIRD_HTTP_UPSTREAM_FAILURE",
        "OFFICIAL_THIRD_HTTP_NOT_OK",
        "OFFICIAL_THIRD_CONTENT_TYPE_INVALID",
        "OFFICIAL_THIRD_BODY_INVALID",
        "OFFICIAL_THIRD_TOO_LARGE",
        "OFFICIAL_THIRD_RSS_INVALID",
        "OFFICIAL_THIRD_CLOCK_INVALID",
        "ORIGINAL_FEED_NETWORK_UNAVAILABLE",
        "ORIGINAL_FEED_RECOVERY_EXHAUSTED",
      ]);
      diagnostics.third_feed_failure_code = allowed.has(code)
        ? code : "OFFICIAL_THIRD_UNEXPECTED_FAILURE";
    }
    if (primaryUnavailable && alternateUnavailable)
      throw new Error("OFFICIAL_ORIGINAL_FEEDS_UNAVAILABLE");
    return finish(combined);
  }
}
