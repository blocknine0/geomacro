import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const PRODUCTION_HOSTS = new Set(["geomacro.live", "www.geomacro.live"]);
const MAX_REQUESTS = 2000;
const MAX_CONCURRENCY = 25;
const MAX_TIMEOUT_MS = 30000;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_P95_MS = 3000;
const DEFAULT_MAX_P99_MS = 8000;
const FORBIDDEN_RESPONSE_KEYS = new Set([
  "authorization",
  "api_key",
  "api_secret",
  "private_key",
  "secret",
  "service_role_key",
  "supabase_service_role_key",
  "app_supabase_service_role_key",
  "payment_signature",
]);

function envString(name: string, required = true): string {
  const value = process.env[name]?.trim();
  if (required && !value) throw new Error(`${name} is required`);
  return value ?? "";
}

function envInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer within ${min}..${max}`);
  }
  return value;
}

function envBoolean(name: string, fallback = false): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`${name} must be true/false`);
}

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return Number(sorted[index].toFixed(2));
}

function validateIso3(value: string, field: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error(`${field} must be ISO3`);
  return normalized;
}

function normalizedKey(value: string): string {
  return value.trim().toLowerCase().replace(/[-.]/g, "_");
}

function findSensitiveResponseKey(value: unknown, path = "$" ): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findSensitiveResponseKey(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizedKey(key);
    if (
      FORBIDDEN_RESPONSE_KEYS.has(normalized) ||
      normalized.includes("service_role") ||
      normalized.includes("private_key") ||
      normalized.includes("api_secret")
    ) {
      return `${path}.${key}`;
    }
    const found = findSensitiveResponseKey(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function executionBoundaryIsExplicitlyFalse(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const root = payload as Record<string, unknown>;
  if (root.execution_authorized === false) return true;
  const riskGate = root.risk_gate;
  return Boolean(
    riskGate &&
      typeof riskGate === "object" &&
      !Array.isArray(riskGate) &&
      (riskGate as Record<string, unknown>).execution_authorized === false,
  );
}

function latencySloPass(
  latency: { p95: number | null; p99: number | null },
  maxP95Ms: number,
  maxP99Ms: number,
): boolean {
  return (
    Number.isFinite(latency.p95) &&
    Number.isFinite(latency.p99) &&
    Number(latency.p95) <= maxP95Ms &&
    Number(latency.p99) <= maxP99Ms
  );
}

export type LoadTarget = {
  baseUrl: URL;
  endpoint: URL;
  countryIso3: string;
  corridorOriginIso3: string | null;
  corridorDestinationIso3: string | null;
  mode: "country" | "corridor" | "mixed";
  totalRequests: number;
  concurrency: number;
  timeoutMs: number;
  allow429: boolean;
  maxP95Ms: number;
  maxP99Ms: number;
};

export function validateStagingLoadTarget(input: {
  baseUrl: string;
  acknowledgement: string;
  countryIso3: string;
  mode: string;
  corridorOriginIso3?: string;
  corridorDestinationIso3?: string;
  totalRequests: number;
  concurrency: number;
  timeoutMs: number;
  allow429: boolean;
  maxP95Ms?: number;
  maxP99Ms?: number;
}): LoadTarget {
  if (input.acknowledgement !== "STAGING_ONLY") {
    throw new Error("RISK_GATE_LOAD_TEST_ACK must equal STAGING_ONLY");
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(input.baseUrl);
  } catch {
    throw new Error("RISK_GATE_STAGING_BASE_URL must be a valid URL");
  }

  const hostname = baseUrl.hostname.toLowerCase();
  if (PRODUCTION_HOSTS.has(hostname)) {
    throw new Error("Production Geomacro host is blocked by the staging load harness");
  }

  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (baseUrl.protocol !== "https:" && !isLocal) {
    throw new Error("Staging load target must use HTTPS unless it is localhost");
  }
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error("Staging base URL must not contain credentials, query parameters or fragments");
  }

  if (input.totalRequests < 1 || input.totalRequests > MAX_REQUESTS) {
    throw new Error(`totalRequests must be within 1..${MAX_REQUESTS}`);
  }
  if (
    input.concurrency < 1 ||
    input.concurrency > MAX_CONCURRENCY ||
    input.concurrency > input.totalRequests
  ) {
    throw new Error(`concurrency must be within 1..${MAX_CONCURRENCY} and <= totalRequests`);
  }
  if (input.timeoutMs < 1000 || input.timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(`timeoutMs must be within 1000..${MAX_TIMEOUT_MS}`);
  }

  const maxP95Ms = input.maxP95Ms ?? DEFAULT_MAX_P95_MS;
  const maxP99Ms = input.maxP99Ms ?? DEFAULT_MAX_P99_MS;
  if (
    !Number.isInteger(maxP95Ms) ||
    !Number.isInteger(maxP99Ms) ||
    maxP95Ms < 1 ||
    maxP99Ms < 1 ||
    maxP95Ms > MAX_TIMEOUT_MS ||
    maxP99Ms > MAX_TIMEOUT_MS ||
    maxP95Ms > maxP99Ms
  ) {
    throw new Error("Prelaunch latency SLOs must be positive integers, <= timeout ceiling and p95 <= p99");
  }

  const mode = input.mode.trim().toLowerCase();
  if (mode !== "country" && mode !== "corridor" && mode !== "mixed") {
    throw new Error("RISK_GATE_LOAD_TEST_MODE must be country, corridor or mixed");
  }

  const countryIso3 = validateIso3(input.countryIso3, "RISK_GATE_LOAD_TEST_COUNTRY_ISO3");
  let corridorOriginIso3: string | null = null;
  let corridorDestinationIso3: string | null = null;

  if (mode === "corridor" || mode === "mixed") {
    corridorOriginIso3 = validateIso3(
      input.corridorOriginIso3 ?? "",
      "RISK_GATE_LOAD_TEST_CORRIDOR_ORIGIN_ISO3",
    );
    corridorDestinationIso3 = validateIso3(
      input.corridorDestinationIso3 ?? "",
      "RISK_GATE_LOAD_TEST_CORRIDOR_DESTINATION_ISO3",
    );
    if (corridorOriginIso3 === corridorDestinationIso3) {
      throw new Error("Corridor load-test endpoints must be different");
    }
  }

  return {
    baseUrl,
    endpoint: new URL("/api/risk-gate", baseUrl),
    countryIso3,
    corridorOriginIso3,
    corridorDestinationIso3,
    mode,
    totalRequests: input.totalRequests,
    concurrency: input.concurrency,
    timeoutMs: input.timeoutMs,
    allow429: input.allow429,
    maxP95Ms,
    maxP99Ms,
  };
}

function buildPolicy() {
  return {
    policy_id: "geomacro-staging-load-test",
    policy_version: "1.0.0",
    continue_max_score: 35,
    reduce_limit_max_score: 55,
    require_approval_max_score: 75,
    minimum_confidence_for_auto_continue: 0.8,
    require_commercial_verification_for_continue: true,
    max_positive_delta_for_auto_continue: 10,
    hard_stop_driver_contributions: { sanctions: 20 },
  };
}

function buildRequestBody(target: LoadTarget, index: number) {
  const useCorridor = target.mode === "corridor" || (target.mode === "mixed" && index % 2 === 1);
  const requestId = `load_${Date.now()}_${index}`;
  const action_context = {
    action_type: "staging_load_test",
    currency: "USDC",
    metadata: { synthetic: true, load_test: true },
  };

  if (useCorridor) {
    return {
      request_id: requestId,
      subject: {
        type: "corridor",
        origin_country_iso3: target.corridorOriginIso3,
        destination_country_iso3: target.corridorDestinationIso3,
      },
      action_context,
      policy: buildPolicy(),
    };
  }

  return {
    request_id: requestId,
    subject: { type: "country", country_iso3: target.countryIso3 },
    action_context,
    policy: buildPolicy(),
  };
}

type RequestResult = {
  status: number;
  latencyMs: number;
  executionBoundaryOk: boolean;
  responseSecurityOk: boolean;
  parseableJson: boolean;
  timedOut: boolean;
  networkError: boolean;
};

async function issueRequest(target: LoadTarget, apiKey: string, index: number): Promise<RequestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), target.timeoutMs);
  const started = performance.now();

  try {
    const response = await fetch(target.endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "user-agent": "geomacro-staging-load-harness/1.2",
      },
      body: JSON.stringify(buildRequestBody(target, index)),
      signal: controller.signal,
    });

    const latencyMs = performance.now() - started;
    const raw = await response.text();
    const apiKeyEchoed = raw.includes(apiKey);
    let payload: unknown = null;
    let parseableJson = false;

    try {
      payload = JSON.parse(raw);
      parseableJson = true;
    } catch {
      parseableJson = false;
    }

    const responseSecurityOk =
      !apiKeyEchoed &&
      parseableJson &&
      findSensitiveResponseKey(payload) === null;
    const executionBoundaryOk =
      parseableJson && executionBoundaryIsExplicitlyFalse(payload);

    return {
      status: response.status,
      latencyMs,
      executionBoundaryOk,
      responseSecurityOk,
      parseableJson,
      timedOut: false,
      networkError: false,
    };
  } catch (error) {
    const latencyMs = performance.now() - started;
    const timedOut =
      error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    return {
      status: 0,
      latencyMs,
      executionBoundaryOk: true,
      responseSecurityOk: true,
      parseableJson: false,
      timedOut,
      networkError: !timedOut,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runLoadTest(target: LoadTarget, apiKey: string) {
  const results: RequestResult[] = new Array(target.totalRequests);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= target.totalRequests) return;
      results[index] = await issueRequest(target, apiKey, index);
    }
  }

  const started = performance.now();
  await Promise.all(Array.from({ length: target.concurrency }, () => worker()));
  const durationMs = performance.now() - started;

  const statusCounts: Record<string, number> = {};
  for (const result of results) {
    const key = String(result.status);
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }

  const latencies = results.map((result) => result.latencyMs);
  const successCount = statusCounts["200"] ?? 0;
  const rateLimitedCount = statusCounts["429"] ?? 0;
  const serverErrorCount = results.filter((result) => result.status >= 500).length;
  const unexpected4xxCount = results.filter(
    (result) => result.status >= 400 && result.status < 500 && result.status !== 429,
  ).length;
  const timeoutCount = results.filter((result) => result.timedOut).length;
  const networkErrorCount = results.filter((result) => result.networkError).length;
  const boundaryViolationCount = results.filter((result) => !result.executionBoundaryOk).length;
  const responseSecurityViolationCount = results.filter((result) => !result.responseSecurityOk).length;
  const nonJsonCount = results.filter(
    (result) => result.status !== 0 && !result.parseableJson,
  ).length;
  const latency = {
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    max: latencies.length ? Number(Math.max(...latencies).toFixed(2)) : null,
  };
  const latencyWithinSlo = latencySloPass(latency, target.maxP95Ms, target.maxP99Ms);

  const pass =
    successCount > 0 &&
    serverErrorCount === 0 &&
    unexpected4xxCount === 0 &&
    timeoutCount === 0 &&
    networkErrorCount === 0 &&
    boundaryViolationCount === 0 &&
    responseSecurityViolationCount === 0 &&
    nonJsonCount === 0 &&
    latencyWithinSlo &&
    (target.allow429 || rateLimitedCount === 0);

  return {
    suite: "risk-gate-staging-http-load-v1",
    generated_at: new Date().toISOString(),
    target: {
      host: target.baseUrl.host,
      endpoint_path: target.endpoint.pathname,
      mode: target.mode,
      country_iso3: target.countryIso3,
      corridor_origin_iso3: target.corridorOriginIso3,
      corridor_destination_iso3: target.corridorDestinationIso3,
    },
    workload: {
      total_requests: target.totalRequests,
      concurrency: target.concurrency,
      timeout_ms: target.timeoutMs,
      allow_429: target.allow429,
      redirect_policy: "error",
    },
    prelaunch_slo_ms: {
      max_p95: target.maxP95Ms,
      max_p99: target.maxP99Ms,
    },
    duration_ms: Number(durationMs.toFixed(2)),
    throughput_requests_per_second: Number(
      (target.totalRequests / (durationMs / 1000)).toFixed(2),
    ),
    latency_ms: latency,
    status_counts: statusCounts,
    correctness: {
      successful_200: successCount,
      rate_limited_429: rateLimitedCount,
      unexpected_4xx: unexpected4xxCount,
      server_errors_5xx: serverErrorCount,
      timeouts: timeoutCount,
      network_errors: networkErrorCount,
      non_json_responses: nonJsonCount,
      execution_boundary_violations: boundaryViolationCount,
      response_security_violations: responseSecurityViolationCount,
      latency_slo_violations: latencyWithinSlo ? 0 : 1,
    },
    exclusions: [
      "production traffic",
      "real customer actions",
      "real payment execution",
      "browser rendering",
      "external third-party security certification",
    ],
    pass,
  };
}

export function runSelfTest() {
  const valid = validateStagingLoadTarget({
    baseUrl: "https://geomacro-staging.example.test",
    acknowledgement: "STAGING_ONLY",
    countryIso3: "usa",
    mode: "mixed",
    corridorOriginIso3: "usa",
    corridorDestinationIso3: "chn",
    totalRequests: 20,
    concurrency: 4,
    timeoutMs: 5000,
    allow429: false,
  });

  if (
    valid.countryIso3 !== "USA" ||
    valid.corridorOriginIso3 !== "USA" ||
    valid.corridorDestinationIso3 !== "CHN" ||
    valid.maxP95Ms !== DEFAULT_MAX_P95_MS ||
    valid.maxP99Ms !== DEFAULT_MAX_P99_MS
  ) {
    throw new Error("Self-test normalization or default SLO failed");
  }

  for (const productionUrl of ["https://geomacro.live", "https://www.geomacro.live/"]) {
    let blocked = false;
    try {
      validateStagingLoadTarget({
        baseUrl: productionUrl,
        acknowledgement: "STAGING_ONLY",
        countryIso3: "USA",
        mode: "country",
        totalRequests: 1,
        concurrency: 1,
        timeoutMs: 5000,
        allow429: false,
      });
    } catch (error) {
      blocked =
        error instanceof Error &&
        error.message.includes("Production Geomacro host is blocked");
    }
    if (!blocked) throw new Error(`Self-test production guard failed for ${productionUrl}`);
  }

  if (!executionBoundaryIsExplicitlyFalse({ execution_authorized: false })) {
    throw new Error("Self-test failed explicit execution boundary acceptance");
  }
  if (executionBoundaryIsExplicitlyFalse({ ok: true })) {
    throw new Error("Self-test incorrectly accepted a missing execution boundary");
  }
  if (!findSensitiveResponseKey({ nested: { service_role_key: "never" } })) {
    throw new Error("Self-test failed sensitive response key detection");
  }
  if (!latencySloPass({ p95: 2500, p99: 7000 }, 3000, 8000)) {
    throw new Error("Self-test rejected valid prelaunch latency evidence");
  }
  if (latencySloPass({ p95: 3500, p99: 7000 }, 3000, 8000)) {
    throw new Error("Self-test accepted p95 latency above prelaunch SLO");
  }
  if (latencySloPass({ p95: 2500, p99: 9000 }, 3000, 8000)) {
    throw new Error("Self-test accepted p99 latency above prelaunch SLO");
  }

  console.log("PASS: staging load harness self-test");
}

async function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const target = validateStagingLoadTarget({
    baseUrl: envString("RISK_GATE_STAGING_BASE_URL"),
    acknowledgement: envString("RISK_GATE_LOAD_TEST_ACK"),
    countryIso3: envString("RISK_GATE_LOAD_TEST_COUNTRY_ISO3"),
    mode: envString("RISK_GATE_LOAD_TEST_MODE", false) || "country",
    corridorOriginIso3: envString("RISK_GATE_LOAD_TEST_CORRIDOR_ORIGIN_ISO3", false),
    corridorDestinationIso3: envString(
      "RISK_GATE_LOAD_TEST_CORRIDOR_DESTINATION_ISO3",
      false,
    ),
    totalRequests: envInteger("RISK_GATE_LOAD_TEST_REQUESTS", 60, 1, MAX_REQUESTS),
    concurrency: envInteger("RISK_GATE_LOAD_TEST_CONCURRENCY", 5, 1, MAX_CONCURRENCY),
    timeoutMs: envInteger(
      "RISK_GATE_LOAD_TEST_TIMEOUT_MS",
      DEFAULT_TIMEOUT_MS,
      1000,
      MAX_TIMEOUT_MS,
    ),
    allow429: envBoolean("RISK_GATE_LOAD_TEST_ALLOW_429", false),
    maxP95Ms: envInteger(
      "RISK_GATE_LOAD_TEST_MAX_P95_MS",
      DEFAULT_MAX_P95_MS,
      1,
      MAX_TIMEOUT_MS,
    ),
    maxP99Ms: envInteger(
      "RISK_GATE_LOAD_TEST_MAX_P99_MS",
      DEFAULT_MAX_P99_MS,
      1,
      MAX_TIMEOUT_MS,
    ),
  });

  const apiKey = envString("RISK_GATE_STAGING_API_KEY");
  if (apiKey.length < 32 || apiKey.length > 512) {
    throw new Error("RISK_GATE_STAGING_API_KEY has invalid length");
  }

  const report = await runLoadTest(target, apiKey);
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/risk-gate-staging-http-load.json",
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}

await main();
