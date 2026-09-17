import crypto from "node:crypto";

const baseUrl = (process.env.APP_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!baseUrl || !serviceKey) {
  console.error("Required Supabase diagnostic credentials are missing.");
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  Accept: "application/json",
};

async function readJson(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  if (!response.ok) {
    console.error(`Read-only diagnostic query failed with HTTP ${response.status}.`);
    process.exit(1);
  }
  return response.json();
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 16);
}

function privateField(detail, field) {
  const raw = String(detail ?? "").trim();
  const match = raw.match(new RegExp(`(?:^|;\\s*)${field}=([^;]+)`, "i"));
  return match ? match[1].trim().slice(0, 120) : null;
}

function classify(detail) {
  const raw = String(detail ?? "").trim();
  const lower = raw.toLowerCase();

  if (!raw) return { category: "missing_detail", sqlstate: null };
  if (raw === "[object Object]") return { category: "opaque_object", sqlstate: null };

  const sqlstateMatch = raw.match(/\b(?:23505|23503|23514|23502|22P02|42703|42P01|21000|57014|PGRST\d{3})\b/i);
  const sqlstate = sqlstateMatch ? sqlstateMatch[0].toUpperCase() : null;

  if (sqlstate === "23505" || lower.includes("duplicate key")) return { category: "unique_constraint", sqlstate };
  if (sqlstate === "23503" || lower.includes("foreign key")) return { category: "foreign_key", sqlstate };
  if (sqlstate === "23514" || lower.includes("check constraint")) return { category: "check_constraint", sqlstate };
  if (sqlstate === "23502" || lower.includes("null value in column")) return { category: "not_null_constraint", sqlstate };
  if (sqlstate === "22P02" || lower.includes("invalid input syntax")) return { category: "invalid_input", sqlstate };
  if (sqlstate === "42703" || lower.includes("column") && lower.includes("does not exist")) return { category: "missing_column", sqlstate };
  if (sqlstate === "42P01" || lower.includes("relation") && lower.includes("does not exist")) return { category: "missing_relation", sqlstate };
  if (sqlstate === "21000" || lower.includes("cannot affect row a second time")) return { category: "upsert_cardinality", sqlstate };
  if (sqlstate?.startsWith("PGRST") || lower.includes("schema cache")) return { category: "postgrest_schema", sqlstate };
  if (lower.includes("country registry is incomplete")) return { category: "country_registry_incomplete", sqlstate };
  if (lower.includes("fragment download failed")) return { category: "fragment_download", sqlstate };
  if (lower.includes("unexpected token") || lower.includes("json") && lower.includes("parse")) return { category: "fragment_json_parse", sqlstate };
  if (lower.includes("timeout") || lower.includes("timed out") || sqlstate === "57014") return { category: "timeout", sqlstate };
  if (lower.includes("fetch failed") || lower.includes("connection")) return { category: "network", sqlstate };

  return { category: "unclassified_private_error", sqlstate };
}

const failedRuns = await readJson(
  "/rest/v1/live_structuring_runs" +
    "?select=status,started_at,finished_at,error_code,error_detail,structure_version,country_version,story_version,scoring_version" +
    "&status=eq.failed&order=started_at.desc&limit=20",
);

const recentRuns = await readJson(
  "/rest/v1/live_structuring_runs" +
    "?select=status,started_at,finished_at,structure_version" +
    "&order=started_at.desc&limit=30",
);

const countryRows = await readJson(
  "/rest/v1/live_country_registry?select=iso3&enabled=eq.true&limit=1000",
);

const latest = failedRuns[0] ?? null;
const classified = latest ? classify(latest.error_detail) : { category: "no_failed_run", sqlstate: null };
const phase = latest ? privateField(latest.error_detail, "phase") : null;
const recurring = latest
  ? failedRuns.filter((run) => hash(run.error_detail) === hash(latest.error_detail)).length
  : 0;

const summary = {
  ok: true,
  read_only: true,
  latest_failure: latest
    ? {
        category: classified.category,
        phase,
        sqlstate: classified.sqlstate,
        private_error_code: latest.error_code,
        detail_fingerprint: hash(latest.error_detail),
        recurrence_in_last_20_failures: recurring,
        started_at: latest.started_at,
        finished_at: latest.finished_at,
        structure_version: latest.structure_version,
        country_version: latest.country_version,
        story_version: latest.story_version,
        scoring_version: latest.scoring_version,
      }
    : null,
  recent_status_counts: recentRuns.reduce((acc, run) => {
    acc[run.status] = (acc[run.status] || 0) + 1;
    return acc;
  }, {}),
  enabled_country_registry_count: countryRows.length,
};

console.log(JSON.stringify(summary, null, 2));

if (classified.category === "opaque_object" || (classified.category === "unclassified_private_error" && !phase)) {
  console.error(
    "Private diagnostics are not specific enough to identify the failing database/storage phase. " +
      "The runtime error serializer must be hardened before treating the structuring incident as resolved.",
  );
  process.exit(2);
}
