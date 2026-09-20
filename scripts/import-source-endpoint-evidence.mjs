#!/usr/bin/env node
/**
 * Import endpoint-probe evidence into source certification records.
 *
 * This is intentionally narrow: it only updates endpoint fields. It never
 * promotes commercial rights, schema, freshness, provenance, independence,
 * adapter, runtime or certification state.
 */
import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const input = process.argv[2] ?? "artifacts/global-source-endpoint-probe/results.json";
const supabaseUrl = process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRole = process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const expectedProject = process.env.EXPECTED_SUPABASE_PROJECT_REF;
const expectedCount = Number(process.env.EXPECTED_ENDPOINT_COUNT ?? "0");
const strictCount = process.env.STRICT_ENDPOINT_COUNT === "true";

if (!supabaseUrl || !serviceRole) {
  throw new Error("APP_SUPABASE_URL/SUPABASE_URL and service-role key are required");
}
if (!expectedProject) {
  throw new Error("EXPECTED_SUPABASE_PROJECT_REF is required");
}

const results = JSON.parse(await fs.readFile(input, "utf8"));
if (!Array.isArray(results)) throw new Error("Endpoint probe results must be an array");

const db = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: sources, error: sourceError } = await db
  .from("live_source_certification_records")
  .select("source_id,endpoint_url,canonical_url");
if (sourceError) throw sourceError;

const byId = new Map();
const byUrl = new Map();
for (const source of sources ?? []) {
  byId.set(String(source.source_id), source);
  for (const url of [source.endpoint_url, source.canonical_url].filter(Boolean)) {
    byUrl.set(String(url), source);
  }
}

const outcome = {
  evaluated_at: new Date().toISOString(),
  authoritative_project_ref: expectedProject,
  probe_rows: results.length,
  matched_sources: 0,
  updated_sources: 0,
  unmatched_urls: [],
  skipped: [],
  write_operations_performed: true,
};

for (const result of results) {
  const source = result.source_id
    ? byId.get(String(result.source_id))
    : byUrl.get(String(result.url));
  if (!source) {
    outcome.unmatched_urls.push(String(result.source_id ?? result.url));
    continue;
  }
  outcome.matched_sources += 1;

  const status = String(result.classification ?? "UNCLASSIFIED");
  const allowed = new Set([
    "WORKING",
    "CANONICAL_REDIRECT",
    "AUTH_REQUIRED",
    "WAF",
    "DEPRECATED",
    "WRONG_ENDPOINT",
    "MISSING_ENDPOINT",
    "TIMEOUT",
    "DNS_FAILURE",
    "BLOCKED_ENVIRONMENT",
    "FAIL",
    "UNCLASSIFIED",
  ]);
  if (!allowed.has(status)) {
    outcome.skipped.push({ url: result.url, reason: "unknown_classification" });
    continue;
  }

  const endpointStatus =
    status === "WORKING" || status === "CANONICAL_REDIRECT"
      ? "PASS"
      : status === "MISSING_ENDPOINT"
        ? "WRONG_ENDPOINT"
        : status;

  const update = {
    endpoint_status: endpointStatus,
    endpoint_disposition: status,
    endpoint_disposition_reason: result.disposition_reason ?? null,
    endpoint_disposition_observed_at: outcome.evaluated_at,
    endpoint_url: String(source.endpoint_url ?? result.url),
    canonical_url:
      endpointStatus === "PASS"
        ? String(result.final_url ?? result.url)
        : source.canonical_url ?? null,
    endpoint_http_status:
      typeof result.status === "number" ? result.status : null,
    endpoint_final_url: result.final_url ?? null,
    endpoint_content_type: result.content_type ?? result.get_content_type ?? null,
    endpoint_latency_ms:
      typeof result.latency_ms === "number" ? Math.trunc(result.latency_ms) : null,
    endpoint_error: result.error ?? result.get_error ?? null,
    endpoint_observed_at: outcome.evaluated_at,
    updated_at: outcome.evaluated_at,
  };

  const { error } = await db
    .from("live_source_certification_records")
    .update(update)
    .eq("source_id", source.source_id);
  if (error) throw error;

  outcome.updated_sources += 1;
}

if (strictCount) {
  if (expectedCount < 1) throw new Error("EXPECTED_ENDPOINT_COUNT must be set when STRICT_ENDPOINT_COUNT=true");
  if (results.length !== expectedCount) throw new Error(`Endpoint evidence count mismatch: expected ${expectedCount}, got ${results.length}`);
  if (outcome.matched_sources !== expectedCount || outcome.updated_sources !== expectedCount || outcome.unmatched_urls.length || outcome.skipped.length) {
    throw new Error(`Strict 933 endpoint evidence import failed: ${JSON.stringify(outcome)}`);
  }
}

console.log(JSON.stringify(outcome, null, 2));
