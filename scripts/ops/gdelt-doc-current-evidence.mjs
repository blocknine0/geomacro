#!/usr/bin/env node
import { createHash } from "node:crypto";

export const GDELT_DOC_EVIDENCE_CONTRACT = "gdelt-doc-v2-conflict-coverage-v1";
export const GDELT_DOC_SOURCE_TRANSPORT = "doc_v2_articlelist";

const GDELT_DOC_API_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const LIVE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 24;
const MIN_INDEPENDENT_DOMAINS = 2;
const QUERY = '("armed conflict" OR war OR missile OR airstrike OR sanctions OR protest OR coup OR military)';

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function cleanText(value, max = 100) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, max)
    .trim();
}

function parseSeenDate(value) {
  const raw = String(value ?? "").trim();
  const direct = Date.parse(raw);
  if (Number.isFinite(direct)) return new Date(direct).toISOString();

  const match = /^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/u.exec(raw);
  if (!match) return null;
  const parsed = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeDomain(article) {
  const declared = cleanText(article?.domain, 255).toLowerCase();
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/u.test(declared)) return declared.replace(/^www\./u, "");
  try {
    const host = new URL(String(article?.url ?? "")).hostname.toLowerCase().replace(/^www\./u, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/u.test(host) ? host : null;
  } catch {
    return null;
  }
}

export function buildGdeltDocCoverageRows(payload, now = Date.now()) {
  const articles = Array.isArray(payload?.articles) ? payload.articles : [];
  if (!articles.length) throw new Error("CURRENT_GDELT_DOC_ARTICLES_EMPTY");

  const groups = new Map();
  for (const article of articles) {
    const observedAt = parseSeenDate(article?.seendate ?? article?.date ?? article?.published_at);
    const observedMs = Date.parse(String(observedAt ?? ""));
    if (
      !Number.isFinite(observedMs) ||
      observedMs > now + FUTURE_TOLERANCE_MS ||
      now - observedMs > LIVE_MAX_AGE_MS
    ) continue;

    const country = cleanText(article?.sourcecountry ?? article?.sourceCountry, 100);
    const domain = normalizeDomain(article);
    if (!country || !domain || /^unknown$/iu.test(country)) continue;

    const key = country.toLowerCase();
    const current = groups.get(key) ?? {
      country,
      domains: new Set(),
      newestAt: -Infinity,
      articleCount: 0,
    };
    current.domains.add(domain);
    current.newestAt = Math.max(current.newestAt, observedMs);
    current.articleCount += 1;
    groups.set(key, current);
  }

  const rows = [...groups.values()]
    .filter((group) => group.domains.size >= MIN_INDEPENDENT_DOMAINS)
    .sort((a, b) =>
      b.newestAt - a.newestAt ||
      b.domains.size - a.domains.size ||
      a.country.localeCompare(b.country)
    )
    .slice(0, MAX_ROWS)
    .map((group) => {
      const observedAt = new Date(group.newestAt).toISOString();
      const identity = sha256(`${group.country.toLowerCase()}|${observedAt.slice(0, 16)}`).slice(0, 24);
      return {
        id: `live_gdelt_doc_${identity}`,
        source_title: `Geomacro observes current conflict-related media coverage from ${group.country}`,
        summary:
          `At least ${group.domains.size} independent GDELT-monitored news domains in ${group.country} are carrying conflict-related coverage. This is an unscored current media-coverage signal, not a verified event claim.`,
        category: "geopolitics",
        severity: null,
        delta: null,
        created_at: observedAt,
        published_at: observedAt,
        public_status: "live_observed",
      };
    });

  if (!rows.length) throw new Error("CURRENT_GDELT_DOC_NO_CORROBORATED_COVERAGE");
  return rows;
}

export async function readGdeltDocCurrentRows({ fetchFn = fetch, now = Date.now() } = {}) {
  const url = new URL(GDELT_DOC_API_URL);
  url.searchParams.set("query", QUERY);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("maxrecords", "250");
  url.searchParams.set("timespan", "2h");
  url.searchParams.set("sort", "datedesc");
  url.searchParams.set("format", "json");

  let response;
  try {
    response = await fetchFn(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Geomacro-GDELT-Current-Evidence/1.0 (+https://geomacro.live)",
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(`CURRENT_GDELT_DOC_FETCH_FAILED:${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response?.ok) throw new Error(`CURRENT_GDELT_DOC_HTTP_${response?.status ?? "unknown"}`);
  const raw = await response.text();
  if (!raw || Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("CURRENT_GDELT_DOC_RESPONSE_SIZE_INVALID");
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("CURRENT_GDELT_DOC_JSON_INVALID");
  }

  const rows = buildGdeltDocCoverageRows(payload, now);
  const batchMs = Math.max(...rows.map((row) => Date.parse(row.published_at)).filter(Number.isFinite));
  if (!Number.isFinite(batchMs)) throw new Error("CURRENT_GDELT_DOC_BATCH_INVALID");

  return {
    rows,
    batchIso: new Date(batchMs).toISOString(),
    exportMd5: null,
    fipsSha256: null,
    sourceDigest: sha256(Buffer.from(raw, "utf8")),
    evidenceContract: GDELT_DOC_EVIDENCE_CONTRACT,
    sourceTransport: GDELT_DOC_SOURCE_TRANSPORT,
  };
}
