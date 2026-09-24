import process from "node:process";

const targets = [
  {
    name: "historical",
    url: process.env.HISTORICAL_SUPABASE_URL,
    key: process.env.HISTORICAL_SUPABASE_SERVICE_ROLE_KEY,
  },
  {
    name: "authoritative_app",
    url: process.env.APP_SUPABASE_URL,
    key: process.env.APP_SUPABASE_SERVICE_ROLE_KEY,
  },
];

const countries = ["USA", "IND", "CHN"];

async function query(url, key, path, params = {}) {
  const base = String(url).replace(/\/$/, "");
  const endpoint = new URL(`${base}/rest/v1/${path}`);
  endpoint.searchParams.set("select", "country_iso3");
  for (const [k, v] of Object.entries(params)) endpoint.searchParams.set(k, v);
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    redirect: "error",
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { response, json, text };
}

async function probe(target) {
  if (!target.url || !target.key) {
    return { configured: false, reachable: false, table: false, rows: {} };
  }

  const results = {};
  for (const country of countries) {
    try {
      const result = await query(
        target.url,
        target.key,
        "commercial_structural_country_profiles",
        { country_iso3: `eq.${country}` },
      );
      results[country] = result.response.ok
        ? { ok: true, count: Array.isArray(result.json) ? result.json.length : 0 }
        : { ok: false, http_status: result.response.status, code: result.json?.code ?? "UNKNOWN" };
    } catch (error) {
      results[country] = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  let table = false;
  try {
    const result = await query(
      target.url,
      target.key,
      "commercial_structural_country_coverage_latest",
      { country_iso3: "eq.USA" },
    );
    table = result.response.ok || !["42P01", "PGRST205"].includes(result.json?.code ?? "");
  } catch {}

  return {
    configured: true,
    reachable: !Object.values(results).some((row) => row.ok === false && row.http_status === 401),
    table,
    rows: results,
  };
}

const output = {};
for (const target of targets) output[target.name] = await probe(target);

const historical = output.historical;
const authoritative = output.authoritative_app;

console.log(JSON.stringify({
  schema_version: "geomacro.structural-serving-production-probe.v2",
  checked_at: new Date().toISOString(),
  secrets_exposed: false,
  historical: {
    configured: historical.configured,
    reachable: historical.reachable,
    serving_table_available: historical.table,
    country_profiles: historical.rows,
  },
  authoritative_app: {
    configured: authoritative.configured,
    reachable: authoritative.reachable,
    serving_table_available: authoritative.table,
    country_profiles: authoritative.rows,
  },
  live_runtime_issue_signature:
    historical.configured && historical.reachable && historical.table
      ? "NOT_A_HISTORICAL_CREDENTIAL_GAP"
      : "HISTORICAL_RUNTIME_CONFIGURATION_REQUIRED",
}, null, 2));
