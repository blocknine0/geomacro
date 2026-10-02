#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createB2Client } from "./b2-s3-client.mjs";
import { COMMERCIAL_SOURCE_RIGHTS_EVIDENCE } from "../commercial-source-rights-evidence.mjs";

const execFileAsync = promisify(execFile);
const PROJECT = "ldpwajisioljyjtojvfx";
const DB_URL = String(process.env.SUPABASE_DB_URL ?? "").trim();
const PROJECT_ID = String(process.env.SUPABASE_PROJECT_ID ?? PROJECT).trim();
const CODE_REVISION = String(process.env.GITHUB_SHA ?? "local").trim();
const ACTOR = String(process.env.GITHUB_ACTOR ?? "geomacro-phase-a-runtime-repair").trim();
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const B2_KEY_ID = String(process.env.B2_KEY_ID ?? "").trim();
const B2_APPLICATION_KEY = String(process.env.B2_APPLICATION_KEY ?? "").trim();
const HTTP_TIMEOUT_MS = Math.max(5000, Math.min(60000, Number(process.env.PHASE_A_SOURCE_TIMEOUT_MS ?? 25000)));
const HTTP_ATTEMPTS = Math.max(1, Math.min(4, Number(process.env.PHASE_A_SOURCE_ATTEMPTS ?? 3)));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sqlText(value) { return `'${String(value ?? "").replaceAll("'", "''")}'`; }
function sqlJson(value) { return `${sqlText(JSON.stringify(value))}::jsonb`; }

function assertConfig() {
  if (!DB_URL) throw new Error("SUPABASE_DB_URL_REQUIRED");
  if (PROJECT_ID !== PROJECT) throw new Error(`NON_AUTHORITATIVE_SUPABASE_PROJECT:${PROJECT_ID}`);
  const url = new URL(DB_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.password) throw new Error("INVALID_SUPABASE_DB_URL");
  if (!(url.hostname === `db.${PROJECT}.supabase.co` || url.hostname.endsWith(".pooler.supabase.com"))) throw new Error(`NON_AUTHORITATIVE_SUPABASE_DB_HOST:${url.hostname}`);
  if (!B2_KEY_ID || !B2_APPLICATION_KEY) throw new Error("B2_RUNTIME_EVIDENCE_CREDENTIALS_REQUIRED");
}

async function psql(sql, { json = false } = {}) {
  const args = [DB_URL, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", json ? `select coalesce(json_agg(x),'[]'::json)::text from (${sql}) x` : sql];
  const { stdout, stderr } = await execFileAsync("psql", args, { env: { ...process.env, PGSSLMODE: "require" }, maxBuffer: 16 * 1024 * 1024 });
  if (stderr?.trim()) console.error(stderr.trim());
  return json ? JSON.parse(stdout.trim() || "[]") : stdout.trim();
}

async function fetchObserved(url, accept = "*/*") {
  let lastError;
  for (let attempt = 1; attempt <= HTTP_ATTEMPTS; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "Geomacro-Phase-A-Runtime/1.1 (+https://geomacro.live)", accept }, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return { final_url: response.url || url, status: response.status, content_type: response.headers.get("content-type") ?? "", observed_at: new Date().toISOString(), latency_ms: Date.now() - started, bytes, body_sha256: sha256(bytes) };
    } catch (error) {
      lastError = error;
      if (attempt < HTTP_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`SOURCE_PROBE_FAILED:${url}:${String(lastError?.message ?? lastError)}`);
}

function parseGdelt(observation) {
  const line = observation.bytes.toString("utf8").trim().split(/\r?\n/).filter(Boolean)[0] ?? "";
  const releaseUrl = line.split(/\s+/).at(-1) ?? "";
  const match = releaseUrl.match(/\/(\d{14})\.export\.CSV\.zip$/i);
  if (!match) throw new Error("GDELT_LASTUPDATE_CONTRACT_INVALID");
  const stamp = match[1];
  const releaseAt = `${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}T${stamp.slice(8,10)}:${stamp.slice(10,12)}:${stamp.slice(12,14)}Z`;
  const deltaSeconds = (Date.now() - Date.parse(releaseAt)) / 1000;
  if (!Number.isFinite(deltaSeconds) || deltaSeconds > 7200 || deltaSeconds < -1800) throw new Error(`GDELT_LASTUPDATE_TIME_INVALID:${Math.round(deltaSeconds)}`);
  return { schema_status: "PASS", freshness_status: "FRESH", latest_release_at: releaseAt, age_seconds: Math.max(0, Math.round(deltaSeconds)), release_url: releaseUrl };
}

function parseWorldBank(observation) {
  const parsed = JSON.parse(observation.bytes.toString("utf8"));
  if (!Array.isArray(parsed) || !Array.isArray(parsed[1])) throw new Error("WORLD_BANK_JSON_CONTRACT_INVALID");
  const countries = new Set(parsed[1].map((row) => String(row?.countryiso3code ?? "")).filter((v) => /^[A-Z]{3}$/.test(v)));
  if (countries.size < 180) throw new Error(`WORLD_BANK_COUNTRY_COVERAGE_TOO_LOW:${countries.size}`);
  return { schema_status: "PASS", freshness_status: "VARIABLE", observed_country_count: countries.size, source_id: Number(parsed[0]?.sourceid ?? 2) };
}

function parseUsgs(observation) {
  const parsed = JSON.parse(observation.bytes.toString("utf8"));
  if (!/Mineral Commodity Summaries 2026/i.test(JSON.stringify(parsed))) throw new Error("USGS_MCS_2026_CONTRACT_INVALID");
  return { schema_status: "PASS", freshness_status: "VARIABLE", release_family: "Mineral Commodity Summaries 2026", sciencebase_item: "69837e43b66b01367d7ec7c7" };
}

const SOURCES = [
  { domain: "geopolitics", category: "GEOPOLITICS", source_id: "gdelt_v2_events", prefix: "GEO:COVERAGE_FALLBACK:", endpoint: "https://data.gdeltproject.org/gdeltv2/lastupdate.txt", accept: "text/plain,*/*;q=0.1", parse: parseGdelt, adapter_id: "phase-a-gdelt-v2-lastupdate-v1", independence_group: "GDELT_PROJECT", cadence: 1800 },
  { domain: "macro", category: "MACRO", source_id: "world_bank_indicators", prefix: "MACRO:COVERAGE_FALLBACK:", endpoint: "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&source=2&per_page=400&mrnev=1", accept: "application/json,*/*;q=0.1", parse: parseWorldBank, adapter_id: "phase-a-world-bank-wdi-v2", independence_group: "WORLD_BANK", cadence: 7200 },
  { domain: "rare_earth", category: "CRITICAL_MINERALS", source_id: "usgs_mcs", prefix: "MINERALS:COVERAGE_FALLBACK:", endpoint: "https://www.sciencebase.gov/catalog/item/69837e43b66b01367d7ec7c7?format=json", accept: "application/json,*/*;q=0.1", parse: parseUsgs, adapter_id: "phase-a-usgs-mcs-2026-sciencebase-v1", independence_group: "USGS", cadence: 14400 },
];

function rights(sourceId) {
  const item = COMMERCIAL_SOURCE_RIGHTS_EVIDENCE[sourceId];
  if (!item || item.approved_status !== "VERIFIED") throw new Error(`VERIFIED_RIGHTS_EVIDENCE_REQUIRED:${sourceId}`);
  return item;
}

async function verifyRegistry() {
  const rows = await psql(`select source_id,category,commercial_usage_status,enabled_for_ingestion,country_scope from public.live_external_sources where source_id in (${SOURCES.map((s) => sqlText(s.source_id)).join(",")}) order by source_id`, { json: true });
  const byId = new Map(rows.map((row) => [row.source_id, row]));
  for (const source of SOURCES) {
    const row = byId.get(source.source_id);
    if (!row || row.category !== source.category || row.commercial_usage_status !== "COMMERCIAL_OK" || row.enabled_for_ingestion !== true || row.country_scope !== "GLOBAL") throw new Error(`PHASE_A_SOURCE_REGISTRY_NOT_ELIGIBLE:${source.source_id}`);
    rights(source.source_id);
  }
  return rows;
}

function node(runId, entry, dimension, strength, claim, ref, details) {
  const canonical = JSON.stringify({ runId, source: entry.source.source_id, dimension, strength, claim, ref, observed_at: entry.observation.observed_at, details });
  return { id: `phase-a:${runId}:${entry.source.source_id}:${dimension.toLowerCase()}`, source_id: entry.source.source_id, dimension, strength, claim, ref, hash: sha256(Buffer.from(canonical)), observed_at: entry.observation.observed_at, details };
}

async function promote(runId, observed, evidenceRef) {
  const nodes = [];
  for (const entry of observed) {
    const r = rights(entry.source.source_id);
    const ref = `${evidenceRef}#${entry.source.source_id}`;
    nodes.push(
      node(runId, entry, "REGISTRY", "VERIFIED", "Exact source is enabled on the authoritative production registry.", ref, { source_id: entry.source.source_id, category: entry.source.category }),
      node(runId, entry, "ENDPOINT", "OBSERVED", "Official machine endpoint returned a successful response.", ref, { endpoint_url: entry.source.endpoint, final_url: entry.observation.final_url, http_status: String(entry.observation.status), body_sha256: entry.observation.body_sha256 }),
      node(runId, entry, "RIGHTS", "VERIFIED", "Reviewed commercial rights evidence exists for this exact source contract.", r.terms_url, { rights_status: "COMMERCIAL_OK", licence: r.licence, reviewed_on: r.reviewed_on, boundary: r.boundary }),
      node(runId, entry, "SCHEMA", "OBSERVED", "Observed response passed the source-specific parser contract.", ref, { schema_status: "PASS", adapter_id: entry.source.adapter_id }),
      node(runId, entry, "FRESHNESS", "OBSERVED", "Observed response passed its governed freshness contract.", ref, { freshness_status: entry.parsed.freshness_status, ...entry.parsed }),
      node(runId, entry, "PROVENANCE", "VERIFIED", "Endpoint hash is bound to verified B2 evidence.", ref, { provenance_status: "PASS", body_sha256: entry.observation.body_sha256, b2_evidence_ref: evidenceRef }),
      node(runId, entry, "INDEPENDENCE", "VERIFIED", "Publisher identity is distinct across the three Phase A fallback publishers.", ref, { independence_status: "PASS", independence_group: entry.source.independence_group, independent_source_count: 3 }),
      node(runId, entry, "ADAPTER", "VERIFIED", "Source-specific parser passed against the observed endpoint.", ref, { adapter_status: "TESTED", adapter_id: entry.source.adapter_id }),
      node(runId, entry, "RUNTIME", "OBSERVED", "Fetch, parse, hash and B2 readback completed in this run.", ref, { runtime_status: "PASS", body_sha256: entry.observation.body_sha256 }),
      node(runId, entry, "FALLBACK", "VERIFIED", "Global fallback is explicit and does not claim country-specific publisher provenance.", ref, { fallback_status: "READY", fallback_source_id: "" }),
    );
  }
  const values = nodes.map((n) => `(${sqlText(n.id)},${sqlText(runId)},${sqlText(n.source_id)},${sqlText(n.dimension)},'PASS',${sqlText(n.strength)},${sqlText(n.claim)},${sqlText(n.ref)},${sqlText(n.hash)},${sqlText(n.observed_at)}::timestamptz,'phase-a-runtime-direct-db-b2-v2',${sqlJson(n.details)})`).join(",");
  await psql(`begin;
    insert into public.live_source_certification_evidence_runs(run_id,code_revision,evaluated_at,source_count,node_count,edge_count,write_operations_performed) values(${sqlText(runId)},${sqlText(CODE_REVISION)},now(),3,30,0,false) on conflict(run_id) do nothing;
    insert into public.live_source_certification_evidence_nodes(evidence_id,run_id,source_id,dimension,status,evidence_strength,claim,evidence_ref,evidence_hash,observed_at,method,details) values ${values} on conflict(evidence_id) do nothing;
    select public.promote_source_certification_evidence_graph_run(${sqlText(runId)},${sqlText(ACTOR)});
    commit;`);
  const certs = await psql(`select source_id,certification_state,endpoint_status,rights_status,schema_status,freshness_status,provenance_status,independence_status,adapter_status,runtime_status,fallback_status,certified_at,certification_hash from public.live_source_certification_records where source_id in (${SOURCES.map((s) => sqlText(s.source_id)).join(",")}) order by source_id`, { json: true });
  if (certs.length !== 3 || certs.some((c) => c.certification_state !== "CERTIFIED" || c.endpoint_status !== "PASS" || !["COMMERCIAL_OK","DERIVED_ONLY"].includes(c.rights_status) || !["PASS","NOT_APPLICABLE"].includes(c.schema_status) || !["FRESH","VARIABLE","NOT_APPLICABLE"].includes(c.freshness_status) || !["PASS","NOT_APPLICABLE"].includes(c.provenance_status) || !["PASS","NOT_APPLICABLE"].includes(c.independence_status) || !["TESTED","NOT_APPLICABLE"].includes(c.adapter_status) || !["PASS","NOT_APPLICABLE"].includes(c.runtime_status) || !["READY","NOT_REQUIRED"].includes(c.fallback_status) || !c.certification_hash)) throw new Error(`PHASE_A_SOURCE_CERTIFICATION_INCOMPLETE:${JSON.stringify(certs)}`);
  return certs;
}

async function refreshTargets(observed) {
  const sourceRows = observed.map((entry) => `(${sqlText(entry.source.category)}::text,${sqlText(entry.source.source_id)}::text,${sqlText(entry.source.prefix)}::text,${sqlText(entry.source.endpoint)}::text,${Number(entry.source.cadence)}::integer,${sqlText(entry.observation.observed_at)}::timestamptz)`).join(",");
  await psql(`with source_contract(category,source_id,prefix,target_url,cadence_seconds,observed_at) as (values ${sourceRows})
    insert into public.live_raw_source_targets(target_id,country_iso3,category,transport,source_id,target_url,display_name,enabled,raw_storage_allowed,commercial_promotion_allowed,cadence_seconds,priority,discovery_state,last_attempt_at,last_success_at,last_observed_at,consecutive_failures,last_error,created_at,updated_at)
    select s.prefix || r.iso3,r.iso3,s.category,'GLOBAL_FALLBACK',s.source_id,s.target_url,s.source_id || ' global fallback - ' || r.country_name,true,true,false,s.cadence_seconds,1,'REACHABLE',s.observed_at,s.observed_at,s.observed_at,0,null,now(),now()
    from public.live_country_registry r cross join source_contract s where r.enabled=true
    on conflict(target_id) do update set country_iso3=excluded.country_iso3,category=excluded.category,transport='GLOBAL_FALLBACK',source_id=excluded.source_id,target_url=excluded.target_url,display_name=excluded.display_name,enabled=true,raw_storage_allowed=true,commercial_promotion_allowed=false,cadence_seconds=excluded.cadence_seconds,priority=1,discovery_state='REACHABLE',last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,last_observed_at=excluded.last_observed_at,consecutive_failures=0,last_error=null,updated_at=now();`);
  const count = await psql(`select count(*) from public.live_raw_source_targets t join public.live_country_registry r on r.iso3=t.country_iso3 and r.enabled=true where t.enabled=true and ((t.category='GEOPOLITICS' and t.source_id='gdelt_v2_events' and t.transport='GLOBAL_FALLBACK') or (t.category='MACRO' and t.source_id='world_bank_indicators' and t.transport='GLOBAL_FALLBACK') or (t.category='CRITICAL_MINERALS' and t.source_id='usgs_mcs' and t.transport='GLOBAL_FALLBACK'))`);
  return Number(count);
}

async function main() {
  assertConfig();
  await execFileAsync("psql", ["--version"]);
  const registrySources = await verifyRegistry();
  const countries = await psql(`select iso3 from public.live_country_registry where enabled=true order by iso3`, { json: true });
  if (!countries.length || new Set(countries.map((x) => x.iso3)).size !== countries.length) throw new Error("ENABLED_COUNTRY_REGISTRY_INVALID");

  const observed = [];
  for (const source of SOURCES) {
    const observation = await fetchObserved(source.endpoint, source.accept);
    observed.push({ source, observation, parsed: source.parse(observation) });
  }

  const b2 = createB2Client({ endpointUrl: B2_ENDPOINT, accessKey: B2_KEY_ID, secretKey: B2_APPLICATION_KEY, bucket: B2_BUCKET });
  const runId = `phase-a-runtime-${new Date().toISOString().replace(/[:.]/g,"-")}-${CODE_REVISION.slice(0,12)}`;
  const payload = Buffer.from(JSON.stringify({ schema: "geomacro.phase-a-runtime-evidence.v2", run_id: runId, code_revision: CODE_REVISION, source_project: PROJECT, registry_country_count: countries.length, sources: observed.map((e) => ({ domain: e.source.domain, source_id: e.source.source_id, endpoint: e.source.endpoint, observed_at: e.observation.observed_at, http_status: e.observation.status, body_sha256: e.observation.body_sha256, parsed: e.parsed })) }));
  const key = `geomacro-evidence/v1/phase-a-runtime/${runId}/runtime-evidence.json`;
  await b2.put(key, payload);
  const readback = await b2.get(key);
  if (readback.length !== payload.length || sha256(readback) !== sha256(payload)) throw new Error("PHASE_A_B2_EVIDENCE_READBACK_MISMATCH");
  const evidenceRef = `b2://${B2_BUCKET}/${key}#sha256=${sha256(payload)}`;

  const certifications = await promote(runId, observed, evidenceRef);
  const targetRowsWritten = await refreshTargets(observed);
  const status = (await psql(`select * from public.live_country_category_coverage_matrix_status`, { json: true }))[0];
  const domains = await psql(`select domain,count(*)::bigint rows,count(*) filter(where production_ready)::bigint ready_rows from public.live_country_category_coverage_matrix group by domain order by domain`, { json: true });
  const expected = countries.length * 3;
  if (!status || status.matrix_contract_complete !== true || Number(status.expected_matrix_rows) !== expected || Number(status.actual_matrix_rows) !== expected || Number(status.production_ready_rows) !== expected || Number(status.unavailable_rows) !== 0 || Number(status.nonready_rows_missing_reason) !== 0 || Number(status.invalid_ready_rows) !== 0 || Number(status.invalid_fallback_rows) !== 0 || Number(status.duplicate_matrix_rows) !== 0 || targetRowsWritten !== expected) throw new Error(`PHASE_A_RUNTIME_NOT_FULLY_READY:${JSON.stringify({ status, domains, targetRowsWritten, expected })}`);

  console.log(JSON.stringify({ ok: true, run_id: runId, code_revision: CODE_REVISION, registry_country_count: countries.length, expected_matrix_rows: expected, target_rows_written: targetRowsWritten, b2_evidence_key: key, b2_evidence_sha256: sha256(payload), b2_requests: b2.usage(), registry_sources: registrySources, certifications, status, domains, payment_or_settlement_enabled: false }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exit(1); });
