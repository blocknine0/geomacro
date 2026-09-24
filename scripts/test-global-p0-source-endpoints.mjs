#!/usr/bin/env node
/**
 * Global P0 source endpoint probe.
 *
 * Read-only. No database writes and no source activation.
 * This establishes endpoint reachability/content metadata only.
 */
import fs from "node:fs/promises";
import process from "node:process";

const registry = JSON.parse(
  await fs.readFile(new URL("../config/global-p0-source-expansion.json", import.meta.url), "utf8"),
);

const timeoutMs = Number(process.env.P0_SOURCE_PROBE_TIMEOUT_MS ?? 15000);

async function probe(sourceId, source) {
  const started = Date.now();
  try {
    const response = await fetch(source.discovery_url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "Geomacro-source-probe/1.0" },
    });
    const body = await response.text();
    return {
      source_id: sourceId,
      status: response.status,
      ok: response.ok,
      final_url: response.url,
      content_type: response.headers.get("content-type") ?? "",
      bytes: Buffer.byteLength(body, "utf8"),
      latency_ms: Date.now() - started,
      observed_at: new Date().toISOString(),
      error: null,
    };
  } catch (error) {
    return {
      source_id: sourceId,
      status: null,
      ok: false,
      final_url: null,
      content_type: null,
      bytes: 0,
      latency_ms: Date.now() - started,
      observed_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const entries = Object.entries(registry.p0_global_source_expansion.sources);
const results = [];
for (const [sourceId, source] of entries) {
  results.push(await probe(sourceId, source));
}

const failed = results.filter((row) => !row.ok);
console.log(JSON.stringify({
  mode: "READ_ONLY_ENDPOINT_PROBE",
  source_count: results.length,
  pass_count: results.length - failed.length,
  fail_count: failed.length,
  results,
}, null, 2));

process.exitCode = failed.length ? 1 : 0;
