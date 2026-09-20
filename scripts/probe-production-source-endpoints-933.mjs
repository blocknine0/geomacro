#!/usr/bin/env node
/**
 * Permanent 933-source endpoint disposition probe.
 *
 * Reads the canonical required/active source set from the authoritative
 * Supabase database, asserts the expected 933-source universe, probes each
 * registered endpoint, and emits machine-readable evidence.
 *
 * This script NEVER promotes a source and NEVER changes database state.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const dbUrl = process.env.SUPABASE_DB_URL;
const expectedProject = process.env.EXPECTED_SUPABASE_PROJECT_REF ?? "ldpwajisioljyjtojvfx";
const expectedCount = Number(process.env.EXPECTED_ENDPOINT_COUNT ?? "933");
const timeoutMs = Number(process.env.SOURCE_PROBE_TIMEOUT_MS ?? "12000");
const concurrency = Math.max(1, Number(process.env.SOURCE_PROBE_CONCURRENCY ?? "20"));

if (!dbUrl) throw new Error("SUPABASE_DB_URL is required");

const parsed = new URL(dbUrl);
if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
  throw new Error("SUPABASE_DB_URL must use postgres:// or postgresql://");
}
const directHost = `db.${expectedProject}.supabase.co`;
const username = decodeURIComponent(parsed.username);
const directMatch = parsed.hostname === directHost && username === "postgres";
const poolerMatch =
  parsed.hostname.endsWith(".pooler.supabase.com") &&
  username === `postgres.${expectedProject}`;
if (!directMatch && !poolerMatch) {
  throw new Error("Refusing endpoint probe against a database outside the authoritative production project.");
}
if (!parsed.password || parsed.pathname !== "/postgres") {
  throw new Error("Invalid authoritative production database URL.");
}

const outDir = path.join(process.cwd(), "artifacts", "source-endpoint-disposition-933");
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

const universeRaw = await sql(`
select json_build_object(
  'required_count', (select count(distinct u.source_id)::bigint from public.live_global_source_universe u where u.required = true),
  'active_count', (select count(*)::bigint from public.live_external_sources s where s.enabled_for_ingestion = true or s.enabled_for_commercial_signals = true),
  'active_outside_required_count', (select count(*)::bigint from public.live_external_sources s where (s.enabled_for_ingestion = true or s.enabled_for_commercial_signals = true) and not exists (select 1 from public.live_global_source_universe u where u.source_id = s.source_id and u.required = true)),
  'required_outside_certification_record_count', (select count(*)::bigint from public.live_global_source_universe u left join public.live_source_certification_records r on r.source_id = u.source_id where u.required = true and r.source_id is null)
)::text
`);
const universe = JSON.parse(universeRaw || "{}");

const rowsRaw = await sql(`
select coalesce(json_agg(x order by x.source_id), '[]'::json)::text
from (
  select distinct
    r.source_id,
    coalesce(r.endpoint_url, r.canonical_url, '') as endpoint_url,
    coalesce(r.canonical_url, '') as canonical_url,
    s.category,
    s.provider_name,
    s.country_scope,
    s.freshness_class
  from public.live_source_certification_records r
  join public.live_external_sources s on s.source_id = r.source_id
  where exists (
    select 1 from public.live_global_source_universe u
    where u.source_id = r.source_id and u.required = true
  )
) x
`);

const sources = JSON.parse(rowsRaw || "[]");
if (Number(universe.required_count) !== expectedCount) {
  throw new Error(`Phase B canonical required-universe mismatch: expected ${expectedCount}, got ${universe.required_count}; active sources outside required universe: ${universe.active_outside_required_count}`);
}
if (sources.length !== expectedCount) {
  throw new Error(`Certification-record coverage mismatch for required universe: expected ${expectedCount}, got ${sources.length}`);
}
if (new Set(sources.map((s) => s.source_id)).size !== sources.length) {
  throw new Error("Canonical source universe contains duplicate source_id values.");
}

function classify(result) {
  const errorText = String(result.error ?? result.get_error ?? "");
  const finalUrl = String(result.final_url ?? "");
  const status = result.status;

  if (!result.endpoint_url) {
    return ["MISSING_ENDPOINT", "No canonical or registered endpoint URL is present."];
  }

  if (
    result.ok_transport &&
    result.method === "HEAD" &&
    result.get_status !== null &&
    result.get_ok_transport === false
  ) {
    return ["FAIL", `HEAD succeeded but GET verification returned HTTP ${result.get_status}.`];
  }
  if (result.ok_transport && result.method === "HEAD" && result.get_error) {
    return [
      /abort|timeout/i.test(String(result.get_error)) ? "TIMEOUT" : "FAIL",
      `HEAD succeeded but GET verification failed: ${String(result.get_error)}`,
    ];
  }
  if (result.ok_transport) {
    return [
      finalUrl && finalUrl !== result.endpoint_url ? "CANONICAL_REDIRECT" : "WORKING",
      finalUrl && finalUrl !== result.endpoint_url
        ? "Transport succeeded after redirect to a different final URL."
        : "HTTP transport succeeded.",
    ];
  }
  if (status === 401 || status === 407) return ["AUTH_REQUIRED", `HTTP ${status} requires authentication/proxy authorization.`];
  if (status === 403) {
    const haystack = `${result.status_text ?? ""} ${result.content_type ?? ""} ${finalUrl}`.toLowerCase();
    return [
      /(cloudflare|akamai|waf|bot|challenge|forbidden)/.test(haystack) ? "WAF" : "BLOCKED_ENVIRONMENT",
      "HTTP 403 did not expose a verified machine-accessible response.",
    ];
  }
  if (status === 404) return ["WRONG_ENDPOINT", "HTTP 404; endpoint needs canonical/source-specific path verification."];
  if (status === 410) return ["DEPRECATED", "HTTP 410 indicates a deliberately retired resource."];
  if (status !== null && status >= 400) return ["FAIL", `HTTP ${status} transport failure.`];
  if (/abort|timeout/i.test(errorText)) return ["TIMEOUT", errorText];
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|DNS/i.test(errorText)) return ["DNS_FAILURE", errorText];
  if (errorText) return ["FAIL", errorText];
  return ["UNCLASSIFIED", "No deterministic transport disposition was produced."];
}

async function probe(source) {
  const started = Date.now();
  const entry = {
    ...source,
    endpoint_url: source.endpoint_url || "",
    status: null,
    status_text: null,
    method: null,
    final_url: null,
    content_type: null,
    content_length: null,
    last_modified: null,
    etag: null,
    cache_control: null,
    get_status: null,
    get_content_type: null,
    get_ok_transport: null,
    ok_transport: false,
    latency_ms: null,
    error: null,
    get_error: null,
    disposition: "UNCLASSIFIED",
    disposition_reason: null,
  };

  if (!entry.endpoint_url) {
    [entry.disposition, entry.disposition_reason] = classify(entry);
    entry.latency_ms = Date.now() - started;
    return entry;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response = await fetch(entry.endpoint_url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Geomacro-Source-Probe/2.0" },
    });

    if ([403, 405, 501].includes(response.status)) {
      response = await fetch(entry.endpoint_url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": "Geomacro-Source-Probe/2.0",
          range: "bytes=0-4095",
        },
      });
      try { await response.arrayBuffer(); } catch {}
      entry.method = "GET";
    } else {
      entry.method = "HEAD";
    }

    entry.status = response.status;
    entry.status_text = response.statusText;
    entry.final_url = response.url;
    entry.content_type = response.headers.get("content-type");
    entry.content_length = response.headers.get("content-length");
    entry.last_modified = response.headers.get("last-modified");
    entry.etag = response.headers.get("etag");
    entry.cache_control = response.headers.get("cache-control");
    entry.ok_transport = response.status >= 200 && response.status < 400;

    if (entry.method === "HEAD" && response.status === 200) {
      try {
        const verify = await fetch(entry.endpoint_url, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "user-agent": "Geomacro-Source-Probe/2.0",
            range: "bytes=0-4095",
          },
        });
        try { await verify.arrayBuffer(); } catch {}
        entry.get_status = verify.status;
        entry.get_content_type = verify.headers.get("content-type");
        entry.get_ok_transport = verify.status >= 200 && verify.status < 400;
      } catch (error) {
        entry.get_error = String(error?.message ?? error);
      }
    }
  } catch (error) {
    entry.error = String(error?.message ?? error);
  } finally {
    clearTimeout(timer);
    entry.latency_ms = Date.now() - started;
  }

  [entry.disposition, entry.disposition_reason] = classify(entry);
  return entry;
}

const results = new Array(sources.length);
let next = 0;
async function worker() {
  while (true) {
    const index = next++;
    if (index >= sources.length) return;
    results[index] = await probe(sources[index]);
    if ((index + 1) % 50 === 0 || index === sources.length - 1) {
      console.log(`PROBED ${index + 1}/${sources.length}`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, worker));

const classifications = {};
for (const row of results) {
  classifications[row.disposition] = (classifications[row.disposition] ?? 0) + 1;
}

const summary = {
  schema_version: "geomacro-endpoint-disposition-933-v1",
  evaluated_at: new Date().toISOString(),
  authoritative_project_ref: expectedProject,
  expected_endpoint_count: expectedCount,
  canonical_required_source_count: Number(universe.required_count),
  active_source_count: Number(universe.active_count),
  active_source_outside_required_count: Number(universe.active_outside_required_count),
  required_outside_certification_record_count: Number(universe.required_outside_certification_record_count),
  observed_endpoint_count: results.length,
  disposition_count: results.filter((r) => r.disposition !== "UNCLASSIFIED").length,
  unclassified_count: results.filter((r) => r.disposition === "UNCLASSIFIED").length,
  remediation_count: results.filter((r) => !["WORKING", "CANONICAL_REDIRECT"].includes(r.disposition)).length,
  classifications: Object.fromEntries(Object.entries(classifications).sort()),
  write_operations_performed: false,
};

await fs.writeFile(path.join(outDir, "results.json"), JSON.stringify(results, null, 2) + "\n");
await fs.writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));

if (summary.observed_endpoint_count !== expectedCount || summary.disposition_count !== expectedCount || summary.unclassified_count !== 0) {
  process.exit(1);
}
