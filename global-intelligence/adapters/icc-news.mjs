import { createHash } from "node:crypto";

export const ICC_NEWS_URL = "https://www.icc-cpi.int/news";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function extractTextFragment(value) {
  const input = String(value ?? "");
  let output = "";
  let inTag = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (!inTag && char === "<") {
      inTag = true;
      continue;
    }
    if (inTag) {
      if (char === ">") inTag = false;
      continue;
    }
    output += char;
  }
  return clean(output);
}
function absoluteUrl(href, baseUrl = ICC_NEWS_URL) {
  try { return new URL(href, baseUrl).toString(); } catch { return null; }
}

function dateFromText(value) {
  const m = String(value ?? "").match(/20\d{2}[./-](?:0?[1-9]|1[0-2])[./-](?:0?[1-9]|[12]\d|3[01])/);
  if (!m) return null;
  const normalized = m[0].replace(/[./]/g, "-");
  const parsed = new Date(normalized + "T00:00:00.000Z");
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function parseIccNewsHtml(html, { retrievedAt = new Date().toISOString(), baseUrl = ICC_NEWS_URL } = {}) {
  const input = String(html ?? "");
  if (!/\bNews\b/i.test(input) || !/International Criminal Court|ICC/i.test(input)) {
    throw new Error("ICC news page marker not found");
  }

  const records = [];
  const anchorRe = /<a\b[^>]*href=["']([^"']*\/news\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of input.matchAll(anchorRe)) {
    const title = extractTextFragment(match[2]);
    const url = absoluteUrl(match[1], baseUrl);
    if (!url || title.length < 8) continue;
    const context = extractTextFragment(input.slice(Math.max(0, match.index - 450), Math.min(input.length, match.index + match[0].length + 450)));
    const publishedAt = dateFromText(context);
    const id = new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? encodeURIComponent(url).slice(-80);
    records.push(normalizeIccNews({
      id,
      title,
      publishedAt,
      url,
      retrievedAt,
      raw: { title, publishedAt, url, context }
    }));
  }

  const unique = [...new Map(records.map((record) => [record.source_record_id, record])).values()];
  if (!unique.length) throw new Error("ICC parser found no news records");
  return unique;
}

export function normalizeIccNews({ id, title, publishedAt = null, url = ICC_NEWS_URL, summary = "", retrievedAt = new Date().toISOString(), raw = null }) {
  if (!id || !title) throw new Error("Invalid ICC news observation");
  const rawPayload = raw ?? { id, title, publishedAt, url, summary };
  const published = publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? new Date(publishedAt).toISOString() : null;
  return {
    source_id: "icc_news",
    source_record_id: "ICC:" + clean(id).replace(/\s+/g, "_"),
    category: "GEOPOLITICS",
    country_iso3: null,
    observed_at: retrievedAt,
    published_at: published,
    title: clean(title),
    summary: clean(summary) || "ICC official news item.",
    source_url: url,
    metric: "official_news_event",
    value_numeric: 1,
    value_text: "PUBLISHED",
    unit: "news_item",
    event_type: "INTERNATIONAL_JUSTICE_EVENT",
    signal_type: "EXTERNAL_GEOPOLITICAL_EVENT",
    provenance: { provider: "International Criminal Court", dataset: "Official News", record_id: clean(id) },
    raw_payload: rawPayload,
    raw_hash: createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex")
  };
}
