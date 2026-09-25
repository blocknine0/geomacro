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

function probeUrl(source) {
  return source.machine_endpoint ?? source.discovery_url;
}

function validateResponse(source, response, body, bytes) {
  const url = probeUrl(source);
  const ct = String(response.headers.get("content-type") ?? "").toLowerCase();
  const looksXml = /xml/i.test(ct) || /\.xml(?:$|[?#])/i.test(url);
  const looksCsv = /csv/i.test(ct) || /\.csv(?:$|[?#])/i.test(url);
  const looksXlsx = /spreadsheet|excel|officedocument/i.test(ct) || /\.xlsx(?:$|[?#])/i.test(url);
  if (looksXml && !/^\s*</.test(body)) return "expected XML-like payload";
  if (looksCsv && body.split(/\r?\n/).find(Boolean)?.split(/[,;\t]/).length < 2) return "expected delimited payload";
  if (looksXlsx) {
    if (bytes.length < 100) return "expected XLSX payload";
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return "expected XLSX ZIP signature";
  }
  return null;
}

async function probe(sourceId, source) {
  const started = Date.now();
  try {
    const response = await fetch(probeUrl(source), {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "Geomacro-source-probe/1.0" },
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const body = (String(response.headers.get("content-type") ?? "").toLowerCase().includes("xml") || String(response.headers.get("content-type") ?? "").toLowerCase().includes("csv")) ? new TextDecoder().decode(bytes) : "";
    return {
      source_id: sourceId,
      status: response.status,
      ok: response.ok,
      final_url: response.url,
      content_type: response.headers.get("content-type") ?? "",
      bytes: bytes.byteLength,
      latency_ms: Date.now() - started,
      observed_at: new Date().toISOString(),
      error: validateResponse(source, response, body, bytes),
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

const failed = results.filter((row) => !row.ok || row.error);
const blockingFailures = failed.filter((row) => {
  const registrySource = registry.p0_global_source_expansion.sources[row.source_id];
  return registrySource?.enabled !== false;
});
console.log(JSON.stringify({
  mode: "READ_ONLY_ENDPOINT_PROBE",
  source_count: results.length,
  pass_count: results.length - failed.length,
  fail_count: failed.length,
  blocking_fail_count: blockingFailures.length,
  non_blocking_disabled_fail_count: failed.length - blockingFailures.length,
  results,
}, null, 2));

process.exitCode = blockingFailures.length ? 1 : 0;
