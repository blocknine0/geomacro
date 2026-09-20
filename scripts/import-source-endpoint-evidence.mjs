#!/usr/bin/env node
/**
 * Persist endpoint disposition evidence into the permanent endpoint ledger.
 *
 * This importer intentionally has zero npm-package dependencies. It uses the
 * Supabase REST API with the production service-role key so CI cannot fail
 * because an optional SDK is absent.
 *
 * It never promotes rights, schema, freshness, provenance, independence,
 * adapter, runtime or certification state.
 */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { readEndpointManifestLock } from "./source-endpoint-manifest.mjs";

const input = process.argv[2] ?? "artifacts/source-endpoint-disposition-933/results.json";
const supabaseUrl = process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRole = process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const expectedProject = process.env.EXPECTED_SUPABASE_PROJECT_REF;
const strict = process.env.STRICT_ENDPOINT_COUNT === "true";
const BATCH_SIZE = 100;
const UPDATE_CONCURRENCY = 20;

if (!supabaseUrl || !serviceRole) {
  throw new Error("APP_SUPABASE_URL/SUPABASE_URL and service-role key are required");
}
if (!expectedProject) {
  throw new Error("EXPECTED_SUPABASE_PROJECT_REF is required");
}

const api = new URL(supabaseUrl);
if (api.hostname !== `${expectedProject}.supabase.co`) {
  throw new Error("APP_SUPABASE_URL is not the authoritative Supabase API");
}

const restBase = new URL("/rest/v1/", api).toString();
const headers = {
  apikey: serviceRole,
  Authorization: `Bearer ${serviceRole}`,
  "Content-Type": "application/json",
};

async function rest(path, init = {}) {
  const response = await fetch(new URL(path, restBase), {
    ...init,
    headers: {
      ...headers,
      ...(init.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase REST ${response.status} ${response.statusText}: ${body.slice(0, 2000)}`);
  }
  return body ? JSON.parse(body) : null;
}

const localLock = await readEndpointManifestLock();
const results = JSON.parse(await fs.readFile(input, "utf8"));
if (!Array.isArray(results) || results.length === 0) {
  throw new Error("Endpoint probe results must be a non-empty array");
}

const manifestHashes = new Set(
  results.map((result) => String(result.manifest_sha256 ?? "").trim()),
);
if (manifestHashes.size !== 1 || !manifestHashes.has(localLock.manifest_sha256)) {
  throw new Error("Endpoint evidence manifest hash does not match the locked repository manifest.");
}

const dbLock = await rest(
  "live_source_endpoint_manifest_lock?select=endpoint_count,manifest_sha256,manifest_version&lock_id=eq.phase-b-933-v1&limit=1",
);
if (
  !Array.isArray(dbLock) ||
  dbLock.length !== 1 ||
  Number(dbLock[0].endpoint_count) !== Number(localLock.endpoint_count) ||
  String(dbLock[0].manifest_sha256) !== localLock.manifest_sha256 ||
  String(dbLock[0].manifest_version) !== String(localLock.schema_version)
) {
  throw new Error("Production endpoint manifest lock does not match the repository manifest.");
}

const sources = await rest(
  "live_source_certification_records?select=source_id,endpoint_url,canonical_url&limit=5000",
);

const byUrl = new Map();
for (const source of sources ?? []) {
  for (const url of [source.endpoint_url, source.canonical_url].filter(Boolean)) {
    const normalized = new URL(String(url)).toString();
    if (!byUrl.has(normalized)) byUrl.set(normalized, source);
  }
}

const outcome = {
  evaluated_at: new Date().toISOString(),
  authoritative_project_ref: expectedProject,
  manifest_sha256: localLock.manifest_sha256,
  probe_rows: results.length,
  ledger_rows_upserted: 0,
  certification_records_updated: 0,
  unmatched_source_records: 0,
  unclassified_rows: 0,
  write_operations_performed: true,
};

const ledgerRows = results.map((result) => {
  const endpointUrl = new URL(String(result.endpoint_url)).toString();
  const endpointKey = createHash("sha256").update(endpointUrl, "utf8").digest("hex");
  if (endpointKey !== String(result.endpoint_key)) {
    throw new Error(`Endpoint key mismatch for ${endpointUrl}`);
  }

  const disposition = String(result.disposition ?? "UNCLASSIFIED");
  if (disposition === "UNCLASSIFIED") outcome.unclassified_rows += 1;

  const source = byUrl.get(endpointUrl);
  return {
    endpoint_url: endpointUrl,
    endpoint_key: endpointKey,
    manifest_sha256: localLock.manifest_sha256,
    first_seen_file: result.first_seen_file ?? null,
    first_seen_line: typeof result.first_seen_line === "number" ? Math.trunc(result.first_seen_line) : null,
    probe_method: result.method ?? null,
    endpoint_disposition: disposition,
    endpoint_disposition_reason: String(
      result.disposition_reason ?? "No disposition reason supplied.",
    ),
    http_status: typeof result.status === "number" ? result.status : null,
    final_url: result.final_url ?? null,
    content_type: result.content_type ?? result.get_content_type ?? null,
    latency_ms: typeof result.latency_ms === "number" ? Math.trunc(result.latency_ms) : null,
    error_text: result.error ?? result.get_error ?? null,
    observed_at: outcome.evaluated_at,
    matched_source_id: source?.source_id ?? null,
    updated_at: outcome.evaluated_at,
  };
});

const sourceUpdates = [];
for (const result of results) {
  const endpointUrl = new URL(String(result.endpoint_url)).toString();
  const source = byUrl.get(endpointUrl);
  if (!source) {
    outcome.unmatched_source_records += 1;
    continue;
  }

  const disposition = String(result.disposition ?? "UNCLASSIFIED");
  const endpointStatus =
    disposition === "WORKING" || disposition === "CANONICAL_REDIRECT"
      ? "PASS"
      : disposition === "MISSING_ENDPOINT"
        ? "WRONG_ENDPOINT"
        : disposition;

  sourceUpdates.push({
    source_id: source.source_id,
    endpoint_status: endpointStatus,
    endpoint_disposition: disposition,
    endpoint_disposition_reason: String(
      result.disposition_reason ?? "No disposition reason supplied.",
    ),
    endpoint_disposition_observed_at: outcome.evaluated_at,
    endpoint_url: source.endpoint_url ?? endpointUrl,
    canonical_url:
      endpointStatus === "PASS"
        ? String(result.final_url ?? endpointUrl)
        : source.canonical_url ?? null,
    endpoint_http_status: typeof result.status === "number" ? result.status : null,
    endpoint_final_url: result.final_url ?? null,
    endpoint_content_type: result.content_type ?? result.get_content_type ?? null,
    endpoint_latency_ms:
      typeof result.latency_ms === "number" ? Math.trunc(result.latency_ms) : null,
    endpoint_error: result.error ?? result.get_error ?? null,
    endpoint_observed_at: outcome.evaluated_at,
    updated_at: outcome.evaluated_at,
  });
}

for (let index = 0; index < ledgerRows.length; index += BATCH_SIZE) {
  const batch = ledgerRows.slice(index, index + BATCH_SIZE);
  await rest(
    `live_source_endpoint_disposition_ledger?on_conflict=manifest_sha256%2Cendpoint_url`,
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    },
  );
  outcome.ledger_rows_upserted += batch.length;
}

let updateCursor = 0;
async function updateWorker() {
  while (true) {
    const index = updateCursor++;
    if (index >= sourceUpdates.length) return;
    const row = sourceUpdates[index];
    await rest(
      `live_source_certification_records?source_id=eq.${encodeURIComponent(row.source_id)}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          endpoint_status: row.endpoint_status,
          endpoint_disposition: row.endpoint_disposition,
          endpoint_disposition_reason: row.endpoint_disposition_reason,
          endpoint_disposition_observed_at: row.endpoint_disposition_observed_at,
          endpoint_url: row.endpoint_url,
          canonical_url: row.canonical_url,
          endpoint_http_status: row.endpoint_http_status,
          endpoint_final_url: row.endpoint_final_url,
          endpoint_content_type: row.endpoint_content_type,
          endpoint_latency_ms: row.endpoint_latency_ms,
          endpoint_error: row.endpoint_error,
          endpoint_observed_at: row.endpoint_observed_at,
          updated_at: row.updated_at,
        }),
      },
    );
    outcome.certification_records_updated += 1;
  }
}

await Promise.all(
  Array.from(
    { length: Math.min(UPDATE_CONCURRENCY, sourceUpdates.length) },
    updateWorker,
  ),
);

if (strict) {
  if (results.length !== Number(localLock.endpoint_count)) {
    throw new Error(
      `Strict Phase B result count mismatch: expected ${localLock.endpoint_count}, got ${results.length}`,
    );
  }
  if (outcome.ledger_rows_upserted !== Number(localLock.endpoint_count)) {
    throw new Error(
      `Strict Phase B ledger count mismatch: expected ${localLock.endpoint_count}, got ${outcome.ledger_rows_upserted}`,
    );
  }
  if (outcome.unclassified_rows !== 0) {
    throw new Error(
      `Strict Phase B importer found ${outcome.unclassified_rows} unclassified endpoints`,
    );
  }
}

console.log(JSON.stringify(outcome, null, 2));
