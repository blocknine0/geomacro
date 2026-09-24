import { createHash } from "node:crypto";

export const OPCW_NEWS_URL = "https://www.opcw.org/media-centre/news";

function clean(value) { return String(value ?? "").replace(/\\s+/g, " ").trim(); }

export function normalizeOpcwNews({ id, title, publishedAt = null, url = OPCW_NEWS_URL, summary = "", retrievedAt = new Date().toISOString(), raw = null }) {
  if (!id || !title) throw new Error("Invalid OPCW news observation");
  const rawPayload = raw ?? { id, title, publishedAt, url, summary };
  const published = publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? new Date(publishedAt).toISOString() : null;
  return {
    source_id: "opcw_news",
    source_record_id: "OPCW:" + clean(id).replace(/\\s+/g, "_"),
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
