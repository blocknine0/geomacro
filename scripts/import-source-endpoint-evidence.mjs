#!/usr/bin/env node
/**
 * Persist endpoint disposition evidence into the permanent endpoint ledger.
 *
 * This importer may update only endpoint-related fields in the optional
 * source certification record. It never promotes rights, schema, freshness,
 * provenance, independence, adapter, runtime, or certification state.
 */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const input = process.argv[2] ?? "artifacts/source-endpoint-disposition-933/results.json";
const supabaseUrl = process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRole = process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const expectedProject = process.env.EXPECTED_SUPABASE_PROJECT_REF;
const expectedCount = Number(process.env.EXPECTED_ENDPOINT_COUNT ?? "933");
const strict = process.env.STRICT_ENDPOINT_COUNT === "true";

if (!supabaseUrl || !serviceRole) {
  throw new Error("APP_SUPABASE_URL/SUPABASE_URL and service-role key are required");
}
if (!expectedProject) {
  throw new Error("EXPECTED_SUPABASE_PROJECT_REF is required");
}

const apiUrl = new URL(supabaseUrl);
if (apiUrl.hostname !== `${expectedProject}.supabase.co`) {
  throw new Error("APP_SUPABASE_URL is not the authoritative Supabase API");
}

const results = JSON.parse(await fs.readFile(input, "utf8"));
if (!Array.isArray(results)) throw new Error("Endpoint probe results must be an array");

const manifestHashes = new Set(results.map((result) => String(result.endpoint_key ?? "").trim()));
if (manifestHashes.size !== results.length) {
  throw new Error("Endpoint evidence contains duplicate or missing endpoint keys.");
}

const db = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: sources, error: sourceError } = await db
  .from("live_source_certification_records")
  .select("source_id,endpoint_url,canonical_url");
if (sourceError) throw sourceError;

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
  manifest_sha256: results[0]?.manifest_sha256 ?? null,
  probe_rows: results.length,
  ledger_rows_upserted: 0,
  certification_records_updated: 0,
  unmatched_source_records: 0,
  unclassified_rows: 0,
  write_operations_performed: true,
};

for (const result of results) {
  const endpointUrl = new URL(String(result.endpoint_url)).toString();
  const endpointKey = createHash("sha256").update(endpointUrl, "utf8").digest("hex");
  if (endpointKey !== String(result.endpoint_key)) {
    throw new Error(`Endpoint key mismatch for ${endpointUrl}`);
  }

  const disposition = String(result.disposition ?? "UNCLASSIFIED");
  if (disposition === "UNCLASSIFIED") outcome.unclassified_rows += 1;

  const source = byUrl.get(endpointUrl);
  const matchedSourceId = source?.source_id ?? null;

  const { error: ledgerError } = await db
    .from("live_source_endpoint_disposition_ledger")
    .upsert({
      endpoint_url: endpointUrl,
      endpoint_key: endpointKey,
      manifest_sha256: String(result.manifest_sha256 ?? outcome.manifest_sha256 ?? ""),
      endpoint_disposition: disposition,
      endpoint_disposition_reason: String(result.disposition_reason ?? "No disposition reason supplied."),
      http_status: typeof result.status === "number" ? result.status : null,
      final_url: result.final_url ?? null,
      content_type: result.content_type ?? result.get_content_type ?? null,
      latency_ms: typeof result.latency_ms === "number" ? Math.trunc(result.latency_ms) : null,
      error_text: result.error ?? result.get_error ?? null,
      observed_at: outcome.evaluated_at,
      matched_source_id: matchedSourceId,
      updated_at: outcome.evaluated_at,
    }, {
      onConflict: "endpoint_url",
    });

  if (ledgerError) throw ledgerError;
  outcome.ledger_rows_upserted += 1;

  if (source) {
    const endpointStatus =
      disposition === "WORKING" || disposition === "CANONICAL_REDIRECT"
        ? "PASS"
        : disposition === "MISSING_ENDPOINT"
          ? "WRONG_ENDPOINT"
          : disposition;

    const { error } = await db
      .from("live_source_certification_records")
      .update({
        endpoint_status: endpointStatus,
        endpoint_disposition: disposition,
        endpoint_disposition_reason: String(result.disposition_reason ?? "No disposition reason supplied."),
        endpoint_disposition_observed_at: outcome.evaluated_at,
        endpoint_url: source.endpoint_url ?? endpointUrl,
        canonical_url:
          endpointStatus === "PASS"
            ? String(result.final_url ?? endpointUrl)
            : source.canonical_url ?? null,
        endpoint_http_status: typeof result.status === "number" ? result.status : null,
        endpoint_final_url: result.final_url ?? null,
        endpoint_content_type: result.content_type ?? result.get_content_type ?? null,
        endpoint_latency_ms: typeof result.latency_ms === "number" ? Math.trunc(result.latency_ms) : null,
        endpoint_error: result.error ?? result.get_error ?? null,
        endpoint_observed_at: outcome.evaluated_at,
        updated_at: outcome.evaluated_at,
      })
      .eq("source_id", source.source_id);

    if (error) throw error;
    outcome.certification_records_updated += 1;
  } else {
    outcome.unmatched_source_records += 1;
  }
}

if (strict) {
  if (results.length !== expectedCount) {
    throw new Error(`Strict Phase B result count mismatch: expected ${expectedCount}, got ${results.length}`);
  }
  if (outcome.ledger_rows_upserted !== expectedCount) {
    throw new Error(`Strict Phase B ledger count mismatch: expected ${expectedCount}, got ${outcome.ledger_rows_upserted}`);
  }
  if (outcome.unclassified_rows !== 0) {
    throw new Error(`Strict Phase B importer found ${outcome.unclassified_rows} unclassified endpoints`);
  }
}

console.log(JSON.stringify(outcome, null, 2));
