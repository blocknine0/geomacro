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

export function verifiedPublisherPageDate(html, now = new Date()) {
  if (typeof html !== "string" || html.length > PAGE_BYTES_MAX ||
      /<!DOCTYPE\s+[^>]*\[/iu.test(html)) return null;
  const ms = now.getTime();
  if (!Number.isFinite(ms)) return null;
  const candidates = [];
  for (const match of html.matchAll(/<meta\b[^>]{0,1100}>/giu)) {
    const name = attr(match[0], "name").toLowerCase();
    const property = attr(match[0], "property").toLowerCase();
    if (property === "article:published_time" || name === "datepublished") {
      candidates.push(attr(match[0], "content"));
    }
  }
  for (const match of html.matchAll(/<script\b([^>]{0,500})>([\s\S]{0,30000}?)<\/script>/giu)) {
    if (!/^(?:application\/ld\+json)(?:;|$)/iu.test(attr(match[1], "type"))) continue;
    try { walkArticleJsonLd(JSON.parse(match[2]), candidates); } catch { /* never parse markup as code */ }
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

export async function fetchVerifiedPublisherPageDate(url, category, {
  now = new Date(), fetchImpl = fetch,
} = {}) {
  const articleUrl = fixedPublisherArticle(url, category);
  if (!articleUrl) return null;
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
  } catch { return null; }
  if (!response.ok || !HTML_TYPE.test(response.headers.get("content-type") ?? "") ||
      Number(response.headers.get("content-length") || 0) > PAGE_BYTES_MAX ||
      !response.body) return null;
  const chunks = [];
  let byteCount = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > PAGE_BYTES_MAX) return null;
      chunks.push(value);
    }
  } catch { return null; }
  finally { reader.releaseLock(); }
  let html;
  try { html = new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks.map((value) => Buffer.from(value))),
  ); } catch { return null; }
  return verifiedPublisherPageDate(html, now);
}
