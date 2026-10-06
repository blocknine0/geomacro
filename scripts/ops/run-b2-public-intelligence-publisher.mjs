#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const PUBLISHER = "scripts/ops/publish-b2-public-intelligence-direct-postgres.mjs";
const COVERAGE_REFRESHER = "scripts/ops/refresh-gdelt-coverage-runtime-after-b2.mjs";
const RETRYABLE_AVAILABILITY_ERROR = "CURRENT_GDELT_EXPORT_UNAVAILABLE";
const DEFAULT_MAX_WAIT_MS = 8 * 60 * 1000;
const DEFAULT_POLL_MS = 10_000;

function positiveInteger(raw, fallback, name) {
  const value = raw == null || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

const maxWaitMs = positiveInteger(
  process.env.GDELT_MAX_AVAILABILITY_WAIT_MS,
  DEFAULT_MAX_WAIT_MS,
  "GDELT_MAX_AVAILABILITY_WAIT_MS",
);
const pollMs = positiveInteger(
  process.env.GDELT_AVAILABILITY_POLL_MS,
  DEFAULT_POLL_MS,
  "GDELT_AVAILABILITY_POLL_MS",
);
const deadline = Date.now() + maxWaitMs;
let attempt = 0;

while (true) {
  attempt += 1;
  const result = spawnSync("bun", [PUBLISHER], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status === 0) {
    const proof = String(result.stdout ?? "")
      .split(/\\r?\\n/u)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line);
          return parsed?.schema === "geomacro.public-intelligence-direct-postgres-publish.v2" ? [parsed] : [];
        } catch {
          return [];
        }
      })
      .at(-1);
    if (!proof) {
      console.error("PUBLIC_INTELLIGENCE_PUBLISHER_PROOF_MISSING");
      process.exit(1);
    }

    const sourceTransport = String(proof.current_source_transport ?? "");
    let coverageRuntimeRefreshed = false;
    if (sourceTransport === "event_export") {
      const refresh = spawnSync("bun", [COVERAGE_REFRESHER], {
        encoding: "utf8",
        env: process.env,
        maxBuffer: 8 * 1024 * 1024,
      });
      if (refresh.stdout) process.stdout.write(refresh.stdout);
      if (refresh.stderr) process.stderr.write(refresh.stderr);
      if (refresh.status !== 0) {
        console.error("GDELT_COVERAGE_RUNTIME_REFRESH_FAILED");
        process.exit(refresh.status ?? 1);
      }
      coverageRuntimeRefreshed = true;
    } else if (sourceTransport !== "doc_v2_articlelist") {
      console.error("GDELT_CURRENT_SOURCE_TRANSPORT_INVALID");
      process.exit(1);
    }

    console.log(JSON.stringify({
      ok: true,
      schema: "geomacro.public-intelligence-publisher-availability.v2",
      attempts: attempt,
      bounded_wait: true,
      retry_reason: RETRYABLE_AVAILABILITY_ERROR,
      current_source_transport: sourceTransport,
      coverage_runtime_refreshed: coverageRuntimeRefreshed,
    }));
    process.exit(0);
  }

  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (!combined.includes(RETRYABLE_AVAILABILITY_ERROR)) {
    process.exit(result.status ?? 1);
  }

  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    console.error("CURRENT_GDELT_AVAILABILITY_WAIT_EXHAUSTED");
    process.exit(1);
  }

  const sleepMs = Math.min(pollMs, remainingMs);
  console.log(JSON.stringify({
    ok: false,
    retrying: true,
    reason: RETRYABLE_AVAILABILITY_ERROR,
    attempt,
    sleep_ms: sleepMs,
    remaining_ms: remainingMs,
  }));
  await new Promise((resolve) => setTimeout(resolve, sleepMs));
}
