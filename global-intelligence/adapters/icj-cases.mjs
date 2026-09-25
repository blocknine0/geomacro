import { createHash } from "node:crypto";

export const ICJ_CASES_URL = "https://www.icj-cij.org/cases";

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
function absoluteUrl(href, baseUrl = ICJ_CASES_URL) {
  try { return new URL(href, baseUrl).toString(); } catch { return null; }
}

function dateFromText(value) {
  const m = String(value ?? "").match(/20\d{2}[./-](?:0?[1-9]|1[0-2])[./-](?:0?[1-9]|[12]\d|3[01])/);
  if (!m) return null;
  const normalized = m[0].replace(/[./]/g, "-");
  const parsed = new Date(normalized + "T00:00:00.000Z");
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function parseIcjCasesHtml(html, { retrievedAt = new Date().toISOString(), baseUrl = ICJ_CASES_URL } = {}) {
  const input = String(html ?? "");
  if (!/\bCases\b/i.test(input) || !/International Court of Justice|ICJ/i.test(input)) {
    throw new Error("ICJ cases page marker not found");
  }

  const records = [];
  const anchorRe = /<a\b[^>]*href=["']([^"']*(?:\/cases\/|\/case\/|\/contentious-cases(?:\/|\?))[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of input.matchAll(anchorRe)) {
    const title = extractTextFragment(match[2]);
    const url = absoluteUrl(match[1], baseUrl);
    if (!url || title.length < 8) continue;
    const context = extractTextFragment(input.slice(Math.max(0, match.index - 500), Math.min(input.length, match.index + match[0].length + 500)));
    const date = dateFromText(context);
    const id = new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? encodeURIComponent(url).slice(-80);
    records.push(normalizeIcjCase({
      id,
      title,
      date,
      url,
      retrievedAt,
      raw: { title, date, url, context }
    }));
  }

  const unique = [...new Map(records.map((record) => [record.source_record_id, record])).values()];
  if (!unique.length) throw new Error("ICJ parser found no case records");
  return unique;
}

export function normalizeIcjCase({ id, title, status = null, date = null, url = ICJ_CASES_URL, retrievedAt = new Date().toISOString(), raw = null }) {
  if (!id || !title) throw new Error("Invalid ICJ case observation");
  const rawPayload = raw ?? { id, title, status, date, url };
  const publishedAt = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null;
  return {
    source_id: "icj_cases",
    source_record_id: "ICJ:" + clean(id).replace(/\s+/g, "_"),
    category: "GEOPOLITICS",
    country_iso3: null,
    observed_at: retrievedAt,
    published_at: publishedAt,
    title: clean(title),
    summary: status ? "ICJ case status: " + clean(status) + "." : "International Court of Justice case record.",
    source_url: url,
    metric: "international_case",
    value_numeric: 1,
    value_text: status ? clean(status) : "CASE",
    unit: "case",
    event_type: "INTERNATIONAL_COURT_CASE",
    signal_type: "EXTERNAL_GEOPOLITICAL_EVENT",
    provenance: { provider: "International Court of Justice", dataset: "Cases", record_id: clean(id) },
    raw_payload: rawPayload,
    raw_hash: createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex")
  };
}
