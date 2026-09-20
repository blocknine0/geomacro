#!/usr/bin/env node
/**
 * Permanent 933-endpoint disposition probe.
 *
 * Canonical Phase B universe:
 *   unique normalized HTTP(S) URLs extracted from supabase/migrations
 *   and locked by config/source-endpoint-manifest-lock.json.
 *
 * This script is read-only. It never promotes a source, changes certification,
 * or writes production database state.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { collectMigrationEndpointManifest, readEndpointManifestLock, assertEndpointManifestLock } from "./source-endpoint-manifest.mjs";

const expectedProject = process.env.EXPECTED_SUPABASE_PROJECT_REF ?? "ldpwajisioljyjtojvfx";
const expectedCount = Number(process.env.EXPECTED_ENDPOINT_COUNT ?? "933");
const timeoutMs = Number(process.env.SOURCE_PROBE_TIMEOUT_MS ?? "5000");
const concurrency = Math.max(1, Number(process.env.SOURCE_PROBE_CONCURRENCY ?? "40"));

const manifest = await collectMigrationEndpointManifest();
const lock = await readEndpointManifestLock();
assertEndpointManifestLock(manifest, lock);

if (manifest.endpoint_count !== expectedCount) {
  throw new Error(`Phase B endpoint manifest count mismatch: expected ${expectedCount}, got ${manifest.endpoint_count}`);
}

const outDir = path.join(process.cwd(), "artifacts", "source-endpoint-disposition-933");
await fs.mkdir(outDir, { recursive: true });

function classify(result) {
  const errorText = String(result.error ?? result.get_error ?? "");
  const finalUrl = String(result.final_url ?? "");
  const status = result.status;

  if (result.ok_transport && result.method === "HEAD" && result.get_status !== null && result.get_ok_transport === false) {
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
  if (status === 401 || status === 407) {
    return ["AUTH_REQUIRED", `HTTP ${status} requires authentication/proxy authorization.`];
  }
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

async function fetchWithDeadline(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await Promise.race([
      fetch(url, {
        ...init,
        signal: controller.signal,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Probe deadline exceeded after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function probe(endpoint) {
  const started = Date.now();
  const entry = {
    endpoint_url: endpoint.endpoint_url,
    first_seen_file: endpoint.first_seen_file,
    first_seen_line: endpoint.first_seen_line,
    endpoint_key: createHash("sha256").update(endpoint.endpoint_url, "utf8").digest("hex"),
    status: null,
    status_text: null,
    method: "GET",
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

  try {
    const response = await fetchWithDeadline(
      endpoint.endpoint_url,
      {
        method: "GET",
        redirect: "follow",
        headers: {
          "user-agent": "Geomacro-Source-Probe/4.0",
          range: "bytes=0-4095",
          accept: "*/*",
        },
      },
      timeoutMs,
    );

    entry.status = response.status;
    entry.status_text = response.statusText;
    entry.final_url = response.url;
    entry.content_type = response.headers.get("content-type");
    entry.content_length = response.headers.get("content-length");
    entry.last_modified = response.headers.get("last-modified");
    entry.etag = response.headers.get("etag");
    entry.cache_control = response.headers.get("cache-control");
    entry.get_status = response.status;
    entry.get_content_type = entry.content_type;
    entry.get_ok_transport = response.status >= 200 && response.status < 400;
    entry.ok_transport = entry.get_ok_transport;

    try {
      if (response.body) void response.body.cancel().catch(() => {});
    } catch (error) {
      entry.get_error = String(error?.message ?? error);
      entry.ok_transport = false;
      entry.get_ok_transport = false;
    }
  } catch (error) {
    entry.error = String(error?.message ?? error);
  } finally {
    entry.latency_ms = Date.now() - started;
  }

  [entry.disposition, entry.disposition_reason] = classify(entry);
  return entry;
}

const results = new Array(manifest.entries.length);
let next = 0;

async function worker() {
  while (true) {
    const index = next++;
    if (index >= manifest.entries.length) return;
    results[index] = await probe(manifest.entries[index]);
    if ((index + 1) % 50 === 0 || index === manifest.entries.length - 1) {
      console.log(`PROBED ${index + 1}/${manifest.entries.length}`);
    }
  }
}

await Promise.all(Array.from({
  length: Math.min(concurrency, manifest.entries.length),
}, worker));

const classifications = {};
for (const row of results) {
  classifications[row.disposition] = (classifications[row.disposition] ?? 0) + 1;
}

const summary = {
  schema_version: "geomacro-endpoint-disposition-933-v2",
  evaluated_at: new Date().toISOString(),
  authoritative_project_ref: expectedProject,
  manifest_source: manifest.source,
  expected_endpoint_count: expectedCount,
  observed_endpoint_count: results.length,
  manifest_sha256: manifest.manifest_sha256,
  disposition_count: results.filter((r) => r.disposition !== "UNCLASSIFIED").length,
  unclassified_count: results.filter((r) => r.disposition === "UNCLASSIFIED").length,
  transport_success_count: results.filter((r) => ["WORKING", "CANONICAL_REDIRECT"].includes(r.disposition)).length,
  remediation_count: results.filter((r) => !["WORKING", "CANONICAL_REDIRECT"].includes(r.disposition)).length,
  classifications: Object.fromEntries(Object.entries(classifications).sort()),
  write_operations_performed: false,
};

await fs.writeFile(path.join(outDir, "results.json"), JSON.stringify(results, null, 2) + "\n");
await fs.writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));

if (
  summary.observed_endpoint_count !== expectedCount ||
  summary.disposition_count !== expectedCount ||
  summary.unclassified_count !== 0 ||
  summary.manifest_sha256 !== lock.manifest_sha256
) {
  process.exit(1);
}
