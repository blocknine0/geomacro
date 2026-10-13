import { SOURCE_LINEUP_BY_ID } from "./operator-commercial-free-source-lineup.mjs";

/**
 * Curated production transport candidates requiring no credit card/token.
 * GET-only. A transport proof does not imply native publisher event freshness,
 * licence approval, same-event corroboration, signature or paid deliverability.
 * Other catalogued sources remain in rights/access review.
 */
const SPECS = [
  {
    id: "usgs_earthquakes", category: "geopolitics",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
    format: "json", maxBytes: 400_000, nature: "physical-hazard-not-conflict",
  },
  {
    id: "cisa_kev", category: "geopolitics",
    url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    format: "head", maxBytes: 0, nature: "security-advisory-not-event-proof",
  },
  {
    id: "bls", category: "macro",
    url: "https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0",
    format: "json", maxBytes: 100_000, nature: "statistical-period-not-publication-time",
  },
  {
    id: "world_bank_wdi", category: "macro",
    url: "https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.CD?format=json&source=2&per_page=1",
    format: "json", maxBytes: 100_000, nature: "annual-reference-period-not-event",
  },
  {
    id: "treasury_fiscaldata", category: "macro",
    url: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?page%5Bsize%5D=1&sort=-record_date",
    format: "json", maxBytes: 120_000, nature: "monthly-reference-period-not-event",
  },
  {
    id: "usgs_mcs", category: "rare_earth",
    url: "https://pubs.usgs.gov/publication/mcs2026",
    format: "html", maxBytes: 150_000, nature: "annual-baseline-not-current-news",
  },
  {
    id: "nrcan", category: "rare_earth",
    url: "https://api.io.canada.ca/io-server/gc/news/en/v2?dept=naturalresourcescanada&sort=publishedDate&orderBy=desc&pick=5&format=atom&atomtitle=Natural%20Resources%20Canada",
    format: "atom", maxBytes: 160_000, nature: "first-party-feed-item-not-independently-corroborated",
  },
  {
    id: "federal_register", category: "geopolitics",
    url: "https://www.federalregister.gov/api/v1/documents.json?conditions%5Bterm%5D=sanctions&per_page=1&order=newest",
    format: "json", maxBytes: 120_000, nature: "regulatory-publication-not-independent-event",
  },
  {
    id: "us_doe", category: "rare_earth",
    url: "https://www.energy.gov/topics/critical-minerals-and-materials",
    format: "html", maxBytes: 150_000, nature: "government-context-page-not-current-release",
  },
];

/** Production probe input is pinned; never follows arbitrary provider links. */
export const FREE_NO_KEY_TRANSPORT_SPECS = Object.freeze(SPECS.map(spec => {
  const item = SOURCE_LINEUP_BY_ID.get(spec.id);
  if (!item || item.category !== spec.category || item.access !== "NO_KEY")
    throw new Error("SOURCE_LINEUP_PROBE_NOT_ALLOWED:" + spec.id);
  const url = new URL(spec.url);
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error("SOURCE_LINEUP_UNSAFE_URL:" + spec.id);
  return Object.freeze(spec);
}));

export function validateFreeLineupProbePayload(spec, payload) {
  if (spec.format === "head") return {
    format_checked: false, valid: true, kind: "HEAD_REACHABLE_ONLY",
    native_publisher_original_date_verified: false,
  };
  if (spec.format === "html") return {
    format_checked: true,
    valid: /^\s*(?:<!doctype html|<html)\b/iu.test(String(payload)),
    kind: "HTML_CONTEXT_ONLY",
    native_publisher_original_date_verified: false,
  };
  if (spec.format === "atom") {
    const text = String(payload).trimStart().replace(/^<\?xml[^>]*\?>\s*/iu, "");
    return { format_checked: true, valid: /^<feed\b/iu.test(text),
      kind: "ATOM_TRANSPORT_ONLY",
      native_publisher_original_date_verified: false };
  }
  let data;
  try { data = JSON.parse(String(payload)); }
  catch { return { valid: false, format_checked: false, kind: "INVALID_JSON",
    native_publisher_original_date_verified: false }; }
  const match = spec.id === "usgs_earthquakes"
    ? data?.type === "FeatureCollection" && Array.isArray(data.features)
    : spec.id === "bls"
      ? data?.status === "REQUEST_SUCCEEDED" && Array.isArray(data?.Results?.series)
      : spec.id === "world_bank_wdi"
        ? Array.isArray(data) && Array.isArray(data[1]) &&
          data[1].every(x => x?.indicator?.id === "NY.GDP.MKTP.CD")
        : spec.id === "treasury_fiscaldata"
          ? Array.isArray(data?.data)
          : spec.id === "federal_register"
            ? Number.isFinite(data?.count) && Array.isArray(data?.results)
            : false;
  return { valid: match, format_checked: true, kind: "JSON_SCHEMA_TRANSPORT_ONLY",
    native_publisher_original_date_verified: false };
}

async function boundedBody(response, maxBytes) {
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes)
    return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) return null;
      chunks.push(value);
    }
    const merged = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(merged);
  } catch { return null; }
  finally { await reader.cancel().catch(() => undefined); }
}

export async function probeNoKeySource(spec, fetchImpl = fetch) {
  let state = "NETWORK_UNAVAILABLE", code = null;
  try {
    const url = new URL(spec.url);
    const response = await fetchImpl(spec.url, {
      method: spec.format === "head" ? "HEAD" : "GET",
      redirect: "error",
      headers: { Accept: spec.format === "html" ? "text/html" :
        spec.format === "atom" ? "application/atom+xml, application/xml" :
          "application/json" },
      signal: AbortSignal.timeout(7_000),
    });
    code = response.status;
    state = [401, 403, 429].includes(code) ? "DENIED_OR_RATE_LIMIT" :
      !response.ok ? "HTTP_UNAVAILABLE" : "UNVERIFIED_CONTENT";
    if (response.ok) {
      const safe = spec.format === "head" ?
        validateFreeLineupProbePayload(spec, "") :
        validateFreeLineupProbePayload(spec, await boundedBody(response, spec.maxBytes));
      state = safe.valid && spec.format === "head" ? "ENDPOINT_REACHABLE_FORMAT_UNVERIFIED"
        : safe.valid ? "TRANSPORT_READABLE" : "FORMAT_OR_SIZE_UNVERIFIED";
    }
  } catch {
    state = "NETWORK_UNAVAILABLE";
  }
  return {
    category: spec.category,
    id: spec.id,
    state,
    http_status: code,
    content_format_proven: state === "TRANSPORT_READABLE" && spec.format !== "head",
    original_publisher_release_proven: false,
    commercial_paid_activation: false,
    signed_risk_generated: false,
    raw_payload_persisted: false,
  };
}

export async function observeNoKeyLineup(group, fetchImpl = fetch) {
  if (!Number.isInteger(group) || group < 0 || group > 2)
    throw new Error("SOURCE_PROBE_GROUP_INVALID");
  // Exactly one bounded provider attempt per category per run; the three
  // distinct candidates in each category rotate without overlap.
  const chosen = ["geopolitics", "macro", "rare_earth"].map(category =>
    FREE_NO_KEY_TRANSPORT_SPECS.filter(spec => spec.category === category)[group]
  ).filter(Boolean);
  const rows = await Promise.all(chosen.map(spec => probeNoKeySource(spec, fetchImpl)));
  return {
    schema: "geomacro.operator-commercial-no-key-source-probe.v1",
    checked_at: new Date().toISOString(),
    group,
    attempted: rows.length,
    per_category: Object.fromEntries(["geopolitics","macro","rare_earth"].map(category =>
      [category, {
        checked: rows.filter(row => row.category === category).length,
        readable: rows.filter(row => row.category === category && row.state === "TRANSPORT_READABLE").length,
      }]
    )),
    rows,
    any_paid_source_activated: false,
    payments: 0,
    supabase_requests: 0,
    b2_requests: 0,
    d1_requests: 0,
    raw_payload_persisted: false,
    dataset_license_newly_verified: false,
    scored_or_signed_intelligence_delivered: false,
  };
}
