#!/usr/bin/env node
/**
 * Align every required/active source to an explicit production certification state.
 *
 * This is deliberately NOT a bulk certification job. Sources without complete
 * evidence stay IN_REVIEW and fail closed. The job removes ambiguous PENDING /
 * UNREVIEWED / UNTESTED certification dimensions by recording an explicit
 * blocked outcome, while preserving evidence-backed CERTIFIED sources.
 *
 * The job uses only the authoritative direct PostgreSQL connection so Supabase
 * REST egress restriction cannot prevent control-plane alignment.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { COMMERCIAL_SOURCE_RIGHTS_EVIDENCE } from "../commercial-source-rights-evidence.mjs";

const execFileAsync = promisify(execFile);
const PROJECT = String(process.env.EXPECTED_SUPABASE_PROJECT_REF || "ldpwajisioljyjtojvfx").trim();
const DB_URL = String(process.env.SUPABASE_DB_URL || "").trim();
const CODE_REVISION = String(process.env.GITHUB_SHA || process.env.CODE_REVISION || "local").trim();
const ACTOR = String(process.env.GITHUB_ACTOR || "geomacro-source-alignment").trim();
const STRICT = process.argv.includes("--strict");
const OUT_DIR = path.join(process.cwd(), "artifacts", "full-source-production-alignment");

if (!DB_URL) throw new Error("SUPABASE_DB_URL is required");
let db;
try {
  db = new URL(DB_URL);
} catch {
  throw new Error("SUPABASE_DB_URL must be a valid PostgreSQL URL");
}
if (!["postgres:", "postgresql:"].includes(db.protocol)) throw new Error("SUPABASE_DB_URL must use postgres/postgresql");
if (!db.password || db.pathname !== "/postgres") throw new Error("Invalid production database target");
const directOk = db.hostname === `db.${PROJECT}.supabase.co` && db.username === "postgres";
const poolerOk = db.hostname.endsWith(".pooler.supabase.com") && db.username === `postgres.${PROJECT}`;
if (!directOk && !poolerOk) throw new Error("Refusing source alignment outside the authoritative Supabase project");

await fs.mkdir(OUT_DIR, { recursive: true });

function sqlLiteral(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

const reviewedRights = Object.entries(COMMERCIAL_SOURCE_RIGHTS_EVIDENCE)
  .filter(([, evidence]) => evidence?.approved_status === "VERIFIED")
  .map(([sourceId, evidence]) => ({
    source_id: sourceId,
    evidence_ref: evidence.terms_url || evidence.dataset_url || "",
  }))
  .sort((a, b) => a.source_id.localeCompare(b.source_id));

const rightsValues = reviewedRights.length > 0
  ? reviewedRights.map((row) => `(${sqlLiteral(row.source_id)},${sqlLiteral(row.evidence_ref)})`).join(",\n")
  : `(null::text,null::text)`;

const runId = `production-source-alignment:${new Date().toISOString()}:${CODE_REVISION.slice(0, 12)}`;
const alignmentEvidencePrefix = `${runId}:`;

const transactionSql = `
begin;

create temp table tmp_required_sources(source_id text primary key) on commit drop;
insert into tmp_required_sources(source_id)
select distinct u.source_id from public.live_global_source_universe u where u.required=true
union
select s.source_id from public.live_external_sources s
where s.enabled_for_ingestion=true or s.enabled_for_commercial_signals=true;

create temp table tmp_reviewed_rights(source_id text primary key,evidence_ref text) on commit drop;
insert into tmp_reviewed_rights(source_id,evidence_ref) values
${rightsValues};
delete from tmp_reviewed_rights where source_id is null;

do $$
begin
  if exists (
    select 1 from tmp_required_sources r
    left join public.live_source_certification_records c using(source_id)
    where c.source_id is null
  ) then
    raise exception 'SOURCE_ALIGNMENT_MISSING_CERTIFICATION_RECORD';
  end if;
end $$;

update public.live_source_certification_records c
set
  certification_state = case when c.certification_state='CERTIFIED' then 'CERTIFIED' else 'IN_REVIEW' end,
  endpoint_status = case
    when c.certification_state='CERTIFIED' then c.endpoint_status
    when c.endpoint_disposition in ('WORKING','CANONICAL_REDIRECT') then 'PASS'
    when c.endpoint_disposition='AUTH_REQUIRED' then 'AUTH_REQUIRED'
    when c.endpoint_disposition='WAF' then 'WAF'
    when c.endpoint_disposition='DEPRECATED' then 'DEPRECATED'
    when c.endpoint_disposition in ('WRONG_ENDPOINT','MISSING_ENDPOINT') then 'WRONG_ENDPOINT'
    when c.endpoint_disposition='TIMEOUT' then 'TIMEOUT'
    when c.endpoint_disposition='DNS_FAILURE' then 'DNS_FAILURE'
    when c.endpoint_disposition='BLOCKED_ENVIRONMENT' then 'BLOCKED_ENVIRONMENT'
    when c.endpoint_disposition='FAIL' then 'FAIL'
    when c.endpoint_status='UNTESTED' then 'FAIL'
    else c.endpoint_status
  end,
  endpoint_disposition = case
    when c.certification_state='CERTIFIED' then c.endpoint_disposition
    when c.endpoint_disposition is null or c.endpoint_disposition='UNCLASSIFIED' then 'FAIL'
    else c.endpoint_disposition
  end,
  endpoint_disposition_reason = case
    when c.certification_state='CERTIFIED' then c.endpoint_disposition_reason
    when c.endpoint_disposition is null or c.endpoint_disposition='UNCLASSIFIED'
      then 'Production alignment: no classified endpoint evidence is currently recorded; source remains fail-closed until re-probed.'
    else c.endpoint_disposition_reason
  end,
  endpoint_disposition_observed_at = case
    when c.certification_state='CERTIFIED' then c.endpoint_disposition_observed_at
    when c.endpoint_disposition is null or c.endpoint_disposition='UNCLASSIFIED' then now()
    else c.endpoint_disposition_observed_at
  end,
  endpoint_error = case
    when c.certification_state='CERTIFIED' then c.endpoint_error
    when c.endpoint_disposition is null or c.endpoint_disposition='UNCLASSIFIED'
      then 'Fail-closed production alignment: endpoint classification evidence missing.'
    else c.endpoint_error
  end,
  rights_status = case
    when c.certification_state='CERTIFIED' then c.rights_status
    when rr.source_id is not null then 'COMMERCIAL_OK'
    when s.commercial_usage_status='PERMISSION_REQUIRED' then 'PERMISSION_REQUIRED'
    when s.commercial_usage_status='INTERNAL_RESEARCH_ONLY' then 'INTERNAL_RESEARCH_ONLY'
    when s.commercial_usage_status='DERIVED_ONLY' then 'DERIVED_ONLY'
    else 'REVIEW_REQUIRED'
  end,
  rights_evidence_ref = case
    when c.certification_state='CERTIFIED' then c.rights_evidence_ref
    when rr.source_id is not null then rr.evidence_ref
    else coalesce(c.rights_evidence_ref, s.base_url)
  end,
  rights_reviewed_at = case when c.certification_state='CERTIFIED' then c.rights_reviewed_at else now() end,
  schema_status = case when c.certification_state='CERTIFIED' then c.schema_status when c.schema_status='UNTESTED' then 'FAIL' else c.schema_status end,
  freshness_status = case when c.certification_state='CERTIFIED' then c.freshness_status when c.freshness_status='UNTESTED' then 'FAIL' else c.freshness_status end,
  provenance_status = case when c.certification_state='CERTIFIED' then c.provenance_status when c.provenance_status='UNTESTED' then 'FAIL' else c.provenance_status end,
  independence_status = case when c.certification_state='CERTIFIED' then c.independence_status when c.independence_status='UNTESTED' then 'FAIL' else c.independence_status end,
  runtime_status = case when c.certification_state='CERTIFIED' then c.runtime_status when c.runtime_status='UNTESTED' then 'FAIL' else c.runtime_status end,
  fallback_status = case when c.certification_state='CERTIFIED' then c.fallback_status when c.fallback_status='UNTESTED' then 'FAIL' else c.fallback_status end,
  certification_reason = case
    when c.certification_state='CERTIFIED' then c.certification_reason
    else 'Production-aligned fail-closed review. CERTIFIED remains blocked until every governed evidence dimension passes.'
  end,
  certification_evidence_ref = case
    when c.certification_state='CERTIFIED' then c.certification_evidence_ref
    else ${sqlLiteral(alignmentEvidencePrefix)} || c.source_id
  end,
  certified_at = case when c.certification_state='CERTIFIED' then c.certified_at else null end,
  certified_by = case when c.certification_state='CERTIFIED' then c.certified_by else null end,
  certification_hash = case when c.certification_state='CERTIFIED' then c.certification_hash else null end,
  updated_at = now()
from tmp_required_sources r
join public.live_external_sources s on s.source_id=r.source_id
left join tmp_reviewed_rights rr on rr.source_id=r.source_id
where c.source_id=r.source_id;

update public.live_source_certification_queue q
set
  certification_state='QUEUED',
  fail_closed=true,
  endpoint_check=c.endpoint_status,
  rights_check=c.rights_status,
  schema_check=c.schema_status,
  freshness_check=c.freshness_status,
  independence_check=c.independence_status,
  last_attempt_at=now(),
  notes='Production-aligned fail-closed. Queue checks mirror the current source certification evidence state; promotion still requires complete evidence.',
  updated_at=now()
from public.live_source_certification_records c
where q.source_id=c.source_id
  and c.certification_state<>'CERTIFIED';

update public.live_source_certification_queue q
set
  certification_state='CERTIFIED',
  fail_closed=false,
  endpoint_check='PASS',
  rights_check=c.rights_status,
  schema_check='PASS',
  freshness_check='PASS',
  independence_check='PASS',
  updated_at=now()
from public.live_source_certification_records c
where q.source_id=c.source_id
  and c.certification_state='CERTIFIED';

do $$
declare
  missing_records bigint;
  not_reviewed bigint;
  rights_unreviewed bigint;
  endpoint_untested bigint;
  schema_untested bigint;
  freshness_untested bigint;
  provenance_untested bigint;
  independence_untested bigint;
  runtime_untested bigint;
  fallback_untested bigint;
  queue_pending bigint;
  fail_open_noncert bigint;
begin
  select count(*) into missing_records from tmp_required_sources r left join public.live_source_certification_records c using(source_id) where c.source_id is null;
  select count(*) into not_reviewed from tmp_required_sources r join public.live_source_certification_records c using(source_id) where c.certification_state='NOT_STARTED';
  select count(*) into rights_unreviewed from tmp_required_sources r join public.live_source_certification_records c using(source_id) where c.rights_status='UNREVIEWED';
  select count(*) into endpoint_untested from tmp_required_sources r join public.live_source_certification_records c using(source_id) where c.endpoint_status='UNTESTED' or c.endpoint_disposition is null or c.endpoint_disposition='UNCLASSIFIED';
  select count(*) into schema_untested from tmp_required_sources r join public.live_source_certification_records c using(source_id) where c.schema_status='UNTESTED';
  select count(*) into freshness_untested from tmp_required_sources r join public.live_source_certification_records c using(source_id) where c.freshness_status='UNTESTED';
  select count(*) into provenance_untested from tmp_required_sources r join public.live_source_certification_records c using(source_id) where c.provenance_status='UNTESTED';
  select count(*) into independence_untested from tmp_required_sources r join public.live_source_certification_records c using(source_id) where c.independence_status='UNTESTED';
  select count(*) into runtime_untested from tmp_required_sources r join public.live_source_certification_records c using(source_id) where c.runtime_status='UNTESTED';
  select count(*) into fallback_untested from tmp_required_sources r join public.live_source_certification_records c using(source_id) where c.fallback_status='UNTESTED';
  select count(*) into queue_pending from public.live_source_certification_queue q where q.endpoint_check='PENDING' or q.rights_check='PENDING' or q.schema_check='PENDING' or q.freshness_check='PENDING' or q.independence_check='PENDING';
  select count(*) into fail_open_noncert from public.live_source_certification_queue q join public.live_source_certification_records c using(source_id) where c.certification_state<>'CERTIFIED' and q.fail_closed=false;
  if missing_records<>0 or not_reviewed<>0 or rights_unreviewed<>0 or endpoint_untested<>0 or schema_untested<>0 or freshness_untested<>0 or provenance_untested<>0 or independence_untested<>0 or runtime_untested<>0 or fallback_untested<>0 or queue_pending<>0 or fail_open_noncert<>0 then
    raise exception 'SOURCE_ALIGNMENT_INVARIANT_FAILED missing=% not_reviewed=% rights=% endpoint=% schema=% freshness=% provenance=% independence=% runtime=% fallback=% queue_pending=% fail_open_noncert=%', missing_records,not_reviewed,rights_unreviewed,endpoint_untested,schema_untested,freshness_untested,provenance_untested,independence_untested,runtime_untested,fallback_untested,queue_pending,fail_open_noncert;
  end if;
end $$;

select '__ALIGNMENT_RESULT__' || json_build_object(
  'run_id',${sqlLiteral(runId)},
  'actor',${sqlLiteral(ACTOR)},
  'code_revision',${sqlLiteral(CODE_REVISION)},
  'required_source_count',(select count(*) from tmp_required_sources),
  'certified_source_count',(select count(*) from tmp_required_sources r join public.live_source_certification_records c using(source_id) where c.certification_state='CERTIFIED'),
  'in_review_source_count',(select count(*) from tmp_required_sources r join public.live_source_certification_records c using(source_id) where c.certification_state='IN_REVIEW'),
  'rights_review_required_count',(select count(*) from tmp_required_sources r join public.live_source_certification_records c using(source_id) where c.rights_status='REVIEW_REQUIRED'),
  'permission_required_count',(select count(*) from tmp_required_sources r join public.live_source_certification_records c using(source_id) where c.rights_status='PERMISSION_REQUIRED'),
  'explicit_endpoint_block_count',(select count(*) from tmp_required_sources r join public.live_source_certification_records c using(source_id) where c.endpoint_status<>'PASS'),
  'adapter_unmapped_count',(select count(*) from tmp_required_sources r join public.live_source_certification_records c using(source_id) where c.adapter_status='UNMAPPED'),
  'runtime_fail_count',(select count(*) from tmp_required_sources r join public.live_source_certification_records c using(source_id) where c.runtime_status='FAIL'),
  'queue_fail_closed_count',(select count(*) from public.live_source_certification_queue where fail_closed=true),
  'queue_certified_count',(select count(*) from public.live_source_certification_queue where certification_state='CERTIFIED' and fail_closed=false),
  'write_operations_performed',true
)::text;
commit;
`;

const { stdout, stderr } = await execFileAsync(
  "psql",
  [DB_URL, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", transactionSql],
  { maxBuffer: 20 * 1024 * 1024 },
);
if (stderr?.trim()) console.error(stderr.trim());
const marker = "__ALIGNMENT_RESULT__";
const line = String(stdout || "").split(/\r?\n/).map((value) => value.trim()).find((value) => value.startsWith(marker));
if (!line) throw new Error("Production source alignment returned no result marker");
const result = JSON.parse(line.slice(marker.length));

const summary = {
  schema_version: "geomacro-full-source-production-alignment-1.0",
  evaluated_at: new Date().toISOString(),
  authoritative_project_ref: PROJECT,
  ...result,
  reviewed_rights_manifest_source_count: reviewedRights.length,
  certification_rule: "Alignment never grants certification. CERTIFIED is preserved only for sources already promoted through the governed evidence graph; all other sources remain fail-closed IN_REVIEW.",
  no_payment_or_mainnet_activation: true,
};
await fs.writeFile(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));

if (STRICT) {
  if (Number(summary.required_source_count || 0) <= 0) throw new Error("No required sources were aligned");
  if (Number(summary.required_source_count) !== Number(summary.certified_source_count) + Number(summary.in_review_source_count)) {
    throw new Error("Required source classification total does not balance");
  }
}
