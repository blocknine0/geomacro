import process from "node:process";

const url = String(process.env.APP_SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.APP_SUPABASE_SERVICE_ROLE_KEY || "";
const subjects = ["USA", "IND", "CHN"];

async function get(path, params) {
  const endpoint = new URL(`${url}/rest/v1/${path}`);
  endpoint.searchParams.set("select", "object_id,subject_id,generated_at,expires_at,verification_status,commercial_eligibility_status,signing_key_id");
  for (const [k, v] of Object.entries(params)) endpoint.searchParams.set(k, v);
  endpoint.searchParams.set("limit", "5");
  const response = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    redirect: "error",
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: response.status, ok: response.ok, code: json?.code ?? null, rows: Array.isArray(json) ? json : [] };
}

const result = {};
for (const subject of subjects) {
  const probe = await get("geomacro_risk_objects", { subject_type: "eq.country", subject_id: `eq.${subject}` });
  result[subject] = probe;
}

console.log(JSON.stringify({
  schema_version: "geomacro.risk-object-production-probe.v1",
  checked_at: new Date().toISOString(),
  secrets_exposed: false,
  result,
}, null, 2));
