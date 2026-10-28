import {verifyCanadaOriginalDayEvidence} from "./official-original-day-evidence.mjs";
import {pinnedGovUkContentApiUrl,verifiedGovUkContentFirstPublishedAt}
  from "./govuk-original-content-clock.mjs";

// Publisher Content API read is not a second source: it must be coupled to
// the exact first-party HTML and consume the same bounded two-GET pool.
const GOVUK_API_MAX_BYTES=128*1024;
// Private, bounded, same-original-publisher verification for Atom feeds that
// omit per-entry <published>. An Atom <updated> is NEVER publication proof.
// No raw HTML/title/URL is persisted to a public proof, log or paid response.
// Real GOV.UK original pages can exceed 128 KiB; the live 30-minute pulse
// reported BODY_TOO_LARGE despite a valid first-party article link. Allow a
// strictly bounded 384 KiB original HTML response, with the SAME two-page
// GET budget/source, no redirects and no persistent article/body storage.
const PAGE_BYTES_MAX = 384 * 1024;
const PAGE_TIMEOUT_MS = 4_000;
const ONE_DAY_MS = 86_400_000;
// Explicit timezone mandatory. ISO 8601 permits >millisecond source precision
// and ±HHMM offsets; normalize only those pinned shapes. No local timezone.
const PRECISE_DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,9})?)?(?:Z|[+-]\d\d:?\d\d)$/iu;
const HTML_TYPE = /^text\/html(?:;|$)/iu;

export const ORIGINAL_ARTICLE_MAX_PROBES_PER_DOMAIN = 2;
// Only these coarse outcome enums may leave the in-memory first-party HTML
// verifier. Never expose publication text, article URL or original content.
export const SAFE_ORIGINAL_PAGE_DATE_REASONS = Object.freeze([
  "MISSING_PUBLISHER_PUBLICATION_METADATA",
  "IMPRECISE_DATE_ONLY",
  "INVALID_PUBLICATION_DATE_SHAPE",
  "FUTURE_PUBLISHER_PUBLICATION",
  "STALE_PUBLISHER_PUBLICATION",
  "CONFLICTING_PUBLISHER_PUBLICATION",
  "PRECISE_PUBLICATION_ACCEPTED",
]);

function attr(tag, name) {
  const allowed = ["name", "property", "content", "type"];
  if (!allowed.includes(name)) return "";
  const pattern = new RegExp("(?:^|\\s)" + name + "\\s*=\\s*([\"'])([^\"']{1,1024})\\1", "iu");
  return tag.match(pattern)?.[2] ?? "";
}

function parsePublisherOriginalClock(value) {
  if (typeof value !== "string" || !PRECISE_DATE.test(value)) return NaN;
  // JS Date.parse normalizes impossible dates on some runtimes. Validate
  // the author's original YYYY-MM-DD before any timezone arithmetic.
  const parts=/^(\d{4})-(\d\d)-(\d\d)T/u.exec(value);
  if(!parts)return NaN;
  const year=Number(parts[1]),month=Number(parts[2]),day=Number(parts[3]);
  const calendar=new Date(Date.UTC(year,month-1,day));
  if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()+1!==month||
     calendar.getUTCDate()!==day)return NaN;
  const offset=/([+-])(\d\d):?(\d\d)$/u.exec(value);
  if(offset && (Number(offset[2])>14 || Number(offset[3])>59 ||
     (Number(offset[2])===14 && Number(offset[3])!==0)))return NaN;
  // Truncate (never round) sub-millisecond digits, preserving the original
  // explicitly declared instant within <1ms. Never synthesize a missing zone.
  const canonical=value.replace(/([+-]\d\d)(\d\d)$/u,"$1:$2")
    .replace(/(\.\d{3})\d{1,6}(?=Z|[+-]\d\d:\d\d$)/iu,"$1");
  return Date.parse(canonical);
}
function precise(value, nowMs, maxAgeMs = ONE_DAY_MS) {
  const ms = parsePublisherOriginalClock(value);
  if (!Number.isFinite(ms) || ms > nowMs || nowMs - ms > maxAgeMs) return null;
  return ms;
}

function walkArticleJsonLd(value, found, depth = 0) {
  if (depth > 6 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 30)) walkArticleJsonLd(item, found, depth + 1);
    return;
  }
  const type = value["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((item) => typeof item === "string" &&
    /^(?:NewsArticle|Article|Report)$/u.test(item))) {
    found.push(value.datePublished);
  }
  if (value["@graph"]) walkArticleJsonLd(value["@graph"], found, depth + 1);
}

// Accept HTML-permitted whitespace in closing script tags without an unbounded
// HTML regexp. Never treat a partial '</script-other>' as a terminator.
function closingScriptTag(source, from) {
  let offset = from;
  for (let scan = 0; scan < 24; scan += 1) {
    const begin = source.indexOf("</script", offset);
    if (begin < 0) return null;
    let end = begin + 8; // '</script'
    while (end < source.length && end - begin <= 24 &&
        (source[end] === " " || source[end] === "\t" ||
         source[end] === "\n" || source[end] === "\r" ||
         source[end] === "\f")) end += 1;
    if (source[end] === ">") return { begin, end: end + 1 };
    offset = begin + 8;
  }
  return null;
}

/**
 * @param {string} html
 * @param {Date} [now]
 * @param {{date_reason?: string}|null} [diagnostics]
 * @param {{maxAgeMs?: number}} [options]
 */
export function verifiedPublisherPageDate(
  html, now = new Date(), diagnostics = null, options = {},
) {
  // Existing 24h readers retain the exact previous default. Only explicit,
  // bounded on-demand historical queries may extend their original-date age.
  const requestedAge = options?.maxAgeMs;
  const maxAgeMs = Number.isInteger(requestedAge) && requestedAge>0 &&
    requestedAge<=31*ONE_DAY_MS ? requestedAge : ONE_DAY_MS;
  const reason = (code) => {
    if (diagnostics && typeof diagnostics === "object" &&
        !Array.isArray(diagnostics) &&
        SAFE_ORIGINAL_PAGE_DATE_REASONS.includes(code))
      diagnostics.date_reason = code;
  };
  if (typeof html !== "string" || html.length > PAGE_BYTES_MAX ||
      /<!DOCTYPE\s+[^>]*\[/iu.test(html)) return null;
  const ms = now.getTime();
  if (!Number.isFinite(ms)) return null;
  const candidates = [];
  // Linear, explicitly capped scans rather than potentially quadratic HTML
  // regex matching on untrusted original-publisher markup.
  const lowered = html.toLowerCase();
  let offset = 0;
  for (let scanned = 0; scanned < 60; scanned += 1) {
    const begin = lowered.indexOf("<meta", offset);
    if (begin < 0) break;
    offset = begin + 5;
    const next = lowered[offset];
    if (next !== " " && next !== "\n" && next !== "\t" && next !== ">") continue;
    const end = lowered.indexOf(">", offset);
    if (end < 0 || end - begin > 1100) continue;
    const tag = html.slice(begin, end + 1);
    offset = end + 1;
    const name = attr(tag, "name").toLowerCase();
    const property = attr(tag, "property").toLowerCase();
    // GOV.UK official metadata calls this the original *first* publication
    // clock. Never use govuk:updated-at or public-updated-at as an event time.
    if (property === "article:published_time" || name === "datepublished" ||
        name === "govuk:first-published-at") {
      candidates.push(attr(tag, "content"));
    }
  }
  offset = 0;
  for (let scanned = 0; scanned < 20; scanned += 1) {
    const begin = lowered.indexOf("<script", offset);
    if (begin < 0) break;
    offset = begin + 7;
    const next = lowered[offset];
    if (next !== " " && next !== "\n" && next !== "\t" && next !== ">") continue;
    const openingEnd = lowered.indexOf(">", offset);
    if (openingEnd < 0 || openingEnd - begin > 500) continue;
    const closing = closingScriptTag(lowered, openingEnd + 1);
    if (!closing) break;
    offset = closing.end;
    if (closing.begin - openingEnd > 30000) continue;
    const tag = html.slice(begin, openingEnd + 1);
    if (!/^(?:application\/ld\+json)(?:;|$)/iu.test(attr(tag, "type"))) continue;
    const body = html.slice(openingEnd + 1, closing.begin);
    try { walkArticleJsonLd(JSON.parse(body), candidates); } catch { /* no script execution */ }
  }
  // No original precise timestamp, invalid timestamp, or conflicting publisher
  // timestamps means no admission. Never substitute updated/dateModified.
  if (!candidates.length) {
    reason("MISSING_PUBLISHER_PUBLICATION_METADATA");
    return null;
  }
  if (candidates.length > 20) {
    reason("CONFLICTING_PUBLISHER_PUBLICATION");
    return null;
  }
  if (candidates.some(value=>typeof value==="string" && /^\d{4}-\d{2}-\d{2}$/u.test(value))) {
    // A calendar day cannot prove a precise fresh 24h publication clock.
    reason("IMPRECISE_DATE_ONLY");return null;
  }
  if (candidates.some(value=>typeof value!=="string" || !PRECISE_DATE.test(value))) {
    reason("INVALID_PUBLICATION_DATE_SHAPE");return null;
  }
  const times = candidates.map(value=>parsePublisherOriginalClock(value));
  if (times.some(time=>!Number.isFinite(time))) {
    reason("INVALID_PUBLICATION_DATE_SHAPE");return null;
  }
  if (times.some(time=>time>ms)) {
    reason("FUTURE_PUBLISHER_PUBLICATION");return null;
  }
  if (times.some(time=>ms-time>maxAgeMs)) {
    reason("STALE_PUBLISHER_PUBLICATION");return null;
  }
  if (Math.max(...times) - Math.min(...times) > 60_000) {
    reason("CONFLICTING_PUBLISHER_PUBLICATION");return null;
  }
  // Keep the original strict same-day precise verifier authoritative.
  if (times.some(time=>time===null) ||
      candidates.some(value=>precise(value,ms,maxAgeMs)===null)) {
    reason("INVALID_PUBLICATION_DATE_SHAPE");return null;
  }
  reason("PRECISE_PUBLICATION_ACCEPTED");
  return new Date(Math.min(...times)).toISOString();
}

// The upstream Atom URL is untrusted input even with an agency-supplied link.
// Never fetch its href: rebuild only exact publisher paths from validated,
// ASCII-only, fixed-shape components on compile-time origins.
function fixedPublisherArticle(rawUrl, category) {
  if (typeof rawUrl !== "string" || rawUrl.length > 350) return null;
  try {
    const candidate = new URL(rawUrl);
    if (candidate.protocol !== "https:" || candidate.username || candidate.password ||
        candidate.port || candidate.search || candidate.hash) return null;
    const path = candidate.pathname;
    if (category === "macro" && candidate.hostname === "www.statcan.gc.ca") {
      // Documented first-party The Daily article route. Six-digit date
      // must agree with its dq filename; no arbitrary .htm, portal, or
      // non-publisher URL can be used for page-date verification.
      const match = /^\/daily-quotidien\/([0-9]{6})\/dq([0-9]{6})([a-z][a-z0-9-]{0,35})-eng\.(htm|html)$/u.exec(path);
      if (!match || match[1] !== match[2]) return null;
      // The issuer's www legacy route 301s to its documented www150 /n1/
      // article; reconstruct that exact canonical same-issuer URL directly.
      // No automatic redirect or additional GET is permitted (2-page quota).
      return "https://www150.statcan.gc.ca/n1/daily-quotidien/" +
        match[1] + "/dq" + match[2] + match[3] + "-eng." + match[4];
    }
    if (category === "macro" && candidate.hostname === "www150.statcan.gc.ca") {
      // StatCan serves original Daily releases under both /n1/ and
      // /n1/en/ article routes. Same publisher and strict date+filename;
      // reconstruct the exact supported path, never follow redirects.
      const match = /^\/n1\/(en\/)?daily-quotidien\/([0-9]{6})\/([a-z0-9-]{1,80})\.(htm|html)$/u.exec(path);
      if (!match) return null;
      return "https://www150.statcan.gc.ca/n1/" + (match[1]??"") +
        "daily-quotidien/" + match[2] + "/" + match[3] + "." + match[4];
    }
    if (category === "rare_earth" &&
        (candidate.hostname === "www.canada.ca" || candidate.hostname === "canada.ca")) {
      const match = /^\/en\/natural-resources-canada\/news\/([0-9]{4})\/(0[1-9]|1[0-2])\/([a-z0-9-]{1,140})\.html$/u.exec(path);
      if (!match) return null;
      const origin = candidate.hostname === "www.canada.ca"
        ? "https://www.canada.ca" : "https://canada.ca";
      return origin + "/en/natural-resources-canada/news/" +
        match[1] + "/" + match[2] + "/" + match[3] + ".html";
    }
    if (["geopolitics", "macro", "rare_earth"].includes(category) && candidate.hostname === "www.gov.uk") {
      // A precise original GOV.UK FCDO/Treasury/DBT article path only, never arbitrary
      // redirect/asset/API URLs or a caller-supplied domain.
      const match = /^\/government\/(news|speeches|world-location-news|statements|publications)\/([a-z0-9][a-z0-9-]{4,190})$/u.exec(path);
      if (!match) return null;
      return "https://www.gov.uk/government/" + match[1] + "/" + match[2];
    }
    if (category === "rare_earth" &&
        candidate.hostname === "news.gov.bc.ca") {
      const match=/^\/releases\/(20\d{2}[A-Z]{2,6}\d{4}-\d{6})$/u.exec(path);
      if(!match)return null;
      return "https://news.gov.bc.ca/releases/"+match[1];
    }
    if (category === "macro" && candidate.hostname === "www.ecb.europa.eu") {
      // Only precise ECB original press/key release pages; no RSS index,
      // data API, external redirect or origin supplied by the feed.
      const match = /^\/press\/(pr|key)\/date\/(20[0-9]{2})\/html\/([a-zA-Z0-9.~_-]{6,190})\.html$/u.exec(path);
      if (!match) return null;
      return "https://www.ecb.europa.eu/press/" + match[1] + "/date/" +
        match[2] + "/html/" + match[3] + ".html";
    }
    if (category === "macro" && candidate.hostname === "www.federalreserve.gov") {
      const match = /^\/newsevents\/pressreleases\/([a-z]{3,36}[0-9]{8}[a-z]?)\.htm$/u.exec(path);
      if (!match) return null;
      return "https://www.federalreserve.gov/newsevents/pressreleases/" + match[1] + ".htm";
    }
    if (category === "rare_earth" && candidate.hostname === "www.usgs.gov") {
      const match = /^\/news\/(national-news-release|state-news-release|science-snippet|featured-story|technical-announcement)\/([a-z0-9][a-z0-9-]{5,190})$/u.exec(path);
      if (!match) return null;
      return "https://www.usgs.gov/news/" + match[1] + "/" + match[2];
    }
    return null;
  } catch { return null; }
}

/** Strict private GKG prefilter: no arbitrary GDELT-observed website can be
 * treated as an official original publisher merely because GDELT indexed it.
 * This reuses exactly the verifier's existing pinned HTTPS host/path policy.
 */
export function approvedFirstPartyOriginalArticleUrl(url, category) {
  return fixedPublisherArticle(url, category);
}

// Aggregate-only closed diagnostic. Never copy HTTP headers, URLs, response
// bodies, private article text or exception messages into Actions artifacts.
export const SAFE_PUBLISHER_PAGE_PROBE_CODES = Object.freeze([
  "URL_UNAPPROVED","NETWORK_OR_REDIRECT_DENIED","HTTP_UNAUTHORIZED",
  "HTTP_RATE_LIMITED","HTTP_NOT_OK","MIME_NOT_HTML","BODY_TOO_LARGE",
  "BODY_MISSING","READ_ERROR","UTF8_INVALID",
  "PRECISE_PUBLICATION_UNVERIFIED","PRECISE_PUBLICATION_VERIFIED",
]);
const PAGE_PROBE_CODES = new Set(SAFE_PUBLISHER_PAGE_PROBE_CODES);
function pageStatus(diagnostics,code) {
  if (diagnostics && typeof diagnostics === "object" &&
      !Array.isArray(diagnostics) && PAGE_PROBE_CODES.has(code))
    diagnostics.code=code;
}
export async function fetchVerifiedPublisherPageDate(url, category, {
  now = new Date(), fetchImpl = fetch, diagnostics = null,
  allowGovUkContentApi = false, articleTitle = null, maxAgeMs = ONE_DAY_MS,
  allowCanadaDayObservation = false,
} = {}) {
  const articleUrl = fixedPublisherArticle(url, category);
  if (!articleUrl) {
    pageStatus(diagnostics,"URL_UNAPPROVED");
    return null;
  }
  let response;
  try {
    response = await fetchImpl(articleUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: {
        accept: "text/html",
        "user-agent": "Geomacro-Private-Original-Publisher-Date-Verification/1.0",
      },
    });
  } catch {
    pageStatus(diagnostics,"NETWORK_OR_REDIRECT_DENIED");
    return null;
  }
  if (!response.ok) {
    const code=response.status===401 || response.status===403
      ? "HTTP_UNAUTHORIZED" :
      response.status===429 ? "HTTP_RATE_LIMITED" : "HTTP_NOT_OK";
    pageStatus(diagnostics,code);
    return null;
  }
  if (!HTML_TYPE.test(response.headers.get("content-type") ?? "")) {
    pageStatus(diagnostics,"MIME_NOT_HTML");
    return null;
  }
  if (Number(response.headers.get("content-length") || 0)>PAGE_BYTES_MAX) {
    pageStatus(diagnostics,"BODY_TOO_LARGE");
    return null;
  }
  if (!response.body) {
    pageStatus(diagnostics,"BODY_MISSING");
    return null;
  }
  const chunks = [];
  let byteCount = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > PAGE_BYTES_MAX) {
        pageStatus(diagnostics,"BODY_TOO_LARGE");
        return null;
      }
      chunks.push(value);
    }
  } catch {
    pageStatus(diagnostics,"READ_ERROR");
    return null;
  } finally { reader.releaseLock(); }
  let html;
  try { html = new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks.map((value) => Buffer.from(value))),
  ); } catch {
    pageStatus(diagnostics,"UTF8_INVALID");
    return null;
  }
  const originalDiagnostics=diagnostics??{};
  let publishedAt=verifiedPublisherPageDate(html,now,originalDiagnostics);
  // GOV.UK Atom entries routinely contain only <updated>; missing ORIGINAL
  // HTML metadata can be rescued by an actual independently path/title-bound
  // first_published_at from the SAME publisher. This opt-in never promotes a
  // stale/future/conflicting/modified first-published HTML clock.
  const api=allowGovUkContentApi===true &&
    originalDiagnostics.date_reason==="MISSING_PUBLISHER_PUBLICATION_METADATA" &&
    Number.isSafeInteger(maxAgeMs)&&maxAgeMs>=60_000&&maxAgeMs<=ONE_DAY_MS
      ? pinnedGovUkContentApiUrl(articleUrl):null;
  if(!publishedAt&&api){
    try{
      const second=await fetchImpl(api,{
        method:"GET",redirect:"error",signal:AbortSignal.timeout(PAGE_TIMEOUT_MS),
        headers:{accept:"application/json",
          "user-agent":"Geomacro-Private-Original-Publisher-Date-Verification/1.0"},
      });
      if(second.ok&&/^application\/json(?:;|$)/iu.test(
          second.headers.get("content-type")??"")&&
        Number(second.headers.get("content-length")||0)<=GOVUK_API_MAX_BYTES&&
        second.body){
        const pieces=[],reader=second.body.getReader();let length=0,over=false;
        try{
          while(true){
            const {done,value}=await reader.read();
            if(done)break;
            length+=value.byteLength;
            if(length>GOVUK_API_MAX_BYTES){over=true;break;}
            pieces.push(Buffer.from(value));
          }
        }finally{reader.releaseLock();}
        if(!over){
          const json=new TextDecoder("utf-8",{fatal:true})
            .decode(Buffer.concat(pieces));
          publishedAt=verifiedGovUkContentFirstPublishedAt({
            articleUrl,html,contentJson:json,articleTitle,now,maxAgeMs,
          });
          if(publishedAt)originalDiagnostics.date_reason="PRECISE_PUBLICATION_ACCEPTED";
        }
      }
    }catch{/* 403, 429, redirects, quota exhaustion, parse and transport fail closed */}
  }
  // For date-only Canadian first-party original pages, keep a separate
  // observational day bit in private diagnostics. In particular, this never
  // overwrites an exact-clock failure, never returns a timestamp to a scored
  // caller and never upgrades a candidate to source-rights clearance.
  if(!publishedAt&&allowCanadaDayObservation===true){
    const day=verifyCanadaOriginalDayEvidence({articleUrl,html,now});
    if(day && diagnostics && typeof diagnostics==="object" &&
       !Array.isArray(diagnostics))
      diagnostics.original_day_precision_verified=true;
  }
  pageStatus(diagnostics,publishedAt
    ? "PRECISE_PUBLICATION_VERIFIED" : "PRECISE_PUBLICATION_UNVERIFIED");
  return publishedAt;
}
