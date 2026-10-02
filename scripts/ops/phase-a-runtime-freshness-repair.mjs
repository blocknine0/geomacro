#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createB2Client } from "./b2-s3-client.mjs";
import { COMMERCIAL_SOURCE_RIGHTS_EVIDENCE } from "../commercial-source-rights-evidence.mjs";

const execFileAsync = promisify(execFile);
const PROJECT = "ldpwajisioljyjtojvfx";
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const DB_URL = String(process.env.SUPABASE_DB_URL ?? "").trim();
const PROJECT_ID = String(process.env.SUPABASE_PROJECT_ID ?? PROJECT).trim();
const B2_KEY_ID = String(process.env.B2_KEY_ID ?? "").trim();
const B2_APPLICATION_KEY = String(process.env.B2_APPLICATION_KEY ?? "").trim();
const CODE_REVISION = String(process.env.GITHUB_SHA ?? process.env.CODE_REVISION ?? "local").trim();
const ACTOR = String(process.env.GITHUB_ACTOR ?? "geomacro-phase-a-runtime-repair").trim();
const HTTP_TIMEOUT_MS = Math.max(5000, Math.min(60000, Number(process.env.PHASE_A_SOURCE_TIMEOUT_MS ?? 25000)));
const HTTP_ATTEMPTS = Math.max(1, Math.min(4, Number(process.env.PHASE_A_SOURCE_ATTEMPTS ?? 3)));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assertConfig() {
  if (!DB_URL) throw new Error("SUPABASE_DB_URL_REQUIRED");
  if (PROJECT_ID !== PROJECT) throw new Error(`NON_AUTHORITATIVE_SUPABASE_PROJECT:${PROJECT_ID}`);
  const u = new URL(DB_URL);
  if (!["postgres:", "postgresql:"].includes(u.protocol) || !u.password) throw new Error("INVALID_SUPABASE_DB_URL");
  if (!(u.hostname === `db.${PROJECT}.supabase.co` || u.hostname.endsWith(".pooler.supabase.com"))) {
    throw new Error(`NON_AUTHORITATIVE_SUPABASE_DB_HOST:${u.hostname}`);
  }
  if (!B2_KEY_ID || !B2_APPLICATION_KEY) throw new Error("B2_RUNTIME_EVIDENCE_CREDENTIALS_REQUIRED");
}

async function psql(sql, { json = false } = {}) {
  const args = [DB_URL, "-X", "-v", "ON_ERROR_STOP=1", "-At"];
  if (json) args.push("-c", `select coalesce(json_agg(x),'[]'::json)::text from (${sql}) x`);
  else args.push("-c", sql);
  const { stdout, stderr } = await execFileAsync("psql", args, {
    env: { ...process.env, PGSSLMODE: "require" },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (stderr?.trim()) console.error(stderr.trim());
  return json ? JSON.parse(stdout.trim() || "[]") : stdout.trim();
}

function sqlText(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}
function sqlJson(value) {
  return `${sqlText(JSON.stringify(value))}::jsonb`;
}

async function fetchObserved(url, accept = "*/*") {
  let lastError = null;
  for (let attempt = 1; attempt <= HTTP_ATTEMPTS; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "user-agent": "Geomacro-Phase-A-Runtime/1.0 (+https://geomacro.live)", accept },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return {
        requested_url: url,
        final_url: response.url || url,
        status: response.status,
        content_type: response.headers.get("content-type") ?? "",
        etag: response.headers.get("etag"),
        last_modified: response.headers.get("last-modified"),
        observed_at: new Date().toISOString(),
        latency_ms: Date.now() - started,
        bytes,
        body_sha256: sha256(bytes),
      };
    } catch (error) {
      lastError = error;
      if (attempt < HTTP_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`SOURCE_PROBE_FAILED:${url}:${String(lastError?.message ?? lastError)}`);
}

function parseGdelt(observation) {
  const text = observation.bytes.toString("utf8").trim();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const first = lines[0] ?? "";
  const url = first.split(/\s+/).at(-1) ?? "";
  const match = url.match(/\/(\d{14})\.export\.CSV\.zip$/i);
  if (!match) throw new Error("GDELT_LASTUPDATE_CONTRACT_INVALID");
  const stamp = match[1];
  const iso = `${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}T${stamp.slice(8,10)}:${stamp.slice(10,12)}:${stamp.slice(12,14)}Z`;
  const ageSeconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(ageSeconds) || ageSeconds > 7200) throw new Error(`GDELT_LASTUPDATE_STALE:${Math.round(ageSeconds)}`);
  return { schema_status: "PASS", freshness_status: "FRESH", latest_release_at: iso, age_seconds: Math.round(ageSeconds), release_url: url };
}

function parseWorldBank(observation) {
  const parsed = JSON.parse(observation.bytes.toString("utf8"));
  if (!Array.isArray(parsed) || parsed.length < 2 || !Array.isArray(parsed[1])) throw new Error("WORLD_BANK_JSON_CONTRACT_INVALID");
  const rows = parsed[1];
  const countries = new Set(rows.map((row) => String(row?.countryiso3code ?? "")).filter((v) => /^[A-Z]{3}$/.test(v)));
  if (countries.size < 180) throw new Error(`WORLD_BANK_COUNTRY_COVERAGE_TOO_LOW:${countries.size}`);
  return { schema_status: "PASS", freshness_status: "VARIABLE", observed_country_count: countries.size, api_page_count: Number(parsed[0]?.pages ?? 0), source_id: Number(parsed[0]?.sourceid ?? 2) };
}

function parseUsgs(observation) {
  const parsed = JSON.parse(observation.bytes.toString("utf8"));
  const title = String(parsed?.title ?? parsed?.name ?? "");
  const text = JSON.stringify(parsed);
  if (!/Mineral Commodity Summaries 2026/i.test(`${title} ${text}`)) throw new Error("USGS_MCS_2026_CONTRACT_INVALID");
  return { schema_status: "PASS", freshness_status: "VARIABLE", release_family: "Mineral Commodity Summaries 2026", sciencebase_item: "69837e43b66b01367d7ec7c7" };
}

const SOURCE_CONTRACTS = [
  {
    domain: "geopolitics",
    source_category: "GEOPOLITICS",
    source_id: "gdelt_v2_events",
    target_prefix: "GEO:COVERAGE_FALLBACK:",
    endpoint: "https://data.gdeltproject.org/gdeltv2/lastupdate.txt",
    accept: "text/plain,*/*;q=0.1",
    parser: parseGdelt,
    adapter_id: "phase-a-gdelt-v2-lastupdate-v1",
    independence_group: "GDELT_PROJECT",
    cadence_seconds: 1800,
  },
  {
    domain: "macro",
    source_category: "MACRO",
    source_id: "world_bank_indicators",
    target_prefix: "MACRO:COVERAGE_FALLBACK:",
    endpoint: "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&source=2&per_page=400&mrnev=1",
    accept: "application/json,*/*;q=0.1",
    parser: parseWorldBank,
    adapter_id: "phase-a-world-bank-wdi-v2",
    independence_group: "WORLD_BANK",
    cadence_seconds: 7200,
  },
  {
    domain: "rare_earth",
    source_category: "CRITICAL_MINERALS",
    source_id: "usgs_mcs",
    target_prefix: "MINERALS:COVERAGE_FALLBACK:",
    endpoint: "https://www.sciencebase.gov/catalog/item/69837e43b66b01367d7ec7c7?format=json",
    accept: "application/json,*/*;q=0.1",
    parser: parseUsgs,
    adapter_id: "phase-a-usgs-mcs-2026-sciencebase-v1",
    independence_group: "USGS",
    cadence_seconds: 14400,
  },
];

function rightsDetails(sourceId) {
  const evidence = COMMERCIAL_SOURCE_RIGHTS_EVIDENCE[sourceId];
  if (!evidence || evidence.approved_status !== "VERIFIED") throw new Error(`VERIFIED_RIGHTS_EVIDENCE_REQUIRED:${sourceId}`);
  return evidence;
}

async function verifyRegistrySources() {
  const ids = SOURCE_CONTRACTS.map((source) => sqlText(source.source_id)).join(",");
  const rows = await psql(`
    select source_id,category,base_url,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,country_scope,freshness_class
    from public.live_external_sources
    where source_id in (${ids})
    order by source_id
  `, { json: true });
  if (rows.length !== SOURCE_CONTRACTS.length) throw new Error(`PHASE_A_SOURCE_REGISTRY_INCOMPLETE:${rows.length}`);
  const byId = new Map(rows.map((row) => [row.source_id, row]));
  for (const contract of SOURCE_CONTRACTS) {
    const row = byId.get(contract.source_id);
    if (!row || row.category !== contract.source_category || row.commercial_usage_status !== "COMMERCIAL_OK" || row.enabled_for_ingestion !== true || row.country_scope !== "GLOBAL") {
      throw new Error(`PHASE_A_SOURCE_REGISTRY_NOT_ELIGIBLE:${contract.source_id}`);
    }
    rightsDetails(contract.source_id);
  }
  return rows;
}

function evidenceNode({ runId, source, dimension, status = "PASS", strength = "OBSERVED", claim, evidenceRef, details }) {
  const observedAt = source.observation.observed_at;
  const canonical = JSON.stringify({ run_id: runId, source_id: source.contract.source_id, dimension, status, strength, claim, evidence_ref: evidenceRef, observed_at: observedAt, details });
  return {
    evidence_id: `phase-a:${runId}:${source.contract.source_id}:${dimension.toLowerCase()}`,
    run_id: runId,
    source_id: source.contract.source_id,
    dimension,
    status,
    evidence_strength: strength,
    claim,
    evidence_ref: evidenceRef,
    evidence_hash: sha256(Buffer.from(canonical)),
    observed_at: observedAt,
    method: "phase-a-runtime-direct-db-b2-v1",
    details,
  };
}

async function certifySources(runId, sourceEvidence, b2EvidenceRef) {
  const nodeRows = [];
  for (const source of sourceEvidence) {
    const rights = rightsDetails(source.contract.source_id);
    const commonRef = `${b2EvidenceRef}#${source.contract.source_id}`;
    const endpointDetails = { endpoint_url: source.contract.endpoint, final_url: source.observation.final_url, http_status: String(source.observation.status), body_sha256: source.observation.body_sha256, latency_ms: source.observation.latency_ms };
    const rightsStatus = rights.approved_status === "VERIFIED" ? "COMMERCIAL_OK" : "DERIVED_ONLY";
    nodeRows.push(
      evidenceNode({ runId, source, dimension: "REGISTRY", strength: "VERIFIED", claim: "Source is registered on the authoritative production registry and enabled for ingestion.", evidenceRef: commonRef, details: { source_id: source.contract.source_id, category: source.contract.source_category } }),
      evidenceNode({ runId, source, dimension: "ENDPOINT", claim: "Exact official machine endpoint returned a successful observed response.", evidenceRef: commonRef, details: endpointDetails }),
      evidenceNode({ runId, source, dimension: "RIGHTS", strength: "VERIFIED", claim: "Reviewed commercial rights evidence exists for the exact source contract.", evidenceRef: rights.terms_url, details: { rights_status: rightsStatus, licence: rights.licence, reviewed_on: rights.reviewed_on, customer_delivery_mode: rights.customer_delivery_mode, boundary: rights.boundary } }),
      evidenceNode({ runId, source, dimension: "SCHEMA", claim: "Observed response satisfied the source-specific parser contract.", evidenceRef: commonRef, details: { schema_status: source.parsed.schema_status, adapter_id: source.contract.adapter_id } }),
      evidenceNode({ runId, source, dimension: "FRESHNESS", claim: "The source-specific observed response satisfied its governed freshness contract.", evidenceRef: commonRef, details: { freshness_status: source.parsed.freshness_status, observed_at: source.observation.observed_at, ...source.parsed } }),
      evidenceNode({ runId, source, dimension: "PROVENANCE", strength: "VERIFIED", claim: "Evidence is bound to the exact official endpoint response hash and verified B2 evidence manifest.", evidenceRef: commonRef, details: { provenance_status: "PASS", body_sha256: source.observation.body_sha256, b2_evidence_ref: b2EvidenceRef } }),
      evidenceNode({ runId, source, dimension: "INDEPENDENCE", strength: "VERIFIED", claim: "Source publisher identity is explicit and independently scoped from the other Phase A fallback publishers.", evidenceRef: commonRef, details: { independence_status: "PASS", independence_group: source.contract.independence_group, independent_source_count: 3 } }),
      evidenceNode({ runId, source, dimension: "ADAPTER", strength: "VERIFIED", claim: "Source-specific parser executed successfully against the observed production endpoint contract.", evidenceRef: commonRef, details: { adapter_status: "TESTED", adapter_id: source.contract.adapter_id } }),
      evidenceNode({ runId, source, dimension: "RUNTIME", claim: "Runtime fetch, parse, hashing and B2 readback all completed successfully in this production repair run.", evidenceRef: commonRef, details: { runtime_status: "PASS", body_sha256: source.observation.body_sha256 } }),
      evidenceNode({ runId, source, dimension: "FALLBACK", strength: "VERIFIED", claim: "This global fallback is an explicit Phase A availability path and does not imply country-specific publisher provenance.", evidenceRef: commonRef, details: { fallback_status: "READY", fallback_source_id: "" } }),
    );
  }

  const runInsert = `insert into public.live_source_certification_evidence_runs(run_id,code_revision,evaluated_at,source_count,node_count,edge_count,write_operations_performed)
    values(${sqlText(runId)},${sqlText(CODE_REVISION)},now(),${sourceEvidence.length},${nodeRows.length},0,false)
    on conflict(run_id) do nothing;`;
  const nodesSql = nodeRows.map((n) => `(${[
    sqlText(n.evidence_id), sqlText(n.run_id), sqlText(n.source_id), sqlText(n.dimension), sqlText(n.status), sqlText(n.evidence_strength), sqlText(n.claim), sqlText(n.evidence_ref), sqlText(n.evidence_hash), sqlText(n.observed_at), sqlText(n.method), sqlJson(n.details),
  ].join(",")})`).join(",\n");
  await psql(`begin; ${runInsert}
    insert into public.live_source_certification_evidence_nodes(evidence_id,run_id,source_id,dimension,status,evidence_strength,claim,evidence_ref,evidence_hash,observed_at,method,details)
    values ${nodesSql}
    on conflict(evidence_id) do nothing;
    select public.promote_source_certification_evidence_graph_run(${sqlText(runId)},${sqlText(ACTOR)});
    commit;`);

  const certs = await psql(`select source_id,certification_state,endpoint_status,rights_status,schema_status,freshness_status,provenance_status,independence_status,adapter_status,runtime_status,fallback_status,certified_at,certification_hash from public.live_source_certification_records where source_id in (${SOURCE_CONTRACTS.map((x) => sqlText(x.source_id)).join(",")}) order by source_id`, { json: true });
  if (certs.length !== 3 || certs.some((c) => c.certification_state !== "CERTIFIED" || c.endpoint_status !== "PASS" || !["COMMERCIAL_OK","DERIVED_ONLY"].includes(c.rights_status) || !["PASS","NOT_APPLICABLE"].includes(c.schema_status) || !["FRESH","VARIABLE","NOT_APPLICABLE"].includes(c.freshness_status) || !["PASS","NOT_APPLICABLE"].includes(c.provenance_status) || !["PASS","NOT_APPLICABLE"].includes(c.independence_status) || !["TESTED","NOT_APPLICABLE"].includes(c.adapter_status) || !["PASS","NOT_APPLICABLE"].includes(c.runtime_status) || !["READY","NOT_REQUIRED"].includes(c.fallback_status) || !c.certification_hash)) {
    throw new Error(`PHASE_A_SOURCE_CERTIFICATION_INCOMPLETE:${JSON.stringify(certs)}`);
  }
  return certs;
}

async function upsertFallbackTargets(countries, sourceEvidence) {
  const observedBySource = new Map(sourceEvidence.map((entry) => [entry.contract.source_id, entry.observation.observed_at]));
  const rows = [];
  for (const country of countries) {
    for (const source of SOURCE_CONTRACTS) {
      rows.push({
        target_id: `${source.target_prefix}${country.iso3}`,
        country_iso3: country.iso3,
        category: source.source_category,
        transport: "GLOBAL_FALLBACK",
        source_id: source.source_id,
        target_url: source.endpoint,
        display_name: `${source.source_id} global fallback - ${country.country_name}`,
        cadence_seconds: source.cadence_seconds,
        last_success_at: observedBySource.get(source.source_id),
      });
    }
  }
  const values = rows.map((row) => `(${sqlText(row.target_id)},${sqlText(row.country_iso3)},${sqlText(row.category)},'GLOBAL_FALLBACK',${sqlText(row.source_id)},${sqlText(row.target_url)},${sqlText(row.display_name)},true,true,false,${row.cadence_seconds},1,'REACHABLE',${sqlText(row.last_success_at)}::timestamptz,${sqlText(row.last_success_at)}::timestamptz,0,null,now(),now())`).join(",\n");
  await psql(`insert into public.live_raw_source_targets(target_id,country_iso3,category,transport,source_id,target_url,display_name,enabled,raw_storage_allowed,commercial_promotion_allowed,cadence_seconds,priority,discovery_state,last_success_at,last_observed_at,consecutive_failures,last_error,created_at,updated_at)
    values ${values}
    on conflict(target_id) do update set country_iso3=excluded.country_iso3,category=excluded.category,transport=excluded.transport,source_id=excluded.source_id,target_url=excluded.target_url,display_name=excluded.display_name,enabled=true,raw_storage_allowed=true,commercial_promotion_allowed=false,cadence_seconds=excluded.cadence_seconds,priority=1,discovery_state='REACHABLE',last_attempt_at=excluded.last_success_at,last_success_at=excluded.last_success_at,last_observed_at=excluded.last_observed_at,consecutive_failures=0,last_error=null,updated_at=now();`);
  return rows.length;
}

async function main() {
  assertConfig();
  await execFileAsync("psql", ["--version"]);
  const registrySources = await verifyRegistrySources();
  const countries = await psql(`select iso3,iso2,country_name from public.live_country_registry where enabled=true order by iso3`, { json: true });
  if (!countries.length || new Set(countries.map((c) => c.iso3)).size !== countries.length) throw new Error("ENABLED_COUNTRY_REGISTRY_INVALID");

  const sourceEvidence = [];
  for (const contract of SOURCE_CONTRACTS) {
    const observation = await fetchObserved(contract.endpoint, contract.accept);
    const parsed = contract.parser(observation);
    sourceEvidence.push({ contract, observation, parsed });
  }

  const b2 = createB2Client({ endpointUrl: B2_ENDPOINT, accessKey: B2_KEY_ID, secretKey: B2_APPLICATION_KEY, bucket: B2_BUCKET });
  const runId = `phase-a-runtime-${new Date().toISOString().replace(/[:.]/g,"-")}-${CODE_REVISION.slice(0,12)}`;
  const evidencePayload = Buffer.from(JSON.stringify({
    schema: "geomacro.phase-a-runtime-evidence.v1",
    run_id: runId,
    code_revision: CODE_REVISION,
    source_project: PROJECT,
    observed_at: new Date().toISOString(),
    registry_country_count: countries.length,
    sources: sourceEvidence.map(({ contract, observation, parsed }) => ({
      domain: contract.domain,
      source_category: contract.source_category,
      source_id: contract.source_id,
      endpoint: contract.endpoint,
      http_status: observation.status,
      content_type: observation.content_type,
      final_url: observation.final_url,
      observed_at: observation.observed_at,
      latency_ms: observation.latency_ms,
      body_sha256: observation.body_sha256,
      parsed,
    })),
  }));
  const key = `geomacro-evidence/v1/phase-a-runtime/${runId}/runtime-evidence.json`;
  await b2.put(key, evidencePayload);
  const readback = await b2.get(key);
  if (readback.length !== evidencePayload.length || sha256(readback) !== sha256(evidencePayload)) throw new Error("PHASE_A_B2_EVIDENCE_READBACK_MISMATCH");
  const b2EvidenceRef = `b2://${B2_BUCKET}/${key}#sha256=${sha256(evidencePayload)}`;

  const certifications = await certifySources(runId, sourceEvidence, b2EvidenceRef);
  const targetRowsWritten = await upsertFallbackTargets(countries, sourceEvidence);

  const status = (await psql(`select * from public.live_country_category_coverage_matrix_status`, { json: true }))[0];
  const domains = await psql(`select domain,count(*)::bigint as rows,count(*) filter(where production_ready)::bigint as ready_rows,count(*) filter(where realtime_fallback_eligible)::bigint as fallback_rows from public.live_country_category_coverage_matrix group by domain order by domain`, { json: true });
  const stateCounts = await psql(`select availability_state,count(*)::bigint as rows from public.live_country_category_coverage_matrix group by availability_state order by availability_state`, { json: true });
  const expected = countries.length * 3;
  if (!status || status.matrix_contract_complete !== true || Number(status.expected_matrix_rows) !== expected || Number(status.actual_matrix_rows) !== expected || Number(status.production_ready_rows) !== expected || Number(status.unavailable_rows) !== 0 || Number(status.invalid_ready_rows) !== 0 || Number(status.invalid_fallback_rows) !== 0 || Number(status.duplicate_matrix_rows) !== 0 || Number(status.nonready_rows_missing_reason) !== 0) {
    throw new Error(`PHASE_A_RUNTIME_NOT_FULLY_READY:${JSON.stringify({ status, domains, stateCounts })}`);
  }

  console.log(JSON.stringify({
    ok: true,
    run_id: runId,
    code_revision: CODE_REVISION,
    registry_country_count: countries.length,
    expected_matrix_rows: expected,
    target_rows_written: targetRowsWritten,
    b2_evidence_key: key,
    b2_evidence_sha256: sha256(evidencePayload),
    b2_requests: b2.usage(),
    registry_sources: registrySources,
    certifications,
    status,
    domains,
    availability_states: stateCounts,
    payment_or_settlement_enabled: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
