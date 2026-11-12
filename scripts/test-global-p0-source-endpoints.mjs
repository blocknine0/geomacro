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

function validateResponse(sourceId, source, response, body, bytes) {
  if (!response.ok) return `HTTP_${response.status}`;
  const url = probeUrl(source);
  const ct = String(response.headers.get("content-type") ?? "").toLowerCase();
  if (sourceId === "icc_news" && !/html/iu.test(ct)) return "ICC_LISTING_MIME_MISMATCH";
  if (sourceId === "world_bank_commodity_prices" && !/spreadsheet|excel|officedocument/iu.test(ct)) return "WORLD_BANK_DATASET_MIME_MISMATCH";
  const looksXml = /xml/i.test(ct) || /\.xml(?:$|[?#])/i.test(url);
  const looksCsv = /csv/i.test(ct) || /\.csv(?:$|[?#])/i.test(url);
  const looksXlsx = /spreadsheet|excel|officedocument/i.test(ct) || /\.xlsx(?:$|[?#])/i.test(url);
  if (looksXml && !/^\s*</.test(body)) return "XML_PAYLOAD_INVALID";
  if (looksCsv && body.split(/\r?\n/).find(Boolean)?.split(/[,;\t]/).length < 2) return "DELIMITED_PAYLOAD_INVALID";
  if (looksXlsx) {
    if (bytes.length < 100) return "XLSX_PAYLOAD_TOO_SMALL";
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return "XLSX_ZIP_SIGNATURE_INVALID";
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
      error: validateResponse(sourceId, source, response, body, bytes),
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
      error: error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "UPSTREAM_TIMEOUT"
        : error?.name === "TypeError" ? "UPSTREAM_NETWORK_ERROR" : "UPSTREAM_REQUEST_FAILED",
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
