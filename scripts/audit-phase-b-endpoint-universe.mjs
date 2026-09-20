#!/usr/bin/env node
/**
 * Permanent Phase B universe audit.
 *
 * Read-only census of the canonical source/endpoint scopes. It does not
 * mutate source state, endpoint disposition, rights, certification or runtime.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const dbUrl = process.env.SUPABASE_DB_URL;
const expectedProject = process.env.EXPECTED_SUPABASE_PROJECT_REF ?? "ldpwajisioljyjtojvfx";

if (!dbUrl) throw new Error("SUPABASE_DB_URL is required");

const parsed = new URL(dbUrl);
if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
  throw new Error("SUPABASE_DB_URL must use postgres:// or postgresql://");
}
const username = decodeURIComponent(parsed.username);
const directMatch =
  parsed.hostname === `db.${expectedProject}.supabase.co` && username === "postgres";
const poolerMatch =
  parsed.hostname.endsWith(".pooler.supabase.com") &&
  username === `postgres.${expectedProject}`;
if (!directMatch && !poolerMatch) {
  throw new Error("Refusing Phase B universe audit against an unexpected production database.");
}
if (!parsed.password || parsed.pathname !== "/postgres") {
  throw new Error("Invalid production database URL.");
}

const outDir = path.join(process.cwd(), "artifacts", "phase-b-universe-audit");
await fs.mkdir(outDir, { recursive: true });

const exec = promisify(execFile);
async function sql(query) {
  const { stdout } = await exec(
    "psql",
    [dbUrl, "-v", "ON_ERROR_STOP=1", "-At", "-c", query],
    { maxBuffer: 30 * 1024 * 1024 },
  );
  return stdout.trim();
}

const raw = await sql(`
with required_rows as (
  select
    u.scope_type,
    u.scope_code,
    coalesce(u.module_id, '') as module_id,
    u.source_role,
    u.source_id
  from public.live_global_source_universe u
  where u.required = true
),
required_with_endpoint as (
  select
    r.*,
    coalesce(c.endpoint_url, c.canonical_url, '') as endpoint_url
  from required_rows r
  left join public.live_source_certification_records c on c.source_id = r.source_id
),
active_sources as (
  select source_id
  from public.live_external_sources
  where enabled_for_ingestion = true or enabled_for_commercial_signals = true
),
active_with_endpoint as (
  select
    a.source_id,
    coalesce(c.endpoint_url, c.canonical_url, '') as endpoint_url
  from active_sources a
  left join public.live_source_certification_records c on c.source_id = a.source_id
)
select json_build_object(
  'required_path_row_count', (select count(*)::bigint from required_rows),
  'required_distinct_source_count', (select count(distinct source_id)::bigint from required_rows),
  'required_distinct_endpoint_count', (
    select count(distinct endpoint_url)::bigint
    from required_with_endpoint
    where endpoint_url <> ''
  ),
  'required_missing_endpoint_count', (
    select count(*)::bigint
    from required_with_endpoint
    where endpoint_url = ''
  ),
  'active_source_count', (select count(*)::bigint from active_sources),
  'active_distinct_endpoint_count', (
    select count(distinct endpoint_url)::bigint
    from active_with_endpoint
    where endpoint_url <> ''
  ),
  'active_missing_endpoint_count', (
    select count(*)::bigint
    from active_with_endpoint
    where endpoint_url = ''
  ),
  'active_outside_required_count', (
    select count(*)::bigint
    from active_sources a
    where not exists (
      select 1 from required_rows r where r.source_id = a.source_id
    )
  )
)::text
`);

const report = JSON.parse(raw);
report.schema_version = "geomacro-phase-b-universe-audit-v1";
report.evaluated_at = new Date().toISOString();
report.authoritative_project_ref = expectedProject;
report.write_operations_performed = false;

await fs.writeFile(
  path.join(outDir, "summary.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
