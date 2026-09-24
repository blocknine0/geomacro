import { createHash } from "node:crypto";

export const ICC_NEWS_URL = "https://www.icc-cpi.int/news";

export function normalizeIccNews({ id, title, publishedAt = null, url = ICC_NEWS_URL, summary = "", retrievedAt = new Date().toISOString(), raw = null }) {
  if (!id || !title) throw new Error("Invalid ICC news observation");
  const rawPayload = raw ?? { id, title, publishedAt, url, summary };
  const published = publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? new Date(publishedAt).toISOString() : null;
  return {
    source_id: "icc_news",
    source_record_id: "ICC:" + String(id).replace(/\\s+/g, "_"),
    category: "GEOPOLITICS",
    country_iso3: null,
    observed_at: retrievedAt,
    published_at: published,
    title: String(title).trim(),
    summary: String(summary).trim() || "ICC official news item.",
    source_url: url,
    metric: "official_news_event",
    value_numeric: 1,
    value_text: "PUBLISHED",
    unit: "news_item",
    event_type: "INTERNATIONAL_JUSTICE_EVENT",
    signal_type: "EXTERNAL_GEOPOLITICAL_EVENT",
    provenance: { provider: "International Criminal Court", dataset: "Official News", record_id: String(id) },
    raw_payload: rawPayload,
    raw_hash: createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex")
  };
}
