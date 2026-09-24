import { createHash } from "node:crypto";

export const ICJ_CASES_URL = "https://www.icj-cij.org/cases";

export function normalizeIcjCase({ id, title, status = null, date = null, url = ICJ_CASES_URL, retrievedAt = new Date().toISOString(), raw = null }) {
  if (!id || !title) throw new Error("Invalid ICJ case observation");
  const rawPayload = raw ?? { id, title, status, date, url };
  const publishedAt = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null;
  return {
    source_id: "icj_cases",
    source_record_id: "ICJ:" + String(id).replace(/\\s+/g, "_"),
    category: "GEOPOLITICS",
    country_iso3: null,
    observed_at: retrievedAt,
    published_at: publishedAt,
    title: String(title).trim(),
    summary: status ? "ICJ case status: " + String(status).trim() + "." : "International Court of Justice case record.",
    source_url: url,
    metric: "international_case",
    value_numeric: 1,
    value_text: status ? String(status).trim() : "CASE",
    unit: "case",
    event_type: "INTERNATIONAL_COURT_CASE",
    signal_type: "EXTERNAL_GEOPOLITICAL_EVENT",
    provenance: { provider: "International Court of Justice", dataset: "Cases", record_id: String(id) },
    raw_payload: rawPayload,
    raw_hash: createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex")
  };
}
