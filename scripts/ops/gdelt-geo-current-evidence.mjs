#!/usr/bin/env node
import { createHash } from "node:crypto";

export const GDELT_GEO_EVIDENCE_CONTRACT = "gdelt-geo-v2-global-conflict-coverage-v1";
export const GDELT_GEO_SOURCE_TRANSPORT = "geo_v2_jsonfeed";

const GDELT_GEO_API_URL = "https://api.gdeltproject.org/api/v2/geo/geo";
const LIVE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MIN_INDEPENDENT_DOMAINS = 3;
const QUERY = '("armed conflict" OR war OR missile OR airstrike OR sanctions OR protest OR coup OR military)';

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function parsePublishedDate(value) {
  const raw = String(value ?? "").trim();
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeDomain(item) {
  for (const candidate of [item?.url, item?.external_url]) {
    try {
      const host = new URL(String(candidate ?? "")).hostname.toLowerCase().replace(/^www\./u, "");
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/u.test(host)) return host;
    } catch {
      // Ignore malformed article URLs; they cannot contribute corroboration.
    }
  }
  return null;
}

export function buildGdeltGeoCoverageRows(payload, now = Date.now()) {
  const version = String(payload?.version ?? "");
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!version.startsWith("https://jsonfeed.org/version/")) {
    throw new Error("CURRENT_GDELT_GEO_JSONFEED_VERSION_INVALID");
  }
  if (!items.length) throw new Error("CURRENT_GDELT_GEO_ITEMS_EMPTY");

  const domains = new Set();
  let newestAt = -Infinity;
  let eligibleItems = 0;

  for (const item of items) {
    // JSON Feed's date_published is source-native publication time. Never use
    // fetch time, API response time or date_modified as an evidence timestamp.
    const publishedAt = parsePublishedDate(item?.date_published);
    const publishedMs = Date.parse(String(publishedAt ?? ""));
    const domain = normalizeDomain(item);
    if (
      !domain ||
      !Number.isFinite(publishedMs) ||
      publishedMs > now + FUTURE_TOLERANCE_MS ||
      now - publishedMs > LIVE_MAX_AGE_MS
    ) continue;
    domains.add(domain);
    newestAt = Math.max(newestAt, publishedMs);
    eligibleItems += 1;
  }

  if (domains.size < MIN_INDEPENDENT_DOMAINS || eligibleItems < MIN_INDEPENDENT_DOMAINS) {
    throw new Error(
      `CURRENT_GDELT_GEO_CORROBORATION_INSUFFICIENT:${domains.size}:${eligibleItems}`,
    );
  }
  if (!Number.isFinite(newestAt)) throw new Error("CURRENT_GDELT_GEO_BATCH_INVALID");

  const observedAt = new Date(newestAt).toISOString();
  const identity = sha256(
    `${observedAt.slice(0, 16)}|${domains.size}|${eligibleItems}`,
  ).slice(0, 24);

  return [{
    id: `live_gdelt_geo_${identity}`,
    source_title:
      `Geomacro observes current conflict-related media coverage across ${domains.size} independent monitored news domains`,
    summary:
      `At least ${domains.size} independent GDELT-monitored news domains carry current conflict-related coverage within the governed two-hour window. This is an unscored current media-coverage signal, not a verified event claim.`,
    category: "geopolitics",
    severity: null,
    delta: null,
    created_at: observedAt,
    published_at: observedAt,
    public_status: "live_observed",
  }];
}

export async function readGdeltGeoCurrentRows({ fetchFn = fetch, now = Date.now() } = {}) {
  const url = new URL(GDELT_GEO_API_URL);
  url.searchParams.set("query", QUERY);
  url.searchParams.set("mode", "sourcecountry");
  url.searchParams.set("format", "jsonfeed");
  url.searchParams.set("timespan", "2h");
  url.searchParams.set("timespanround", "precise");
  url.searchParams.set("sortby", "Date");

  let response;
  try {
    response = await fetchFn(url, {
      headers: {
        accept: "application/feed+json,application/json",
        "user-agent": "Geomacro-GDELT-GEO-Current-Evidence/1.0 (+https://geomacro.live)",
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(
      `CURRENT_GDELT_GEO_FETCH_FAILED:${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response?.ok) throw new Error(`CURRENT_GDELT_GEO_HTTP_${response?.status ?? "unknown"}`);
  const raw = await response.text();
  if (!raw || Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("CURRENT_GDELT_GEO_RESPONSE_SIZE_INVALID");
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("CURRENT_GDELT_GEO_JSON_INVALID");
  }

  const rows = buildGdeltGeoCoverageRows(payload, now);
  const batchMs = Math.max(
    ...rows.map((row) => Date.parse(row.published_at)).filter(Number.isFinite),
  );
  if (!Number.isFinite(batchMs)) throw new Error("CURRENT_GDELT_GEO_BATCH_INVALID");

  return {
    rows,
    batchIso: new Date(batchMs).toISOString(),
    exportMd5: null,
    fipsSha256: null,
    sourceDigest: sha256(Buffer.from(raw, "utf8")),
    evidenceContract: GDELT_GEO_EVIDENCE_CONTRACT,
    sourceTransport: GDELT_GEO_SOURCE_TRANSPORT,
  };
}
