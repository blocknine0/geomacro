import process from "node:process";
import { createClient } from "@supabase/supabase-js";

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

async function probe(target) {
  if (!target.url || !target.key) {
    return { configured: false, reachable: false, table: false, rows: {} };
  }
  const db = createClient(target.url, target.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results = {};
  for (const country of countries) {
    const result = await db
      .from("commercial_structural_country_profiles")
      .select("country_iso3", { count: "exact", head: true })
      .eq("country_iso3", country);
    results[country] = result.error
      ? { ok: false, code: result.error.code ?? "UNKNOWN" }
      : { ok: true, count: result.count ?? 0 };
  }

  const tableResult = await db
    .from("commercial_structural_country_coverage_latest")
    .select("country_iso3", { count: "exact", head: true })
    .eq("country_iso3", "USA");

  const table = !tableResult.error || !["42P01", "PGRST205"].includes(tableResult.error.code ?? "");

  return {
    configured: true,
    reachable: !Object.values(results).some((row) => !row.ok),
    table,
    rows: results,
  };
}

const output = {};
for (const target of targets) {
  output[target.name] = await probe(target);
}

const historical = output.historical;
const authoritative = output.authoritative_app;

const result = {
  schema_version: "geomacro.structural-serving-production-probe.v1",
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
};

console.log(JSON.stringify(result, null, 2));
