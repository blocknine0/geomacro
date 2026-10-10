// Private, bounded, same-original-publisher verification for Atom feeds that
// omit per-entry <published>. An Atom <updated> is NEVER publication proof.
// No raw HTML/title/URL is persisted to a public proof, log or paid response.
const PAGE_BYTES_MAX = 128 * 1024;
const PAGE_TIMEOUT_MS = 4_000;
const ONE_DAY_MS = 86_400_000;
const PRECISE_DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/iu;
const HTML_TYPE = /^text\/html(?:;|$)/iu;

export const ORIGINAL_ARTICLE_MAX_PROBES_PER_DOMAIN = 2;

function attr(tag, name) {
  const allowed = ["name", "property", "content", "type"];
  if (!allowed.includes(name)) return "";
  const pattern = new RegExp("(?:^|\\s)" + name + "\\s*=\\s*([\"'])([^\"']{1,1024})\\1", "iu");
  return tag.match(pattern)?.[2] ?? "";
}

function precise(value, nowMs) {
  if (typeof value !== "string" || !PRECISE_DATE.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms > nowMs || nowMs - ms > ONE_DAY_MS) return null;
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

export function verifiedPublisherPageDate(html, now = new Date()) {
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
    if (property === "article:published_time" || name === "datepublished") {
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
  if (!candidates.length || candidates.length > 20) return null;
  const times = candidates.map((value) => precise(value, ms));
  if (times.some((time) => time === null)) return null;
  if (Math.max(...times) - Math.min(...times) > 60_000) return null;
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
    if (category === "macro" && candidate.hostname === "www150.statcan.gc.ca") {
      const match = /^\/n1\/daily-quotidien\/([0-9]{6})\/([a-z0-9-]{1,80})\.(htm|html)$/u.exec(path);
      if (!match) return null;
      return "https://www150.statcan.gc.ca/n1/daily-quotidien/" +
        match[1] + "/" + match[2] + "." + match[3];
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
    return null;
  } catch { return null; }
}

// Aggregate-only closed diagnostic. Never copy HTTP headers, URLs, response
// bodies, private article text or exception messages into Actions artifacts.
const PAGE_PROBE_CODES = new Set([
  "URL_UNAPPROVED","NETWORK_OR_REDIRECT_DENIED","HTTP_UNAUTHORIZED",
  "HTTP_RATE_LIMITED","HTTP_NOT_OK","MIME_NOT_HTML","BODY_TOO_LARGE",
  "BODY_MISSING","READ_ERROR","UTF8_INVALID",
  "PRECISE_PUBLICATION_UNVERIFIED","PRECISE_PUBLICATION_VERIFIED",
]);
function pageStatus(diagnostics,code) {
  if (diagnostics && typeof diagnostics === "object" &&
      !Array.isArray(diagnostics) && PAGE_PROBE_CODES.has(code))
    diagnostics.code=code;
}
export async function fetchVerifiedPublisherPageDate(url, category, {
  now = new Date(), fetchImpl = fetch, diagnostics = null,
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
  const publishedAt=verifiedPublisherPageDate(html,now);
  pageStatus(diagnostics,publishedAt
    ? "PRECISE_PUBLICATION_VERIFIED" : "PRECISE_PUBLICATION_UNVERIFIED");
  return publishedAt;
}
