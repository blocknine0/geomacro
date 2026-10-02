#!/usr/bin/env node
/**
 * Reconcile every required/active source into an explicit production state.
 *
 * This is deliberately fail-closed. It never turns registration, reachability,
 * registry rights assertions, or historical runtime rows into CERTIFIED state.
 * Existing CERTIFIED rows are preserved. Non-certified required sources become
 * IN_REVIEW, active sources receive an explicit endpoint disposition, reviewed
 * rights evidence is synchronized, and runtime/adapter evidence is refreshed.
 *
 * The script uses direct Postgres only for Supabase state so it keeps working
 * when the Supabase Data API is unavailable because of free-tier egress limits.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { COMMERCIAL_SOURCE_RIGHTS_EVIDENCE } from "../commercial-source-rights-evidence.mjs";

const execFileAsync = promisify(execFile);
const PROJECT = String(process.env.EXPECTED_SUPABASE_PROJECT_REF || "ldpwajisioljyjtojvfx").trim();
const DB_URL = String(process.env.SUPABASE_DB_URL || "").trim();
const REVISION = String(process.env.GITHUB_SHA || process.env.CODE_REVISION || "local").trim();
const OUT_DIR = path.join(process.cwd(), "artifacts", "production-source-alignment");
const PROBE_TIMEOUT_MS = Math.max(3000, Number(process.env.SOURCE_ALIGNMENT_PROBE_TIMEOUT_MS || 12000));

if (!DB_URL) throw new Error("SUPABASE_DB_URL is required");
if (!/^[A-Za-z0-9._-]+$/.test(REVISION)) throw new Error("Unsafe code revision");

const parsedDb = new URL(DB_URL);
const username = decodeURIComponent(parsedDb.username);
const direct = parsedDb.hostname === `db.${PROJECT}.supabase.co` && username === "postgres";
const pooled = parsedDb.hostname.endsWith(".pooler.supabase.com") && username === `postgres.${PROJECT}`;
if (!["postgres:", "postgresql:"].includes(parsedDb.protocol) || (!direct && !pooled)) {
  throw new Error("SUPABASE_DB_URL is not the authoritative production database");
}
if (!parsedDb.password || parsedDb.pathname !== "/postgres") {
  throw new Error("Invalid authoritative production database URL");
}

await fs.mkdir(OUT_DIR, { recursive: true });

function sqlQuote(value) {
  if (value === null || value === undefined) return "null";
  return "'" + String(value).replaceAll("'", "''") + "'";
}

async function psql(query) {
  const { stdout } = await execFileAsync(
    "psql",
    [DB_URL, "-v", "ON_ERROR_STOP=1", "-X", "-At", "-c", query],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return stdout.trim();
}

async function jsonRows(query) {
  const raw = await psql(`select coalesce(json_agg(row_to_json(x)), '[]'::json)::text from (${query}) x`);
  return raw ? JSON.parse(raw) : [];
}

const requiredSources = await jsonRows(`
with required as (
  select distinct source_id
  from public.live_global_source_universe
  where required = true
  union
  select source_id
  from public.live_external_sources
  where enabled_for_ingestion = true or enabled_for_commercial_signals = true
)
select
  s.source_id,
  s.base_url,
  s.provider_name,
  s.freshness_class,
  s.enabled_for_ingestion,
  s.enabled_for_commercial_signals,
  c.certification_state,
  c.endpoint_status,
  c.endpoint_disposition,
  c.rights_status,
  c.schema_status,
  c.freshness_status,
  c.provenance_status,
  c.independence_status,
  c.adapter_status,
  c.runtime_status,
  c.fallback_status
from required r
join public.live_external_sources s on s.source_id = r.source_id
left join public.live_source_certification_records c on c.source_id = r.source_id
order by s.source_id
`);

if (requiredSources.length === 0) throw new Error("No required production sources resolved");
if (requiredSources.some((row) => !row.certification_state)) {
  throw new Error("A required source is missing its certification record");
}

function classifyProbe(response, baseUrl) {
  const status = response.status;
  const finalUrl = response.url || baseUrl;
  if (status >= 200 && status < 400) {
    let redirected = false;
    try { redirected = new URL(finalUrl).toString() !== new URL(baseUrl).toString(); } catch {}
    return {
      endpoint_status: "PASS",
      endpoint_disposition: redirected ? "CANONICAL_REDIRECT" : "WORKING",
      reason: redirected ? "Live production probe reached a canonical redirect target." : "Live production probe returned a working response.",
      final_url: finalUrl,
      http_status: status,
      content_type: response.headers.get("content-type"),
    };
  }
  if (status === 401) return { endpoint_status: "AUTH_REQUIRED", endpoint_disposition: "AUTH_REQUIRED", reason: "Live production probe requires authentication.", final_url: finalUrl, http_status: status, content_type: response.headers.get("content-type") };
  if (status === 403 || status === 429) return { endpoint_status: "WAF", endpoint_disposition: "WAF", reason: "Live production probe is blocked or rate-limited by the remote endpoint.", final_url: finalUrl, http_status: status, content_type: response.headers.get("content-type") };
  if (status === 404 || status === 410) return { endpoint_status: "WRONG_ENDPOINT", endpoint_disposition: "MISSING_ENDPOINT", reason: "Live production probe found no usable endpoint at the configured URL.", final_url: finalUrl, http_status: status, content_type: response.headers.get("content-type") };
  return { endpoint_status: "FAIL", endpoint_disposition: "FAIL", reason: `Live production probe returned HTTP ${status}.`, final_url: finalUrl, http_status: status, content_type: response.headers.get("content-type") };
}

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Geomacro-Production-Source-Alignment/1.0 (+https://geomacro.live)",
        accept: "*/*",
        range: "bytes=0-2047",
      },
    });
    return { ...classifyProbe(response, url), latency_ms: Date.now() - started, error: null };
  } catch (error) {
    const message = String(error?.message || error);
    const timeout = error?.name === "AbortError" || /abort|timeout/i.test(message);
    const dns = /ENOTFOUND|EAI_AGAIN|dns|getaddrinfo/i.test(message);
    return {
      endpoint_status: timeout ? "TIMEOUT" : dns ? "DNS_FAILURE" : "FAIL",
      endpoint_disposition: timeout ? "TIMEOUT" : dns ? "DNS_FAILURE" : "FAIL",
      reason: timeout ? "Live production probe timed out." : dns ? "Live production probe failed DNS resolution." : "Live production probe failed before a usable response.",
      final_url: null,
      http_status: null,
      content_type: null,
      latency_ms: Date.now() - started,
      error: message.slice(0, 1500),
    };
  } finally {
    clearTimeout(timer);
  }
}

// Only probe active sources that are still dangling. The frozen 933 endpoint
// census remains untouched; this closes the active-source production gap.
const danglingActive = requiredSources.filter((source) =>
  (source.enabled_for_ingestion || source.enabled_for_commercial_signals) &&
  (!source.endpoint_disposition || source.endpoint_disposition === "UNCLASSIFIED"),
);
const activeProbeResults = [];
for (const source of danglingActive) {
  if (!source.base_url) {
    activeProbeResults.push({
      source_id: source.source_id,
      endpoint_status: "WRONG_ENDPOINT",
      endpoint_disposition: "MISSING_ENDPOINT",
      reason: "Active source has no configured HTTP endpoint.",
      final_url: null,
      http_status: null,
      content_type: null,
      latency_ms: 0,
      error: null,
    });
    continue;
  }
  const result = await probe(source.base_url);
  activeProbeResults.push({ source_id: source.source_id, ...result });
}

if (activeProbeResults.length > 0) {
  const values = activeProbeResults.map((r) => `(
    ${sqlQuote(r.source_id)}, ${sqlQuote(r.endpoint_status)}, ${sqlQuote(r.endpoint_disposition)},
    ${sqlQuote(r.reason)}, ${sqlQuote(r.final_url)}, ${r.http_status === null ? "null" : Number(r.http_status)},
    ${sqlQuote(r.content_type)}, ${Number(r.latency_ms)}, ${sqlQuote(r.error)}
  )`).join(",\n");
  await psql(`
  with probed(source_id,endpoint_status,endpoint_disposition,reason,final_url,http_status,content_type,latency_ms,error_text) as (
    values ${values}
  )
  update public.live_source_certification_records c
  set endpoint_status = p.endpoint_status,
      endpoint_disposition = p.endpoint_disposition,
      endpoint_disposition_reason = p.reason,
      endpoint_disposition_observed_at = now(),
      endpoint_http_status = p.http_status,
      endpoint_final_url = p.final_url,
      endpoint_content_type = p.content_type,
      endpoint_latency_ms = p.latency_ms,
      endpoint_error = p.error_text,
      endpoint_observed_at = now(),
      canonical_url = case when p.endpoint_status='PASS' and p.final_url is not null then p.final_url else c.canonical_url end,
      updated_at = now()
  from probed p
  where c.source_id = p.source_id
    and c.certification_state <> 'CERTIFIED';
  `);
}

// Synchronize only human-reviewed VERIFIED commercial-rights entries. Registry
// labels alone are never treated as proof and DERIVED_ONLY remains governed by
// its stricter existing evidence path.
const reviewedRights = Object.entries(COMMERCIAL_SOURCE_RIGHTS_EVIDENCE)
  .filter(([, evidence]) => evidence?.approved_status === "VERIFIED")
  .map(([source_id, evidence]) => ({
    source_id,
    evidence_ref: evidence.terms_url,
  }));

if (reviewedRights.length > 0) {
  const values = reviewedRights.map((row) => `(${sqlQuote(row.source_id)},${sqlQuote(row.evidence_ref)})`).join(",");
  await psql(`
  with reviewed(source_id,evidence_ref) as (values ${values})
  update public.live_source_certification_records c
  set rights_status='COMMERCIAL_OK',
      rights_evidence_ref=r.evidence_ref,
      rights_reviewed_at=coalesce(c.rights_reviewed_at,now()),
      updated_at=now()
  from reviewed r
  where c.source_id=r.source_id
    and c.certification_state <> 'CERTIFIED'
    and c.rights_status in ('UNREVIEWED','REVIEW_REQUIRED');
  `);
}

// Mirror the existing evidence-graph runtime rule directly against the stored
// runtime snapshot: recent normalized observations with source-URL provenance
// pass; otherwise the runtime dimension is explicitly FAIL, never silently
// UNTESTED. This does not certify a source.
await psql(`
with required as (
  select distinct source_id from public.live_global_source_universe where required=true
  union
  select source_id from public.live_external_sources where enabled_for_ingestion=true or enabled_for_commercial_signals=true
), evaluated as (
  select
    s.source_id,
    case s.freshness_class
      when 'NEAR_REAL_TIME' then 21600
      when 'PERIODIC' then 1209600
      when 'ANNUAL' then 34560000
      when 'SOURCE_DEPENDENT' then 7776000
      when 'VARIABLE' then 2592000
      else 2592000
    end as max_seconds,
    r.observation_count,
    r.observations_with_source_url,
    r.latest_observed_at
  from required req
  join public.live_external_sources s on s.source_id=req.source_id
  left join public.live_source_runtime_evidence_snapshot r on r.source_id=s.source_id
)
update public.live_source_certification_records c
set runtime_status = case
      when e.observation_count > 0
       and e.observations_with_source_url > 0
       and e.latest_observed_at is not null
       and extract(epoch from (now()-e.latest_observed_at)) <= e.max_seconds
      then 'PASS'
      else 'FAIL'
    end,
    updated_at=now()
from evaluated e
where c.source_id=e.source_id
  and c.certification_state <> 'CERTIFIED';
`);

// Reuse the repository adapter scan semantics from the evidence graph, but do
// not overstate MAPPED as TESTED.
async function loadAdapterEvidence(sourceIds) {
  const roots = ["src", "scripts", "supabase/functions", "supabase/isolated-signal/functions"];
  const textFiles = [];
  async function walk(dir) {
    try {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile() && /\.(?:m?[jt]sx?|py|sql|json|md)$/i.test(entry.name)) textFiles.push(full);
      }
    } catch {}
  }
  for (const root of roots) await walk(root);
  const mapped = new Set();
  const tested = new Set();
  for (const file of textFiles) {
    let content = "";
    try { content = await fs.readFile(file, "utf8"); } catch { continue; }
    const isTest = /(__tests__|\.test\.|\.spec\.)/.test(file);
    for (const id of sourceIds) {
      if (!content.includes(id)) continue;
      mapped.add(id);
      if (isTest) tested.add(id);
    }
  }
  return { mapped, tested };
}

const adapterEvidence = await loadAdapterEvidence(requiredSources.map((r) => r.source_id));
const adapterRows = requiredSources
  .filter((r) => adapterEvidence.mapped.has(r.source_id))
  .map((r) => ({ source_id: r.source_id, status: adapterEvidence.tested.has(r.source_id) ? "TESTED" : "MAPPED" }));

if (adapterRows.length > 0) {
  const values = adapterRows.map((r) => `(${sqlQuote(r.source_id)},${sqlQuote(r.status)})`).join(",");
  await psql(`
  with mapped(source_id,adapter_status) as (values ${values})
  update public.live_source_certification_records c
  set adapter_status=m.adapter_status,
      adapter_id=case when m.adapter_status='TESTED' then m.source_id else coalesce(c.adapter_id,m.source_id) end,
      updated_at=now()
  from mapped m
  where c.source_id=m.source_id
    and c.certification_state <> 'CERTIFIED'
    and (c.adapter_status='UNMAPPED' or (c.adapter_status='MAPPED' and m.adapter_status='TESTED'));
  `);
}

// Normalize endpoint disposition from already observed endpoint status for all
// non-certified sources. UNTESTED stays UNCLASSIFIED; active UNTESTED rows were
// live-probed above so the active production surface cannot remain dangling.
await psql(`
with required as (
  select distinct source_id from public.live_global_source_universe where required=true
  union
  select source_id from public.live_external_sources where enabled_for_ingestion=true or enabled_for_commercial_signals=true
)
update public.live_source_certification_records c
set endpoint_disposition = case c.endpoint_status
      when 'PASS' then 'WORKING'
      when 'CANONICAL_REQUIRED' then 'CANONICAL_REDIRECT'
      when 'AUTH_REQUIRED' then 'AUTH_REQUIRED'
      when 'WAF' then 'WAF'
      when 'DEPRECATED' then 'DEPRECATED'
      when 'WRONG_ENDPOINT' then 'WRONG_ENDPOINT'
      when 'TIMEOUT' then 'TIMEOUT'
      when 'DNS_FAILURE' then 'DNS_FAILURE'
      when 'BLOCKED_ENVIRONMENT' then 'BLOCKED_ENVIRONMENT'
      when 'FAIL' then 'FAIL'
      else 'UNCLASSIFIED'
    end,
    endpoint_disposition_reason = coalesce(c.endpoint_disposition_reason,
      case when c.endpoint_status='UNTESTED'
        then 'No endpoint transport evidence is available yet; source remains fail-closed.'
        else 'Production source alignment synchronized the endpoint disposition from the latest governed endpoint status.'
      end),
    endpoint_disposition_observed_at = coalesce(c.endpoint_disposition_observed_at,c.endpoint_observed_at,now()),
    updated_at=now()
from required r
where c.source_id=r.source_id
  and c.certification_state <> 'CERTIFIED'
  and (c.endpoint_disposition is null or c.endpoint_disposition='UNCLASSIFIED');
`);

// The key alignment operation: every required non-certified source moves out of
// NOT_STARTED into an explicit evidence-review state. No certification fields
// are forged and existing CERTIFIED/REJECTED decisions are preserved.
await psql(`
with required as (
  select distinct source_id from public.live_global_source_universe where required=true
  union
  select source_id from public.live_external_sources where enabled_for_ingestion=true or enabled_for_commercial_signals=true
)
update public.live_source_certification_records c
set certification_state='IN_REVIEW',
    certification_reason='Production-aligned fail-closed review. CERTIFIED remains blocked until every governed evidence dimension passes.',
    certification_evidence_ref=coalesce(c.certification_evidence_ref,'production-source-alignment:${REVISION}:' || c.source_id),
    updated_at=now()
from required r
where c.source_id=r.source_id
  and c.certification_state='NOT_STARTED';
`);

// Queue rows were already generated by the global coverage contract. Keep
// certified paths untouched; refresh evidence linkage only for fail-closed paths
// without changing their QUEUED/REJECTED safety state.
await psql(`
update public.live_source_certification_queue q
set evidence_ref=coalesce(q.evidence_ref,'production-source-alignment:${REVISION}:' || q.source_id || ':' || q.queue_key),
    last_attempt_at=coalesce(q.last_attempt_at,now()),
    updated_at=case when q.evidence_ref is null or q.last_attempt_at is null then now() else q.updated_at end
where q.certification_state <> 'CERTIFIED'
  and q.fail_closed=true
  and (q.evidence_ref is null or q.last_attempt_at is null);
`);

const summaryRows = await jsonRows(`
with required as (
  select distinct source_id from public.live_global_source_universe where required=true
  union
  select source_id from public.live_external_sources where enabled_for_ingestion=true or enabled_for_commercial_signals=true
), source_counts as (
  select
    count(*)::bigint required_source_count,
    count(c.source_id)::bigint certification_record_count,
    count(*) filter(where c.certification_state='CERTIFIED')::bigint certified_source_count,
    count(*) filter(where c.certification_state='IN_REVIEW')::bigint in_review_source_count,
    count(*) filter(where c.certification_state='REJECTED')::bigint rejected_source_count,
    count(*) filter(where c.certification_state='NOT_STARTED')::bigint not_started_source_count,
    count(*) filter(where c.endpoint_status<>'UNTESTED')::bigint endpoint_review_count,
    count(*) filter(where c.rights_status<>'UNREVIEWED')::bigint rights_review_count,
    count(*) filter(where c.schema_status<>'UNTESTED')::bigint schema_review_count,
    count(*) filter(where c.freshness_status<>'UNTESTED')::bigint freshness_review_count,
    count(*) filter(where c.provenance_status<>'UNTESTED')::bigint provenance_review_count,
    count(*) filter(where c.independence_status<>'UNTESTED')::bigint independence_review_count,
    count(*) filter(where c.adapter_status<>'UNMAPPED')::bigint adapter_review_count,
    count(*) filter(where c.runtime_status<>'UNTESTED')::bigint runtime_review_count
  from required r
  left join public.live_source_certification_records c using(source_id)
), active_counts as (
  select
    count(*)::bigint active_source_count,
    count(c.source_id) filter(where c.endpoint_disposition is not null and c.endpoint_disposition<>'UNCLASSIFIED')::bigint active_disposition_count,
    count(c.source_id) filter(where c.endpoint_disposition is null or c.endpoint_disposition='UNCLASSIFIED')::bigint active_unclassified_count
  from public.live_external_sources s
  left join public.live_source_certification_records c using(source_id)
  where s.enabled_for_ingestion=true or s.enabled_for_commercial_signals=true
), path_counts as (
  select
    count(*)::bigint path_count,
    count(*) filter(where certification_state='CERTIFIED' and fail_closed=false)::bigint certified_path_count,
    count(*) filter(where certification_state in ('QUEUED','REJECTED') and fail_closed=true)::bigint fail_closed_path_count,
    count(*) filter(where not ((certification_state='CERTIFIED' and fail_closed=false) or (certification_state in ('QUEUED','REJECTED') and fail_closed=true)))::bigint invalid_path_state_count
  from public.live_source_certification_queue
)
select s.*,a.*,p.* from source_counts s cross join active_counts a cross join path_counts p
`);

const summary = summaryRows[0];
if (!summary) throw new Error("Production source alignment summary returned no row");
summary.schema_version = "geomacro-production-source-alignment-v1";
summary.evaluated_at = new Date().toISOString();
summary.code_revision = REVISION;
summary.authoritative_project_ref = PROJECT;
summary.active_sources_live_probed = activeProbeResults.length;
summary.active_probe_results = activeProbeResults;
summary.frozen_endpoint_933_census_mutated = false;
summary.certification_rule = "Only the guarded evidence-graph promotion function may set CERTIFIED; alignment never manufactures missing evidence.";
summary.write_operations_performed = true;

await fs.writeFile(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));

const required = Number(summary.required_source_count);
if (required < 1 || Number(summary.certification_record_count) !== required) throw new Error("Required source record coverage is incomplete");
if (Number(summary.not_started_source_count) !== 0) throw new Error("Required source alignment left NOT_STARTED sources");
if (Number(summary.active_source_count) < 1 || Number(summary.active_unclassified_count) !== 0) throw new Error("Active source endpoint disposition remains incomplete");
if (Number(summary.path_count) < 1 || Number(summary.invalid_path_state_count) !== 0) throw new Error("Certification queue contains an invalid fail-closed path state");
if (Number(summary.certified_path_count) + Number(summary.fail_closed_path_count) !== Number(summary.path_count)) throw new Error("Certification path accounting is incomplete");
