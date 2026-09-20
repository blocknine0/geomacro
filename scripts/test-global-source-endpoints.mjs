#!/usr/bin/env node
/**
 * Read-only global source endpoint probe.
 *
 * Scans SQL migrations for all HTTP(S) URLs, de-duplicates them, and records
 * transport/reachability evidence. It does not grant commercial eligibility.
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const OUT = path.join(ROOT, "artifacts", "global-source-endpoint-probe");
const TIMEOUT_MS = Number(process.env.SOURCE_PROBE_TIMEOUT_MS ?? "12000");
const CONCURRENCY = Number(process.env.SOURCE_PROBE_CONCURRENCY ?? "12");
const MAX_URLS = Number(process.env.SOURCE_PROBE_MAX_URLS ?? "5000");

await fs.mkdir(OUT, { recursive: true });

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith(".sql")) out.push(full);
  }
  return out;
}

const files = (await walk(MIGRATIONS)).sort();
const urlMap = new Map();

for (const file of files) {
  const source = await fs.readFile(file, "utf8");
  for (const match of source.matchAll(/https?:\/\/[^\s'"\`\)>;]+/g)) {
    const raw = match[0].replace(/[),.;]+$/, "");
    try {
      const url = new URL(raw).toString();
      if (!urlMap.has(url)) {
        const line = source.slice(0, match.index).split("\n").length;
        urlMap.set(url, {
          url,
          first_seen_file: path.relative(ROOT, file),
          first_seen_line: line,
        });
      }
    } catch {}
  }
}

const candidates = [...urlMap.values()];
if (candidates.length > MAX_URLS) {
  throw new Error(`Refusing to probe ${candidates.length} URLs; MAX is ${MAX_URLS}.`);
}

async function probe(entry) {
  const started = Date.now();
  const result = {
    ...entry,
    status: null,
    status_text: null,
    method: null,
    final_url: null,
    content_type: null,
    content_length: null,
    last_modified: null,
    etag: null,
    cache_control: null,
    age: null,
    get_status: null,
    get_content_type: null,
    latency_ms: null,
    ok_transport: false,
    error: null,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let response = await fetch(entry.url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Geomacro-Source-Probe/1.0" },
    });

    if (response.status === 405 || response.status === 501 || response.status === 403) {
      response = await fetch(entry.url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": "Geomacro-Source-Probe/1.0",
          "range": "bytes=0-4095",
        },
      });
      try { await response.arrayBuffer(); } catch {}
      result.method = "GET";
    } else {
      result.method = "HEAD";
    }

    result.status = response.status;
    result.status_text = response.statusText;
    result.final_url = response.url;
    result.content_type = response.headers.get("content-type");
    result.content_length = response.headers.get("content-length");
    result.last_modified = response.headers.get("last-modified");
    result.etag = response.headers.get("etag");
    result.cache_control = response.headers.get("cache-control");
    result.age = response.headers.get("age");
    result.ok_transport = response.status >= 200 && response.status < 400;

    if (result.method === "HEAD" && response.status === 200) {
      try {
        const verify = await fetch(entry.url, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "user-agent": "Geomacro-Source-Probe/1.0",
            "range": "bytes=0-4095",
          },
        });
        try { await verify.arrayBuffer(); } catch {}
        result.get_status = verify.status;
        result.get_content_type = verify.headers.get("content-type");
      } catch (error) {
        result.get_error = String(error?.message ?? error);
      }
    }
  } catch (error) {
    result.error = String(error?.message ?? error);
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
    const index = next++;
    if (index >= candidates.length) return;
    results[index] = await probe(candidates[index]);
    if ((index + 1) % 25 === 0 || index === candidates.length - 1) {
      console.log(`PROBED ${index + 1}/${candidates.length}`);
    }
  }
}
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker),
);

const summary = {
  evaluated_at: new Date().toISOString(),
  migration_files_scanned: files.length,
  unique_url_count: results.length,
  transport_ok_count: results.filter(x => x.ok_transport).length,
  transport_not_ok_count: results.filter(x => !x.ok_transport).length,
  network_or_timeout_error_count: results.filter(x => x.error).length,
  statuses: Object.fromEntries(
    [...results.reduce((m, r) => {
      const k = String(r.status ?? "ERROR");
      m.set(k, (m.get(k) ?? 0) + 1);
      return m;
    }, new Map())].sort((a,b) => Number(a[0]) - Number(b[0]))
  ),
  reachable_non_2xx: results.filter(
    x => x.status !== null && (x.status < 200 || x.status >= 400)
  ),
  limitations: [
    "Endpoint transport only.",
    "Commercial source rights require source-specific evidence.",
    "Schema compatibility requires adapter-level tests.",
    "Freshness requires dataset-specific cadence/semantic checks.",
    "Source independence requires source-family analysis.",
  ],
};

await fs.writeFile(
  path.join(OUT, "results.json"),
  JSON.stringify(results, null, 2),
);
await fs.writeFile(
  path.join(OUT, "summary.json"),
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary, null, 2));

if (
  process.env.SOURCE_PROBE_FAIL_ON_TRANSPORT_ERRORS === "true" &&
  summary.transport_not_ok_count > 0
) process.exit(1);
