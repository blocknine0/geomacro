#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const PRODUCTION_HOSTS = new Set(["geomacro.live", "www.geomacro.live"]);
const MAX_REQUESTS_PER_ENDPOINT = 300;
const MAX_CONCURRENCY = 20;
const MAX_TIMEOUT_MS = 30_000;

function env(name, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function envInt(name, fallback, min, max) {
  const raw = env(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer within ${min}..${max}`);
  }
  return value;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return Number(sorted[index].toFixed(2));
}

function validateTarget() {
  if (env("GEOMACRO_AGENTIC_RESILIENCE_ACK") !== "STAGING_ONLY") {
    throw new Error(
      "GEOMACRO_AGENTIC_RESILIENCE_ACK must equal STAGING_ONLY",
    );
  }

  const rawBaseUrl = env("GEOMACRO_AGENTIC_STAGING_BASE_URL");
  if (!rawBaseUrl) {
    throw new Error("GEOMACRO_AGENTIC_STAGING_BASE_URL is required");
  }

  let baseUrl;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error("GEOMACRO_AGENTIC_STAGING_BASE_URL must be a valid URL");
  }

  const host = baseUrl.hostname.toLowerCase();
  if (PRODUCTION_HOSTS.has(host)) {
    throw new Error("Production Geomacro host is blocked by the resilience harness");
  }

  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (baseUrl.protocol !== "https:" && !isLocal) {
    throw new Error("Staging target must use HTTPS unless it is localhost");
  }

  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error(
      "Staging base URL must not contain credentials, query parameters or fragments",
    );
  }

  const expectedHost = env("GEOMACRO_AGENTIC_STAGING_EXPECTED_HOST");
  if (!expectedHost) {
    throw new Error("GEOMACRO_AGENTIC_STAGING_EXPECTED_HOST is required");
  }
  if (baseUrl.host !== expectedHost) {
    throw new Error(
      `Staging host mismatch: expected ${expectedHost}, received ${baseUrl.host}`,
    );
  }

  return {
    baseUrl,
    requestsPerEndpoint: envInt(
      "GEOMACRO_AGENTIC_RESILIENCE_REQUESTS",
      40,
      1,
      MAX_REQUESTS_PER_ENDPOINT,
    ),
    concurrency: envInt(
      "GEOMACRO_AGENTIC_RESILIENCE_CONCURRENCY",
      8,
      1,
      MAX_CONCURRENCY,
    ),
    timeoutMs: envInt(
      "GEOMACRO_AGENTIC_RESILIENCE_TIMEOUT_MS",
      10_000,
      1_000,
      MAX_TIMEOUT_MS,
    ),
    outputPath: env(
      "GEOMACRO_AGENTIC_RESILIENCE_OUTPUT",
      `artifacts/agentic-resilience/${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    ),
  };
}

function requestBody(index) {
  const corridor = index % 2 === 1;
  return corridor
    ? {
        subject: {
          type: "corridor",
          origin_country_iso3: "USA",
          destination_country_iso3: "CHN",
        },
        policy_preset: "cautious",
        action_type: "agent_payment",
        amount_usdc: 10_000,
        client_request_id: `resilience-corridor-${index}`,
      }
    : {
        subject: {
          type: "country",
          country_iso3: "USA",
        },
        policy_preset: "cautious",
        action_type: "exposure_review",
        amount_usdc: 10_000,
        client_request_id: `resilience-country-${index}`,
      };
}

function boundaryIsFalse(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (payload.execution_authorized === false) return true;
  if (
    payload.risk_gate &&
    typeof payload.risk_gate === "object" &&
    payload.risk_gate.execution_authorized === false
  ) {
    return true;
  }
  if (
    payload.boundaries &&
    typeof payload.boundaries === "object" &&
    payload.boundaries.execution_authorized === false
  ) {
    return true;
  }
  return false;
}

async function issue(target, endpointPath, expectedPrimaryStatus, index) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), target.timeoutMs);
  const started = performance.now();

  try {
    const response = await fetch(new URL(endpointPath, target.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "geomacro-agentic-staging-resilience/1.0",
      },
      body: JSON.stringify(requestBody(index)),
      signal: controller.signal,
    });

    const latencyMs = performance.now() - started;
    let payload = null;
    let parseableJson = false;
    try {
      payload = await response.json();
      parseableJson = true;
    } catch {
      parseableJson = false;
    }

    const allowedStatus =
      response.status === expectedPrimaryStatus || response.status === 429;
    const paymentRequiredHeader =
      endpointPath === "/api/agent/risk" && response.status === 402
        ? Boolean(response.headers.get("payment-required"))
        : true;

    return {
      status: response.status,
      latencyMs,
      parseableJson,
      allowedStatus,
      boundaryOk: parseableJson ? boundaryIsFalse(payload) : false,
      paymentRequiredHeader,
      timedOut: false,
      networkError: false,
    };
  } catch (error) {
    const latencyMs = performance.now() - started;
    const timedOut =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    return {
      status: 0,
      latencyMs,
      parseableJson: false,
      allowedStatus: false,
      boundaryOk: false,
      paymentRequiredHeader: false,
      timedOut,
      networkError: !timedOut,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runEndpoint(target, config) {
  const results = new Array(target.requestsPerEndpoint);
  let next = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= target.requestsPerEndpoint) return;
      results[index] = await issue(
        target,
        config.path,
        config.primaryStatus,
        index,
      );
    }
  }

  const started = performance.now();
  await Promise.all(
    Array.from(
      { length: Math.min(target.concurrency, target.requestsPerEndpoint) },
      () => worker(),
    ),
  );
  const durationMs = performance.now() - started;

  const statusCounts = {};
  for (const result of results) {
    statusCounts[String(result.status)] =
      (statusCounts[String(result.status)] || 0) + 1;
  }

  const primaryCount = statusCounts[String(config.primaryStatus)] || 0;
  const rateLimitedCount = statusCounts["429"] || 0;
  const serverErrorCount = results.filter((r) => r.status >= 500).length;
  const timeoutCount = results.filter((r) => r.timedOut).length;
  const networkErrorCount = results.filter((r) => r.networkError).length;
  const nonJsonCount = results.filter(
    (r) => r.status !== 0 && !r.parseableJson,
  ).length;
  const disallowedStatusCount = results.filter((r) => !r.allowedStatus).length;
  const boundaryViolationCount = results.filter((r) => !r.boundaryOk).length;
  const missingPaymentHeaderCount = results.filter(
    (r) => !r.paymentRequiredHeader,
  ).length;
  const latencies = results.map((r) => r.latencyMs);

  const pass =
    primaryCount > 0 &&
    serverErrorCount === 0 &&
    timeoutCount === 0 &&
    networkErrorCount === 0 &&
    nonJsonCount === 0 &&
    disallowedStatusCount === 0 &&
    boundaryViolationCount === 0 &&
    missingPaymentHeaderCount === 0;

  return {
    endpoint: config.path,
    expected_primary_status: config.primaryStatus,
    requests: target.requestsPerEndpoint,
    concurrency: Math.min(target.concurrency, target.requestsPerEndpoint),
    duration_ms: Number(durationMs.toFixed(2)),
    requests_per_second: Number(
      ((target.requestsPerEndpoint / durationMs) * 1000).toFixed(2),
    ),
    status_counts: statusCounts,
    primary_count: primaryCount,
    rate_limited_count: rateLimitedCount,
    server_error_count: serverErrorCount,
    timeout_count: timeoutCount,
    network_error_count: networkErrorCount,
    non_json_count: nonJsonCount,
    disallowed_status_count: disallowedStatusCount,
    boundary_violation_count: boundaryViolationCount,
    missing_payment_required_header_count: missingPaymentHeaderCount,
    latency_ms: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: latencies.length
        ? Number(Math.max(...latencies).toFixed(2))
        : null,
    },
    pass,
  };
}

async function main() {
  const target = validateTarget();
  const suites = [];

  suites.push(
    await runEndpoint(target, {
      path: "/api/demo/preflight",
      primaryStatus: 200,
    }),
  );
  suites.push(
    await runEndpoint(target, {
      path: "/api/agent/risk",
      primaryStatus: 402,
    }),
  );

  const report = {
    suite: "geomacro-agentic-staging-resilience-v1",
    generated_at: new Date().toISOString(),
    target: {
      host: target.baseUrl.host,
      protocol: target.baseUrl.protocol,
    },
    payment_performed: false,
    production_hosts_blocked: [...PRODUCTION_HOSTS],
    suites,
    pass: suites.every((suite) => suite.pass),
  };

  const outputPath = resolve(target.outputPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(report, null, 2));
  console.log(`Evidence written to ${outputPath}`);

  if (!report.pass) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
