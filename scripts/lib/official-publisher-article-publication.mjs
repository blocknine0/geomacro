// Safe original-publication recovery when a FIXED first-party Atom feed gives
// <updated> but no <published>. Never treat update/crawl time as first publish.
// PRIVATE evidence only; independent rights/corroboration/public gates remain.
const MAX_HTML_BYTES = 256 * 1024;
const MAX_METADATA_TAGS = 140;
const ORIGINAL_KEYS = new Set([
  "article:published_time", "datepublished", "dc.date.issued",
  "dcterms.issued", "citation_publication_date",
]);
const STRICT_ISO_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/iu;

function parseMetaAttrs(meta) {
  const attrs = {};
  for (const match of meta.matchAll(/([a-z][a-z0-9:_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/giu)) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3];
  }
  return attrs;
}

function originalDateMillis(raw, nowMs, windowMs) {
  const value = String(raw ?? "").trim();
  // Date-only publisher metadata cannot establish a current hour. Never
  // invent midnight/locale times to turn a modified older page into news.
  if (!STRICT_ISO_STAMP.test(value)) return null;
  const publishedMs = Date.parse(value);
  if (!Number.isFinite(publishedMs) || publishedMs > nowMs ||
      nowMs - publishedMs > windowMs) return null;
  // Check the exact calendar day after parsing, not a JS rollover date.
  const yyyy = Number(value.slice(0, 4));
  const mm = Number(value.slice(5, 7));
  const dd = Number(value.slice(8, 10));
  if (mm < 1 || mm > 12 ||
      dd < 1 || dd > new Date(Date.UTC(yyyy, mm, 0)).getUTCDate()) return null;
  return publishedMs;
}

/** Returns source-native publication evidence only, NEVER an updated time. */
export function originalPublicationFromPublisherHtml(html, {
  now = new Date(), maxAgeMs = 24 * 60 * 60_000,
} = {}) {
  if (typeof html !== "string" || Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES ||
      /<!DOCTYPE\s+[^>]*\[/iu.test(html)) return null;
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs) ||
      maxAgeMs < 60_000 || maxAgeMs > 86_400_000) return null;
  let count = 0;
  for (const match of html.matchAll(/<meta\b[^>]*>/giu)) {
    if (++count > MAX_METADATA_TAGS) break;
    const attrs = parseMetaAttrs(match[0]);
    const key = String(attrs.property ?? attrs.name ?? attrs.itemprop ?? "").toLowerCase();
    if (!ORIGINAL_KEYS.has(key)) continue;
    const at = originalDateMillis(attrs.content, nowMs, maxAgeMs);
    if (at !== null) return new Date(at).toISOString();
  }
  return null;
}

function fixedOriginalPageUrl(raw, approvedHosts) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port ||
        u.href.length > 2048 || !approvedHosts.includes(u.hostname.toLowerCase())) return null;
    return u;
  } catch { return null; }
}

export async function fetchPublisherOriginalPublication(raw, approvedHosts, {
  fetchImpl = fetch, now = new Date(),
} = {}) {
  const u = fixedOriginalPageUrl(raw, approvedHosts);
  if (!u) throw new Error("PUBLISHER_PAGE_URL_NOT_APPROVED");
  const r = await fetchImpl(u.href, {
    redirect: "error",
    headers: { accept: "text/html, application/xhtml+xml;q=0.8",
      "user-agent": "Geomacro-FirstParty-Native-Published-Private-Check/1.0" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!r.ok || !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/iu.test(r.headers.get("content-type") ?? "") ||
      (r.url && r.url !== u.href)) {
    throw new Error("PUBLISHER_PAGE_TRANSPORT_INVALID");
  }
  if (Number(r.headers.get("content-length") || 0) > MAX_HTML_BYTES ||
      !r.body) throw new Error("PUBLISHER_PAGE_BODY_INVALID");
  const reader = r.body.getReader(), chunks = [];
  let count = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > MAX_HTML_BYTES) throw new Error("PUBLISHER_PAGE_TOO_LARGE");
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const html = new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks.map(v => Buffer.from(v))),
  );
  return originalPublicationFromPublisherHtml(html, { now });
}
