import { readGriAuditRows } from "./gri-audit-read.js";

const nativeFetch = globalThis.fetch.bind(globalThis);
const TRANSIENT = new Set([402, 408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);
const TABLES = new Set([
  "gri_validation_runs",
  "gri_validation_metrics",
  "gri_snapshots",
  "gri_contributions",
]);

function matchingGriRequest(input) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const apiRaw = process.env.APP_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!apiRaw) return null;
  const api = new URL(apiRaw);
  if (url.origin !== api.origin) return null;

  const match = url.pathname.match(/^\/rest\/v1\/([A-Za-z0-9_]+)$/u);
  if (!match || !TABLES.has(match[1])) return null;
  return {
    table: match[1],
    params: Object.fromEntries(url.searchParams.entries()),
  };
}

async function directFallback(match) {
  const saved = globalThis.fetch;
  globalThis.fetch = nativeFetch;
  try {
    const rows = await readGriAuditRows(
      match.table,
      match.params,
      process.env.APP_SUPABASE_ANON_KEY,
    );
    return Response.json(rows, {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "x-geomacro-gri-audit-source": "authoritative-db-fallback",
      },
    });
  } finally {
    globalThis.fetch = saved;
  }
}

globalThis.fetch = async function griAuditFetch(input, init) {
  const match = matchingGriRequest(input);
  if (!match) return nativeFetch(input, init);

  try {
    const response = await nativeFetch(input, init);
    if (response.ok || !TRANSIENT.has(response.status) || !process.env.SUPABASE_DB_URL?.trim()) {
      return response;
    }
    console.error(
      `[gri-audit] ${match.table} public REST returned HTTP ${response.status}; retrying the same read against the guarded authoritative DB connection`,
    );
    return directFallback(match);
  } catch (error) {
    if (!process.env.SUPABASE_DB_URL?.trim()) throw error;
    console.error(
      `[gri-audit] ${match.table} public REST request failed; retrying the same read against the guarded authoritative DB connection`,
    );
    return directFallback(match);
  }
};
