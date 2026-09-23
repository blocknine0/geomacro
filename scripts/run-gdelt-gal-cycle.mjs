#!/usr/bin/env node

import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const OUTPUT_DIR = String(process.env.GDELT_GAL_CYCLE_OUTPUT_DIR ?? "gdelt-gal-cycle").trim();
const MAX_ATTEMPTS = Math.max(1, Math.min(4, Number(process.env.GDELT_GAL_CYCLE_MAX_ATTEMPTS ?? 3)));
const BACKOFF_SECONDS = Math.max(5, Math.min(300, Number(process.env.GDELT_GAL_CYCLE_BACKOFF_SECONDS ?? 30)));
const CYCLE_START = new Date().toISOString();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", (error) => resolve({
      ok: false,
      exit_code: null,
      signal: null,
      stdout,
      stderr: (stderr + "\n" + String(error?.message ?? error)).trim(),
    }));
    child.on("close", (code, signal) => resolve({
      ok: code === 0,
      exit_code: code,
      signal,
      stdout,
      stderr,
    }));
  });
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function syncFailureIsRetryable(payload) {
  const failureClass = String(payload?.failure_class ?? "");
  const status = String(payload?.status ?? "");
  return failureClass === "UPSTREAM_TEMPORARY_OUTAGE"
    || failureClass === "UPSTREAM_SOURCE_DELAYED"
    || status === "no_new_gdelt_file";
}

async function runSyncAttempt(attempt) {
  const responseFile = `${OUTPUT_DIR}/sync-${attempt}.json`;
  const result = await run("bun", ["scripts/sync-gdelt-gal-production.mjs"], {
    GDELT_GAL_SYNC_OUTPUT: responseFile,
  });
  const payload = await readJson(responseFile);
  await writeJson(`${OUTPUT_DIR}/sync-${attempt}-execution.json`, {
    attempt,
    started_at: new Date().toISOString(),
    exit_code: result.exit_code,
    signal: result.signal,
    ok: result.ok,
    stdout_tail: result.stdout.slice(-4000),
    stderr_tail: result.stderr.slice(-4000),
  });
  return { result, payload };
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const attempts = [];
  let sync = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    sync = await runSyncAttempt(attempt);
    attempts.push({
      attempt,
      ok: sync.result.ok,
      status: sync.payload?.status ?? null,
      failure_class: sync.payload?.failure_class ?? null,
      latest_source_stamp: sync.payload?.latest_source_stamp ?? null,
    });

    if (sync.result.ok && sync.payload?.status === "sealed") break;

    if (attempt < MAX_ATTEMPTS && syncFailureIsRetryable(sync.payload)) {
      const backoffMs = BACKOFF_SECONDS * attempt * 1000;
      console.error(
        `GDELT GAL upstream not ready; retrying attempt ${attempt + 1}/${MAX_ATTEMPTS} after ${backoffMs / 1000}s backoff.`,
      );
      await sleep(backoffMs);
      continue;
    }
    break;
  }

  const syncPayload = sync?.payload;

  // A late GDELT release must not turn the heartbeat RED while the previously
  // sealed first-break cycle remains within the strict 30-minute freshness window.
  if (!sync?.result?.ok || syncPayload?.status !== "sealed") {
    if (String(syncPayload?.failure_class ?? "") === "UPSTREAM_SOURCE_DELAYED") {
      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl = String(process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
      const supabaseKey = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
      if (supabaseUrl && supabaseKey && new URL(supabaseUrl).hostname.split(".")[0] === PROJECT_REF) {
        const db = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: cursor } = await db
          .from("live_ingestion_cursors")
          .select("status,last_success_at,consecutive_failures")
          .eq("source_key", SOURCE_KEY)
          .eq("stream_key", STREAM_KEY)
          .maybeSingle();
        const lastSuccessMs = Date.parse(String(cursor?.last_success_at ?? ""));
        const ageSeconds = Number.isFinite(lastSuccessMs)
          ? Math.max(0, (Date.now() - lastSuccessMs) / 1000)
          : Number.POSITIVE_INFINITY;
        const priorCycleFresh =
          ageSeconds <= 1800 &&
          ["healthy", "degraded"].includes(String(cursor?.status ?? "")) &&
          Number(cursor?.consecutive_failures ?? 0) === 0;

        if (priorCycleFresh) {
          const summary = {
            ok: true,
            status: "fresh_prior_cycle",
            failure_class: "UPSTREAM_SOURCE_DELAYED",
            accepted_without_new_fragment: true,
            freshness_window_seconds: 1800,
            prior_cycle_age_seconds: Math.round(ageSeconds),
            last_success_at: cursor.last_success_at,
            attempts,
          };
          await writeJson(OUTPUT_DIR + "/gdelt-gal-cycle-summary.json", summary);
          console.log(JSON.stringify(summary));
          return;
        }
      }
    }

    const failureClass = syncPayload?.failure_class
      ?? (syncFailureIsRetryable(syncPayload) ? "UPSTREAM_TEMPORARY_OUTAGE" : "PIPELINE_FAILURE");
    const summary = {
      ok: false,
      stage: "gdelt_gal_sync",
      failure_class: failureClass,
      attempts,
      cycle_started_at: CYCLE_START,
      latest_source_stamp: syncPayload?.latest_source_stamp ?? null,
      retry_after_seconds: BACKOFF_SECONDS,
      message: syncPayload?.detail ?? "GDELT GAL ingestion did not produce a fresh fragment",
    };
    await writeJson(`${OUTPUT_DIR}/gdelt-gal-cycle-summary.json`, summary);
    console.error(`GDELT_GAL_FAILURE_CLASS=${failureClass}`);
    process.exit(1);
  }

  const fragmentIdsFile = `${OUTPUT_DIR}/fragment-ids.json`;
  await writeJson(fragmentIdsFile, [String(syncPayload.fragment_id)]);

  const structure = await run(
    "node",
    ["scripts/drain-live-structure.mjs", "--fragment-ids-file", fragmentIdsFile],
    {
      GDELT_GAL_CYCLE_STARTED_AT: CYCLE_START,
      GDELT_GAL_EXPECTED_FRAGMENT_ID: String(syncPayload.fragment_id),
    },
  );
  await writeFile(`${OUTPUT_DIR}/structure.log`, structure.stdout + structure.stderr, "utf8");
  if (!structure.ok) {
    const summary = {
      ok: false,
      stage: "structure",
      failure_class: "PIPELINE_FAILURE",
      attempts,
      cycle_started_at: CYCLE_START,
      fragment_id: syncPayload.fragment_id,
      latest_source_stamp: syncPayload.latest_source_stamp ?? null,
      message: "Live structure drain failed",
    };
    await writeJson(`${OUTPUT_DIR}/gdelt-gal-cycle-summary.json`, summary);
    console.error("GDELT_GAL_FAILURE_CLASS=PIPELINE_FAILURE");
    process.exit(1);
  }

  const reconcile = await run("node", ["scripts/reconcile-structured-event-commercial-rights.mjs"], {
    RECONCILE_SOURCE_KEYS: "gdelt_gal",
    RECONCILE_LOOKBACK_MINUTES: "120",
  });
  await writeFile(`${OUTPUT_DIR}/reconcile.log`, reconcile.stdout + reconcile.stderr, "utf8");
  if (!reconcile.ok) {
    const summary = {
      ok: false,
      stage: "eligibility_reconciliation",
      failure_class: "PIPELINE_FAILURE",
      attempts,
      cycle_started_at: CYCLE_START,
      fragment_id: syncPayload.fragment_id,
      latest_source_stamp: syncPayload.latest_source_stamp ?? null,
      message: "Structured-event commercial eligibility reconciliation failed",
    };
    await writeJson(`${OUTPUT_DIR}/gdelt-gal-cycle-summary.json`, summary);
    console.error("GDELT_GAL_FAILURE_CLASS=PIPELINE_FAILURE");
    process.exit(1);
  }

  const hotTopicOutput = `${OUTPUT_DIR}/agent-hot-topic-readiness.json`;
  const audit = await run(
    "bun",
    ["scripts/audit-agent-hot-topic-readiness.ts", "--require-pipeline-healthy"],
    { AGENT_HOT_TOPIC_READINESS_OUTPUT: hotTopicOutput },
  );
  await writeFile(`${OUTPUT_DIR}/hot-topic-audit.log`, audit.stdout + audit.stderr, "utf8");
  const auditPayload = await readJson(hotTopicOutput);
  if (!audit.ok) {
    const summary = {
      ok: false,
      stage: "hot_topic_readiness",
      failure_class: "PIPELINE_FAILURE",
      attempts,
      cycle_started_at: CYCLE_START,
      fragment_id: syncPayload.fragment_id,
      latest_source_stamp: syncPayload.latest_source_stamp ?? null,
      hot_topic_pipeline: auditPayload?.pipeline ?? null,
      message: "Hot-topic readiness audit failed",
    };
    await writeJson(`${OUTPUT_DIR}/gdelt-gal-cycle-summary.json`, summary);
    console.error("GDELT_GAL_FAILURE_CLASS=PIPELINE_FAILURE");
    process.exit(1);
  }

  const verify = await run(
    "node",
    ["scripts/verify-gdelt-gal-cycle.mjs"],
    {
      GDELT_GAL_CYCLE_STARTED_AT: CYCLE_START,
      GDELT_GAL_EXPECTED_FRAGMENT_ID: String(syncPayload.fragment_id),
      GDELT_GAL_EXPECTED_SOURCE_STAMP: String(syncPayload.latest_source_stamp ?? ""),
      GDELT_GAL_HOT_TOPIC_OUTPUT: hotTopicOutput,
    },
  );
  await writeFile(`${OUTPUT_DIR}/cycle-verification.log`, verify.stdout + verify.stderr, "utf8");
  if (!verify.ok) {
    const summary = {
      ok: false,
      stage: "cycle_verification",
      failure_class: "PIPELINE_FAILURE",
      attempts,
      cycle_started_at: CYCLE_START,
      fragment_id: syncPayload.fragment_id,
      latest_source_stamp: syncPayload.latest_source_stamp ?? null,
      message: "Fresh-cycle verification failed",
    };
    await writeJson(`${OUTPUT_DIR}/gdelt-gal-cycle-summary.json`, summary);
    console.error("GDELT_GAL_FAILURE_CLASS=PIPELINE_FAILURE");
    process.exit(1);
  }

  const verification = await readJson(`${OUTPUT_DIR}/cycle-verification.json`);
  const summary = {
    ok: true,
    status: "healthy",
    source_key: "gdelt_gal",
    stream_key: "global-relevant",
    cycle_started_at: CYCLE_START,
    attempts,
    fragment_id: syncPayload.fragment_id,
    latest_source_stamp: syncPayload.latest_source_stamp ?? null,
    verification,
    hot_topic_pipeline: auditPayload?.pipeline ?? null,
    retry_contract: {
      upstream_temporary_outage_retries_with_backoff: true,
      orchestrator_retry_after_seconds: Number(process.env.INTELLIGENCE_ORCHESTRATOR_RETRY_SECONDS ?? 300),
      pipeline_failures_are_not_misclassified_as_upstream_outages: true,
    },
  };
  await writeJson(`${OUTPUT_DIR}/gdelt-gal-cycle-summary.json`, summary);
  console.log(JSON.stringify(summary, null, 2));
  console.log("PASS: GDELT GAL FRESH CYCLE COMPLETE; CURSOR, FRAGMENT, STRUCTURE, RIGHTS AND HOT-TOPIC HEALTH VERIFIED");
}

main().catch(async (error) => {
  const summary = {
    ok: false,
    stage: "orchestrator_wrapper",
    failure_class: "PIPELINE_FAILURE",
    cycle_started_at: CYCLE_START,
    message: error instanceof Error ? error.message : String(error),
  };
  try {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeJson(`${OUTPUT_DIR}/gdelt-gal-cycle-summary.json`, summary);
  } catch {}
  console.error("GDELT_GAL_FAILURE_CLASS=PIPELINE_FAILURE");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
