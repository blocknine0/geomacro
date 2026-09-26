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
  let servingProfilesAvailable = false;
  let fallbackObservationViewAvailable = false;
  for (const country of countries) {
    try {
      const result = await query(
        target.url,
        target.key,
        "commercial_structural_country_profiles",
        { country_iso3: `eq.${country}` },
      );
      if (result.response.ok) {
        servingProfilesAvailable = true;
        results[country] = { ok: true, count: Array.isArray(result.json) ? result.json.length : 0, interface: "serving_profile" };
        continue;
      }
      if (!["42P01", "PGRST205"].includes(result.json?.code ?? "")) {
        results[country] = { ok: false, http_status: result.response.status, code: result.json?.code ?? "UNKNOWN" };
        continue;
      }

      const fallback = await query(
        target.url,
        target.key,
        "commercial_structural_geopolitical_observations",
        { country_iso3: `eq.${country}` },
      );
      if (fallback.response.ok) {
        fallbackObservationViewAvailable = true;
        results[country] = { ok: true, count: Array.isArray(fallback.json) ? fallback.json.length : 0, interface: "base_commercial_fallback" };
      } else {
        results[country] = { ok: false, http_status: fallback.response.status, code: fallback.json?.code ?? "UNKNOWN" };
      }
    } catch (error) {
      results[country] = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  let coverageAvailable = false;
  try {
    const result = await query(
      target.url,
      target.key,
      "commercial_structural_country_coverage_latest",
      { country_iso3: "eq.USA" },
    );
    coverageAvailable = result.response.ok;
  } catch {}

  const interfaceAvailable = servingProfilesAvailable || fallbackObservationViewAvailable;
  return {
    configured: true,
    reachable: !Object.values(results).some((row) => row.ok === false && row.http_status === 401),
    table: interfaceAvailable,
    coverage: coverageAvailable,
    serving_profiles_available: servingProfilesAvailable,
    fallback_observation_view_available: fallbackObservationViewAvailable,
    rows: results,
  };
}

const output = {};
for (const target of targets) output[target.name] = await probe(target);

const historical = output.historical;
const authoritative = output.authoritative_app;

const historicalReady =
  historical.configured &&
  historical.reachable &&
  historical.table &&
  ["USA", "IND", "CHN"].every(
    (country) => historical.rows?.[country]?.ok === true && Number(historical.rows?.[country]?.count ?? 0) > 0,
  );

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
  representative_country_profiles_ready: historicalReady,
  live_runtime_issue_signature: historicalReady
    ? "HISTORICAL_SERVING_READY"
    : "HISTORICAL_RUNTIME_CONFIGURATION_REQUIRED",
}, null, 2));

if (!historicalReady) process.exit(1);
