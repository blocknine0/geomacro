/**
 * Historical-to-main contract runtime canary.
 * Exactly three tiny, GET-only calls to the SEPARATE historical Supabase.
 * Never reads main Supabase/D1 or B2, and never emits source rows or secrets.
 */
import { pathToFileURL } from "node:url";

const HISTORICAL_HOST = "nqvpcbnnvjsrlvyxxevk.supabase.co";
export const HISTORICAL_CANARY_TARGETS = Object.freeze([
  ["geopolitics", "commercial_structural_country_profiles", "country_iso3", "eq.USA"],
  ["macroeconomics", "commercial_historical_macro_observations", "observation_year", null],
  ["critical_minerals", "rare_earth_canonical_observations", "observation_year", null],
]);
const MAX_BYTES = 8192;

export function resolveHistoricalUrl(raw) {
  const url = new URL(String(raw ?? ""));
  if (url.protocol !== "https:" || url.hostname !== HISTORICAL_HOST ||
      url.port || url.username || url.password || !["", "/"].includes(url.pathname) ||
      url.search || url.hash) {
    throw new Error("HISTORICAL_SUPABASE_URL must be the independent pinned historical project");
  }
  return `https://${HISTORICAL_HOST}`;
}

async function readTinyJson(response) {
  if (!response.body) throw new Error("missing_body");
  const reader = response.body.getReader();
  const parts = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) throw new Error("response_too_large");
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { merged.set(part, offset); offset += part.byteLength; }
  return JSON.parse(new TextDecoder().decode(merged));
}

export async function probeMainHistoricalServing(
  { url, serviceKey, fetcher = fetch } = {},
) {
  // Invalid identity/credentials must stop BEFORE any privileged request.
  const base = resolveHistoricalUrl(url);
  if (!serviceKey || !String(serviceKey).trim()) {
    throw new Error("HISTORICAL_SUPABASE_SERVICE_ROLE_KEY is missing");
  }
  const domains = {};
  for (const [name, relation, column, filter] of HISTORICAL_CANARY_TARGETS) {
    const target = new URL(`${base}/rest/v1/${relation}`);
    target.searchParams.set("select", column);
    target.searchParams.set("limit", "1");
    if (filter !== null) target.searchParams.set(column, filter);
    try {
      const response = await fetcher(target, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(12000),
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Accept: "application/json",
          Range: "0-0",
        },
      });
      if (!response.ok) {
        domains[name] = { relation, status: "ERROR", reason: `http_${response.status}` };
        continue;
      }
      const rows = await readTinyJson(response);
      if (!Array.isArray(rows) || rows.length > 1 ||
          (rows.length && (typeof rows[0] !== "object" || rows[0] === null ||
            !Object.hasOwn(rows[0], column)))) {
        throw new Error("invalid_governed_row");
      }
      domains[name] = { relation, status: rows.length ? "PRESENT" : "EMPTY" };
    } catch {
      domains[name] = { relation, status: "ERROR", reason: "readback_failed" };
    }
  }
  return {
    status: Object.values(domains).every((row) => row.status === "PRESENT") ? "PASS" : "UNREADY",
    database: "independent_historical_supabase",
    domains,
    requests_attempted_max: 3,
    rows_returned_max: 3,
    writes: 0,
    main_supabase_queries: 0,
    main_d1_queries: 0,
    b2_operations: 0,
    raw_records_emitted: 0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await probeMainHistoricalServing({
      url: process.env.HISTORICAL_SUPABASE_URL,
      serviceKey: process.env.HISTORICAL_SUPABASE_SERVICE_ROLE_KEY,
    });
    console.log(JSON.stringify(result));
    if (result.status !== "PASS") process.exitCode = 1;
  } catch {
    // No malformed URL/key text must appear in CI logs.
    console.log(JSON.stringify({ status: "UNCONFIGURED",
      reason: "historical_url_or_credentials_invalid",
      requests_attempted_max: 0, writes: 0 }));
    process.exitCode = 1;
  }
}
