import { execFileSync } from "node:child_process";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const MAX_BUFFER = 8 * 1024 * 1024;

function validateDbUrl(raw) {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("SUPABASE_DB_URL is required");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("SUPABASE_DB_URL must use postgres/postgresql");
  }
  const direct = url.hostname === `db.${PROJECT_REF}.supabase.co` && url.username === "postgres";
  const pooler = url.hostname.endsWith(".pooler.supabase.com") && url.username === `postgres.${PROJECT_REF}`;
  if ((!direct && !pooler) || !url.password || url.pathname !== "/postgres") {
    throw new Error("Refusing source-governance audit outside the authoritative production database");
  }
  return value;
}

function psql(dbUrl, sql) {
  return execFileSync("psql", [dbUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    input: `${sql.trim()}\n`,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

const dbUrl = validateDbUrl(process.env.SUPABASE_DB_URL);
const raw = psql(dbUrl, `
  select json_build_object(
    'evaluated_at', evaluated_at,
    'source_count', source_count,
    'certification_record_count', certification_record_count,
    'incomplete_inventory_metadata_rows', incomplete_inventory_metadata_rows,
    'implicit_lifecycle_rows', implicit_lifecycle_rows,
    'unreviewed_rights_rows', unreviewed_rights_rows,
    'active_untested_rows', active_untested_rows,
    'ingestion_enabled_rows', ingestion_enabled_rows,
    'commercial_signal_rows', commercial_signal_rows,
    'unsafe_commercial_signal_rows', unsafe_commercial_signal_rows,
    'explicit_quarantined_inventory_rows', explicit_quarantined_inventory_rows,
    'commercial_source_alignment_complete', commercial_source_alignment_complete
  )::text
  from public.live_commercial_source_alignment_status;
`);

if (!raw) throw new Error("SOURCE_GOVERNANCE_STATUS_MISSING");
const status = JSON.parse(raw);
const mustBeZero = [
  "incomplete_inventory_metadata_rows",
  "implicit_lifecycle_rows",
  "unreviewed_rights_rows",
  "active_untested_rows",
  "unsafe_commercial_signal_rows",
];
const failures = [];

if (Number(status.source_count) <= 0) failures.push("source_count must be > 0");
if (Number(status.certification_record_count) !== Number(status.source_count)) {
  failures.push("every inventoried source must have a certification lifecycle record");
}
for (const key of mustBeZero) {
  if (Number(status[key]) !== 0) failures.push(`${key}=${status[key]}`);
}
if (Number(status.commercial_signal_rows) <= 0) {
  failures.push("commercial_signal_rows must be > 0; launch cannot pass with an empty paid-signal set");
}
if (status.commercial_source_alignment_complete !== true) {
  failures.push("commercial_source_alignment_complete=false");
}

const evidence = {
  contract: "geomacro-commercial-source-governance-v1",
  authoritative_store: "production_postgres",
  fail_closed: true,
  ...status,
  accepted: failures.length === 0,
  failures,
};
console.log(JSON.stringify(evidence, null, 2));
if (failures.length) process.exit(1);
