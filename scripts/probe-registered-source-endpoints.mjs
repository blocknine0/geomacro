#!/usr/bin/env node
/**
 * Read-only probe of the currently registered Geomacro source universe.
 * Only sources actually present in live_external_sources are tested.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) throw new Error("SUPABASE_DB_URL is required");
const exec = promisify(execFile);
const ROOT = process.cwd();
const OUT = path.join(ROOT, "artifacts", "registered-source-endpoint-probe");
const TIMEOUT_MS = Number(process.env.SOURCE_PROBE_TIMEOUT_MS ?? "5000");
const CONCURRENCY = Number(process.env.SOURCE_PROBE_CONCURRENCY ?? "40");
const MAX_URLS = Number(process.env.SOURCE_PROBE_MAX_URLS ?? "5000");

await fs.mkdir(OUT, { recursive: true });

const { stdout } = await exec("psql", [
  dbUrl, "-v", "ON_ERROR_STOP=1", "-AtF", "|", "-c",
  "select source_id,coalesce(base_url,''),commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals from public.live_external_sources where base_url is not null and btrim(base_url) <> '' order by source_id"
], { maxBuffer: 20 * 1024 * 1024 });

const candidates = stdout.split("\n").filter(Boolean).map(line => {
  const [source_id, base_url, commercial_usage_status, enabled_for_ingestion, enabled_for_commercial_signals] = line.split("|");
  return { source_id, url: base_url, commercial_usage_status, enabled_for_ingestion, enabled_for_commercial_signals };
});

if (candidates.length > MAX_URLS) throw new Error(`Refusing to probe ${candidates.length} registered source URLs; MAX is ${MAX_URLS}.`);

async function probe(entry) {
  const started = Date.now();
  const result = {
    ...entry,
    method: null,
    status: null,
    final_url: null,
    content_type: null,
    latency_ms: null,
    ok_transport: false,
    classification: "UNCLASSIFIED",
    error: null,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let response = await fetch(entry.url, {
      method: "HEAD", redirect: "follow", signal: controller.signal,
      headers: { "user-agent": "Geomacro-Registered-Source-Probe/1.0" },
    });
    if ([403,405,501].includes(response.status)) {
      response = await fetch(entry.url, {
        method: "GET", redirect: "follow", signal: controller.signal,
        headers: {
          "user-agent": "Geomacro-Registered-Source-Probe/1.0",
          "range": "bytes=0-4095",
        },
      });
      try { await response.arrayBuffer(); } catch {}
      result.method = "GET";
    } else {
      result.method = "HEAD";
    }
    result.status = response.status;
    result.final_url = response.url;
    result.content_type = response.headers.get("content-type");
    result.ok_transport = response.status >= 200 && response.status < 400;
    if (result.ok_transport) result.classification = result.final_url && result.final_url !== entry.url ? "CANONICAL_REDIRECT" : "WORKING";
    else if (response.status === 401 || response.status === 407) result.classification = "AUTH_REQUIRED";
    else if (response.status === 403) result.classification = "BLOCKED_ENVIRONMENT";
    else if (response.status === 404) result.classification = "WRONG_ENDPOINT";
    else if (response.status === 410) result.classification = "DEPRECATED";
    else if (response.status >= 400) result.classification = "FAIL";
  } catch (error) {
    result.error = String(error?.message ?? error);
    if (/abort|timeout/i.test(result.error)) result.classification = "TIMEOUT";
    else if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|DNS/i.test(result.error)) result.classification = "DNS_FAILURE";
    else result.classification = "FAIL";
  } finally {
    clearTimeout(timer);
    result.latency_ms = Date.now() - started;
  }
  return result;
}

const results = new Array(candidates.length);
let next = 0;
async function worker() {
  while (true) {
    const i = next++;
    if (i >= candidates.length) return;
    results[i] = await probe(candidates[i]);
    if ((i + 1) % 25 === 0 || i === candidates.length - 1) console.log(`PROBED ${i + 1}/${candidates.length}`);
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker));

const summary = {
  evaluated_at: new Date().toISOString(),
  registered_source_count: candidates.length,
  transport_ok_count: results.filter(x => x.ok_transport).length,
  transport_not_ok_count: results.filter(x => !x.ok_transport).length,
  classifications: Object.fromEntries(
    [...results.reduce((m,r) => { const k = r.classification; m.set(k,(m.get(k)??0)+1); return m; },new Map())].sort((a,b)=>a[0].localeCompare(b[0]))
  ),
  remediation_count: results.filter(x => !["WORKING","CANONICAL_REDIRECT"].includes(x.classification)).length,
  limitations: [
    "Transport evidence only; rights, schema, freshness, provenance, independence, adapter and runtime remain separate gates.",
    "An endpoint can be reachable and still be commercially ineligible."
  ]
};
await fs.writeFile(path.join(OUT, "results.json"), JSON.stringify(results,null,2)+"\n");
await fs.writeFile(path.join(OUT, "summary.json"), JSON.stringify(summary,null,2)+"\n");
console.log(JSON.stringify(summary,null,2));
