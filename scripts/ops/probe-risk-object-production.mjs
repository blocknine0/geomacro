import process from "node:process";

const url = String(process.env.APP_SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.APP_SUPABASE_SERVICE_ROLE_KEY || "";
const subjects = ["USA", "IND", "CHN"];
const ACTIVE_KEY_ID = "geomacro-risk-2026-03";

async function get(subject) {
  const endpoint = new URL(`${url}/rest/v1/geomacro_risk_objects`);
  endpoint.searchParams.set("select", "object_id,subject_type,subject_id,generated_at,expires_at,verification_status,commercial_eligibility_status,signing_key_id,payload_hash");
  endpoint.searchParams.set("subject_type", "eq.country");
  endpoint.searchParams.set("subject_id", `eq.${subject}`);
  endpoint.searchParams.set("order", "generated_at.desc");
  endpoint.searchParams.set("limit", "10");
  const response = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    redirect: "error",
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: response.status, ok: response.ok, code: json?.code ?? null, rows: Array.isArray(json) ? json : [] };
}

const now = Date.now();
const result = {};
for (const subject of subjects) {
  const probe = await get(subject);
  const rows = probe.rows.map((row) => ({
    object_id: row.object_id,
    generated_at: row.generated_at,
    expires_at: row.expires_at,
    verification_status: row.verification_status,
    commercial_eligibility_status: row.commercial_eligibility_status,
    signing_key_id: row.signing_key_id,
    fresh: typeof row.expires_at === "string" && Date.parse(row.expires_at) > now,
    active_key: row.signing_key_id === ACTIVE_KEY_ID,
    verified_and_commercial: row.verification_status === "VERIFIED" && row.commercial_eligibility_status === "VERIFIED",
  }));
  result[subject] = {
    status: probe.status,
    ok: probe.ok,
    code: probe.code,
    rows,
    current_canonical_ready: rows.some((row) =>
      row.fresh && row.active_key && row.verified_and_commercial,
    ),
  };
}

console.log(JSON.stringify({
  schema_version: "geomacro.risk-object-production-probe.v2",
  checked_at: new Date().toISOString(),
  active_key_id: ACTIVE_KEY_ID,
  secrets_exposed: false,
  result,
}, null, 2));
