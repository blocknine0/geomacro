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

const byUrl = new Map();
for (const source of sources ?? []) {
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
  const source = byUrl.get(String(result.url));
  if (!source) {
    outcome.unmatched_urls.push(String(result.url));
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
      : status;

  const update = {
    endpoint_status: endpointStatus,
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

console.log(JSON.stringify(outcome, null, 2));
