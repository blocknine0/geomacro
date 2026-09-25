import process from "node:process";

const url = String(process.env.APP_SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.APP_SUPABASE_SERVICE_ROLE_KEY || "";

const tables = [
  "commercial_structural_geopolitical_observations",
  "commercial_macro_observations",
  "commercial_structural_country_latest",
  "commercial_structural_country_profiles",
  "commercial_structural_country_coverage_latest",
  "commercial_structural_corridor_latest",
  "live_structured_events",
];

async function probeTable(table) {
  if (!url || !key) return { exists: false, configured: false };
  const endpoint = new URL(`${url}/rest/v1/${table}`);
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("limit", "1");
  const response = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    redirect: "error",
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return {
    exists: response.ok || !["42P01", "PGRST205"].includes(json?.code ?? ""),
    http_status: response.status,
    code: json?.code ?? null,
    sample_keys: Array.isArray(json) && json[0] && typeof json[0] === "object" ? Object.keys(json[0]) : [],
  };
}

const result = {};
for (const table of tables) result[table] = await probeTable(table);

console.log(JSON.stringify({
  schema_version: "geomacro.structural-base-table-production-probe.v1",
  checked_at: new Date().toISOString(),
  secrets_exposed: false,
  result,
}, null, 2));
