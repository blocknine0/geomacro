import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = String(process.env.GEOMACRO_LIVE_PERF_BASE_URL || "https://geomacro.live").replace(/\/$/, "");
const EXPECTED_HOST = String(process.env.GEOMACRO_LIVE_PERF_EXPECTED_HOST || "geomacro.live").trim().toLowerCase();
const SAMPLES = Number(process.env.GEOMACRO_LIVE_PERF_SAMPLES || "5");
const ARTIFACT_DIR = String(process.env.GEOMACRO_LIVE_PERF_ARTIFACT_DIR || "artifacts/live-performance-slo");

const TARGETS = [
  { path: "/", kind: "html", budget_ms: 4_000 },
  { path: "/intelligence", kind: "html", budget_ms: 4_000 },
  { path: "/global-risk", kind: "html", budget_ms: 4_000 },
  { path: "/risk-gate", kind: "html", budget_ms: 4_000 },
  { path: "/data-api", kind: "html", budget_ms: 4_000 },
  { path: "/testnet-access", kind: "html", budget_ms: 3_500 },
  { path: "/testnet-console", kind: "html", budget_ms: 3_500 },
  { path: "/api/health", kind: "api", budget_ms: 2_500 },
  { path: "/api/testnet/manifest", kind: "api", budget_ms: 3_000 },
  { path: "/testnet-wallet-first-v2.js", kind: "asset", budget_ms: 2_500 },
  { path: "/testnet-console.js", kind: "asset", budget_ms: 2_500 },
  { path: "/testnet-console-pricing.js", kind: "asset", budget_ms: 2_500 },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

async function probe(target) {
  const started = performance.now();
  const response = await fetch(`${BASE_URL}${target.path}`, {
    redirect: "follow",
    headers: { accept: target.kind === "api" ? "application/json" : "text/html,application/javascript,*/*" },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.arrayBuffer();
  return {
    status: response.status,
    elapsed_ms: Number((performance.now() - started).toFixed(1)),
    bytes: body.byteLength,
    cache_control: response.headers.get("cache-control"),
    server_timing: response.headers.get("server-timing"),
  };
}

async function main() {
  const parsed = new URL(BASE_URL);
  assert(parsed.protocol === "https:", "Performance probe requires HTTPS");
  assert(parsed.hostname.toLowerCase() === EXPECTED_HOST, `Refusing unexpected host ${parsed.hostname}`);
  assert(Number.isInteger(SAMPLES) && SAMPLES >= 3 && SAMPLES <= 20, "GEOMACRO_LIVE_PERF_SAMPLES must be 3..20");

  const results = [];
  const failures = [];

  for (const target of TARGETS) {
    // Warm once so p95 is not dominated by one cold DNS/TLS setup on the runner.
    await probe(target);
    const observations = [];
    for (let i = 0; i < SAMPLES; i += 1) {
      observations.push(await probe(target));
    }
    const times = observations.map((item) => item.elapsed_ms);
    const statuses = observations.map((item) => item.status);
    const p50 = Number(percentile(times, 50).toFixed(1));
    const p95 = Number(percentile(times, 95).toFixed(1));
    const max = Number(Math.max(...times).toFixed(1));
    const min = Number(Math.min(...times).toFixed(1));
    const status_ok = statuses.every((status) => status === 200);
    const latency_ok = p95 <= target.budget_ms;
    const row = {
      path: target.path,
      kind: target.kind,
      samples: SAMPLES,
      status_ok,
      statuses,
      latency_budget_p95_ms: target.budget_ms,
      p50_ms: p50,
      p95_ms: p95,
      min_ms: min,
      max_ms: max,
      bytes: observations[0]?.bytes ?? 0,
      cache_control: observations[0]?.cache_control ?? null,
      server_timing: observations[0]?.server_timing ?? null,
      ok: status_ok && latency_ok,
    };
    results.push(row);
    if (!row.ok) failures.push(row);
    console.log(`${row.ok ? "PASS" : "FAIL"} ${target.path} status=${statuses.join(",")} p50=${p50}ms p95=${p95}ms budget=${target.budget_ms}ms`);
  }

  const report = {
    ok: failures.length === 0,
    measured_at: new Date().toISOString(),
    target_host: parsed.hostname,
    model: "real_network_live_route_slo",
    samples_per_route: SAMPLES,
    routes: results,
    failures: failures.map((item) => ({ path: item.path, statuses: item.statuses, p95_ms: item.p95_ms, budget_ms: item.latency_budget_p95_ms })),
    boundaries: {
      real_network_requests: true,
      paid_transactions: false,
      production_capacity_claim: false,
      execution_authorized: false,
    },
  };

  await mkdir(ARTIFACT_DIR, { recursive: true });
  const artifact = path.join(ARTIFACT_DIR, `live-performance-${Date.now()}.json`);
  await writeFile(artifact, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: report.ok, artifact, failures: report.failures }, null, 2));
  if (!report.ok) process.exit(1);
}

await main();
