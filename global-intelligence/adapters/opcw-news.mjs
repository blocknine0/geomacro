import { createHash } from "node:crypto";

export const OPCW_NEWS_URL = "https://www.opcw.org/media-centre/news";

function clean(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  return clean(String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<[^>]+>/g, " "));
}

function absoluteUrl(href, baseUrl = OPCW_NEWS_URL) {
  try { return new URL(href, baseUrl).toString(); } catch { return null; }
}

function dateFromText(value) {
  const m = String(value ?? "").match(/20\d{2}[./-](?:0?[1-9]|1[0-2])[./-](?:0?[1-9]|[12]\d|3[01])/);
  if (!m) return null;
  const normalized = m[0].replace(/[./]/g, "-");
  const parsed = new Date(normalized + "T00:00:00.000Z");
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function parseOpcwNewsHtml(html, { retrievedAt = new Date().toISOString(), baseUrl = OPCW_NEWS_URL } = {}) {
  const input = String(html ?? "");
  if (!/OPCW/i.test(input) || !/\bNews\b/i.test(input)) throw new Error("OPCW news page marker not found");

  const records = [];
  const anchorRe = /<a\b[^>]*href=["']([^"']*\/media-centre\/news\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of input.matchAll(anchorRe)) {
    const title = decodeHtml(match[2]);
    const url = absoluteUrl(match[1], baseUrl);
    if (!url || title.length < 8) continue;
    const context = decodeHtml(input.slice(Math.max(0, match.index - 450), Math.min(input.length, match.index + match[0].length + 450)));
    const publishedAt = dateFromText(context);
    const id = encodeURIComponent(new URL(url).pathname).slice(-80);
    records.push(normalizeOpcwNews({
      id,
      title,
      publishedAt,
      url,
      retrievedAt,
      raw: { title, publishedAt, url, context }
    }));
  }

  const unique = [...new Map(records.map((record) => [record.source_record_id, record])).values()];
  if (!unique.length) throw new Error("OPCW parser found no news records");
  return unique;
}

export function normalizeOpcwNews({ id, title, publishedAt = null, url = OPCW_NEWS_URL, summary = "", retrievedAt = new Date().toISOString(), raw = null }) {
  if (!id || !title) throw new Error("Invalid OPCW news observation");
  const rawPayload = raw ?? { id, title, publishedAt, url, summary };
  const published = publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? new Date(publishedAt).toISOString() : null;
  return {
    source_id: "opcw_news",
    source_record_id: "OPCW:" + clean(id).replace(/\s+/g, "_"),
    category: "GEOPOLITICS",
    country_iso3: null,
    observed_at: retrievedAt,
    published_at: published,
    title: clean(title),
    summary: clean(summary) || "OPCW official news item.",
    source_url: url,
    metric: "official_news_event",
    value_numeric: 1,
    value_text: "PUBLISHED",
    unit: "news_item",
    event_type: "INTERNATIONAL_SECURITY_EVENT",
    signal_type: "EXTERNAL_GEOPOLITICAL_EVENT",
    provenance: { provider: "Organisation for the Prohibition of Chemical Weapons", dataset: "Official News", record_id: clean(id) },
    raw_payload: rawPayload,
    raw_hash: createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex")
  };
}
