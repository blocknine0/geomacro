import { execFileSync } from "node:child_process";

const TRANSIENT_REST_STATUSES = new Set([
  402,
  408,
  429,
  500,
  502,
  503,
  504,
  520,
  521,
  522,
  523,
  524,
]);

function requiredApiIdentity() {
  const raw = process.env.APP_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!raw) throw new Error("APP_SUPABASE_URL or SUPABASE_URL is required");
  const api = new URL(raw);
  const match = api.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
  if (!match) throw new Error("GRI audit API URL is not a canonical Supabase project URL");
  return { apiUrl: api, projectRef: match[1] };
}

function authoritativeDbUrl() {
  const raw = process.env.SUPABASE_DB_URL?.trim();
  if (!raw) return null;

  const { projectRef } = requiredApiIdentity();
  const db = new URL(raw);
  const direct =
    db.hostname === `db.${projectRef}.supabase.co` &&
    db.username === "postgres";
  const pooler =
    db.hostname.endsWith(".pooler.supabase.com") &&
    db.username === `postgres.${projectRef}`;

  if (
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    (!direct && !pooler) ||
    !db.password ||
    db.pathname !== "/postgres"
  ) {
    throw new Error("SUPABASE_DB_URL is not the authoritative GRI production database");
  }

  return raw;
}

function safeVersion(value, field) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(text)) {
    throw new Error(`${field} is not a safe version identifier`);
  }
  return text;
}

function safeUuid(value, field) {
  const text = String(value ?? "").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    throw new Error(`${field} is not a UUID`);
  }
  return text;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseEq(value, field) {
  const text = String(value ?? "");
  if (!text.startsWith("eq.")) throw new Error(`${field} must use eq. filter`);
  return text.slice(3);
}

function directSql(table, params) {
  switch (table) {
    case "gri_validation_runs": {
      const method = safeVersion(parseEq(params.methodology_version, "methodology_version"), "methodology_version");
      return `
        select row_to_json(t)::text
        from (
          select id,methodology_version,validation_version,evidence_mode,source_replay_run_id,status,
                 sample_start,sample_end,sample_count,benchmark_count,train_fraction,result_hash,summary,published_at
          from public.gri_validation_runs
          where methodology_version = ${sqlLiteral(method)}
            and published_at is not null
          order by published_at desc
          limit 1
        ) t
      `;
    }
    case "gri_validation_metrics": {
      const runId = safeUuid(parseEq(params.validation_run_id, "validation_run_id"), "validation_run_id");
      return `
        select row_to_json(t)::text
        from (
          select benchmark_key,horizon_hours,split,sample_count,pearson_r,spearman_rho,delta_pearson_r,
                 delta_pearson_p_approx,direction_hit_rate,high_risk_event_count,false_positive_rate,
                 event_study_high_mean_z,event_study_baseline_mean_z,event_study_effect_z,notes
          from public.gri_validation_metrics
          where validation_run_id = ${sqlLiteral(runId)}::uuid
          order by benchmark_key asc, horizon_hours asc, split asc
        ) t
      `;
    }
    case "gri_snapshots": {
      const method = safeVersion(parseEq(params.methodology_version, "methodology_version"), "methodology_version");
      return `
        select row_to_json(t)::text
        from (
          select id,as_of,methodology_version,proof_version,proof_hash,verification_status,status,raw_score,
                 display_score,coverage,event_count,source_count,independent_story_count,published_at
          from public.gri_snapshots
          where status = 'published'
            and methodology_version = ${sqlLiteral(method)}
          order by as_of desc
          limit 1
        ) t
      `;
    }
    case "gri_contributions": {
      const snapshotId = safeUuid(parseEq(params.snapshot_id, "snapshot_id"), "snapshot_id");
      return `
        select row_to_json(t)::text
        from (
          select event_id,category,source_key,severity,confidence,observed_at,story_cluster_id
          from public.gri_contributions
          where snapshot_id = ${sqlLiteral(snapshotId)}::uuid
          order by event_id asc
        ) t
      `;
    }
    default:
      throw new Error(`Unsupported GRI audit fallback table: ${table}`);
  }
}

function directRows(table, params) {
  const dbUrl = authoritativeDbUrl();
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is required when the public GRI read path is unavailable");

  const stdout = execFileSync(
    "psql",
    [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-Atqc", directSql(table, params)],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function readGriAuditRows(table, params, anonKey) {
  const { apiUrl } = requiredApiIdentity();
  if (!anonKey) throw new Error("APP_SUPABASE_ANON_KEY is required");

  const url = new URL(`/rest/v1/${table}`, apiUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) url.searchParams.set(key, value);
  }

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        accept: "application/json",
      },
      redirect: "error",
    });
  } catch (error) {
    if (!process.env.SUPABASE_DB_URL?.trim()) throw error;
    console.error(`[gri-audit] ${table} public read unavailable; using guarded read-only DB fallback`);
    return directRows(table, params);
  }

  if (response.ok) {
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error(`${table} returned a non-array response`);
    return body;
  }

  if (!TRANSIENT_REST_STATUSES.has(response.status)) {
    throw new Error(`${table} read failed with HTTP ${response.status}`);
  }

  console.error(`[gri-audit] ${table} public read returned HTTP ${response.status}; using guarded read-only DB fallback`);
  return directRows(table, params);
}
