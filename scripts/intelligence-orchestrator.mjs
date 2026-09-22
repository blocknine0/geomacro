#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const APP_SUPABASE_URL = String(process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
const APP_SUPABASE_SERVICE_ROLE_KEY = String(
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
).trim();

if (!APP_SUPABASE_URL || !APP_SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("AUTHORITATIVE_SUPABASE_CREDENTIALS_REQUIRED");
}

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const CONTROL_SOURCE = "geomacro_intelligence_orchestrator";
const STATE_SOURCE = CONTROL_SOURCE;
const STATE_PREFIX = "orchestrator:";
const MAX_TASKS_PER_TICK = Math.max(1, Math.min(8, Number(process.env.INTELLIGENCE_ORCHESTRATOR_MAX_TASKS ?? 3)));
const RETRY_SECONDS = Math.max(60, Math.min(900, Number(process.env.INTELLIGENCE_ORCHESTRATOR_RETRY_SECONDS ?? 300)));
const TASK_TIMEOUT_MS = Math.max(60_000, Math.min(3_600_000, Number(process.env.INTELLIGENCE_ORCHESTRATOR_TASK_TIMEOUT_MS ?? 1_500_000)));

function projectRef(url) {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

if (projectRef(APP_SUPABASE_URL) !== PROJECT_REF) {
  throw new Error("NON_AUTHORITATIVE_SUPABASE_PROJECT");
}

const db = createClient(APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TASKS = [
  {
    key: "gdelt_gal",
    cadenceSeconds: 900,
    offsetSeconds: 0,
    priority: 10,
    timeoutMs: 1_200_000,
    requiredEnv: ["LIVE_STRUCTURE_TOKEN"],
    steps: [
      ["bun", ["scripts/sync-gdelt-gal-production.mjs"], "."],
      ["node", ["scripts/drain-live-structure.mjs"], "."],
      ["node", ["scripts/reconcile-structured-event-commercial-rights.mjs"], "."],
      ["bun", ["scripts/audit-agent-hot-topic-readiness.ts", "--require-pipeline-healthy"], "."],
    ],
  },
  {
    key: "gdelt_v2",
    cadenceSeconds: 900,
    offsetSeconds: 180,
    priority: 11,
    timeoutMs: 900_000,
    steps: [["bun", ["scripts/ingest-gdelt-v2-events-live.mjs", "--write"], "."]],
  },
  {
    key: "open_realtime_mesh",
    cadenceSeconds: 900,
    offsetSeconds: 240,
    priority: 15,
    requiredEnv: ["LIVE_STRUCTURE_TOKEN"],
    timeoutMs: 1_200_000,
    steps: [
      ["bun", ["scripts/sync-open-live-source-mesh.mjs"], "."],
      ["node", ["scripts/drain-live-structure.mjs"], "."],
    ],
  },
  {
    key: "country_raw_mesh",
    cadenceSeconds: 900,
    offsetSeconds: 360,
    priority: 20,
    requiredEnv: ["LIVE_STRUCTURE_TOKEN"],
    timeoutMs: 1_500_000,
    steps: [
      ["bash", ["-lc", "bun scripts/sync-country-raw-source-mesh.mjs | tee country-raw-source-sync.json"], "."],
      ["node", ["scripts/drain-live-structure.mjs", "--fragment-ids-file", "country-raw-source-sync.json"], "."],
      ["bun", ["scripts/audit-global-raw-source-coverage.mjs"], "."],
      ["bun", ["scripts/audit-global-raw-source-runtime.mjs"], "."],
    ],
  },
  {
    key: "rss_live",
    cadenceSeconds: 900,
    offsetSeconds: 540,
    priority: 30,
    oidcAudience: "https://geomacro.live/actions/live-flash-rss",
    requiredEnv: [],
    timeoutMs: 1_200_000,
    steps: [["node", ["scripts/run-rss-live-cycle.mjs"], "."]],
  },
  {
    key: "realtime_fanout",
    cadenceSeconds: 900,
    offsetSeconds: 720,
    priority: 40,
    timeoutMs: 900_000,
    steps: [
      ["bun", ["scripts/sync-realtime-scope-fanout.mjs"], "."],
      ["bun", ["scripts/audit-realtime-scope-fanout.mjs"], "."],
    ],
  },
  {
    key: "telegram_discovery",
    cadenceSeconds: 1800,
    offsetSeconds: 900,
    priority: 50,
    requiredEnv: ["TELEGRAM_API_ID", "TELEGRAM_API_HASH", "TELEGRAM_SESSION"],
    steps: [["python", ["workers/telegram-flash/global_discovery.py"], "."]],
  },
  {
    key: "news_ingest",
    cadenceSeconds: 7200,
    offsetSeconds: 1800,
    priority: 60,
    requiredEnv: ["GUARDIAN_API_KEY"],
    timeoutMs: 1_800_000,
    steps: [
      ["node", ["scripts/ingest-news.js"], "."],
      ["node", ["scripts/export-admitted-events-for-structure.mjs"], "."],
      ["node", ["scripts/invoke-live-structure-with-retry.mjs"], "."],
    ],
  },
  {
    key: "gri_publish",
    cadenceSeconds: 7200,
    offsetSeconds: 5400,
    priority: 70,
    requiredEnv: ["SUPABASE_SERVICE_ROLE_KEY"],
    enabled: () => String(process.env.GRI_PUBLISH_ENABLED ?? "").trim().toLowerCase() === "true",
    steps: [
      ["node", ["scripts/cluster-gri-stories-v12.js"], "."],
      ["node", ["scripts/compute-gri-v12.js"], "."],
      ["node", ["scripts/verify-gri-snapshot-v12.js"], "."],
      ["node", ["scripts/audit-gri-public-proof-consistency.mjs"], "."],
    ],
  },
  {
    key: "production_readiness",
    cadenceSeconds: 7200,
    offsetSeconds: 3600,
    priority: 85,
    timeoutMs: 1_500_000,
    steps: [
      ["bun", ["scripts/global-risk-gate-country-census.ts", "--require-any-accepted"], "."],
      ["node", ["scripts/audit-global-realtime-source-freshness.mjs"], "."],
      ["bun", ["scripts/audit-agent-hot-topic-readiness.ts", "--require-pipeline-healthy"], "."],
    ],
  },
  {
    key: "public_demo_refresh",
    cadenceSeconds: 3600,
    offsetSeconds: 900,
    priority: 90,
    timeoutMs: 1_200_000,
    requiredEnv: [
      "RISK_OBJECT_SIGNING_KEY_ID",
      "RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64",
    ],
    steps: [
      ["bun", ["scripts/refresh-public-demo-risk-objects.ts"], "."],
      ["node", ["scripts/verify-public-demo-live.mjs"], "."],
    ],
  },
  {
    key: "source_evidence",
    cadenceSeconds: 21600,
    offsetSeconds: 7200,
    priority: 80,
    requiredEnv: ["SUPABASE_DB_URL"],
    timeoutMs: 2_400_000,
    steps: [["bun", ["run", "source:certification:evidence-graph"], "."]],
  },
];

function alignedDueAt(task, nowMs) {
  const cadenceMs = task.cadenceSeconds * 1000;
  const offsetMs = ((task.offsetSeconds * 1000) % cadenceMs + cadenceMs) % cadenceMs;
  const epoch = Date.UTC(2026, 0, 1) + offsetMs;
  if (nowMs < epoch) return epoch;
  const slots = Math.floor((nowMs - epoch) / cadenceMs);
  return epoch + (slots + 1) * cadenceMs;
}

function isPast(value, nowMs) {
  const at = Date.parse(String(value ?? ""));
  return Number.isFinite(at) && at <= nowMs;
}

function hasAllEnv(requiredEnv = []) {
  return requiredEnv.every((name) => String(process.env[name] ?? "").trim().length > 0);
}

async function refreshOidcToken(audience) {
  if (!audience) return true;
  const requestUrl = String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL ?? "").trim();
  const requestToken = String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN ?? "").trim();
  if (!requestUrl || !requestToken) {
    return false;
  }

  const response = await fetch(
    `${requestUrl}&audience=${encodeURIComponent(audience)}`,
    { headers: { authorization: `bearer ${requestToken}` } },
  );
  if (!response.ok) return false;
  const payload = await response.json();
  const token = String(payload?.value ?? "").trim();
  if (!token) return false;
  process.env.GEOMACRO_FLASH_OIDC_TOKEN = token;
  return true;
}

function runStep(command, args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

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

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
    }, timeoutMs);

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        code,
        signal,
        timed_out: timedOut,
        stdout: stdout.slice(-6000),
        stderr: stderr.slice(-6000),
      });
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        signal: null,
        timed_out: false,
        stdout: stdout.slice(-6000),
        stderr: (stderr + "\n" + String(error?.message ?? error)).slice(-6000),
      });
    });
  });
}

async function loadStates() {
  const { data, error } = await db
    .from("live_ingestion_cursors")
    .select("stream_key,cursor,status,last_attempt_at,last_success_at,last_item_at,consecutive_failures,updated_at")
    .eq("source_key", STATE_SOURCE)
    .like("stream_key", `${STATE_PREFIX}%`);

  if (error) throw error;
  return new Map((data ?? []).map((row) => [String(row.stream_key), row]));
}

async function upsertState(task, state) {
  const payload = {
    source_key: STATE_SOURCE,
    stream_key: STATE_PREFIX + task.key,
    cursor: state.cursor ?? {},
    status: state.status ?? "unknown",
    last_attempt_at: state.last_attempt_at ?? null,
    last_success_at: state.last_success_at ?? null,
    last_item_at: state.last_item_at ?? null,
    consecutive_failures: Number(state.consecutive_failures ?? 0),
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("live_ingestion_cursors").upsert(payload, {
    onConflict: "source_key,stream_key",
  });
  if (error) throw error;
}

function normalizedState(task, row, nowMs) {
  const cursor = row?.cursor && typeof row.cursor === "object" ? row.cursor : {};
  let nextDueAt = cursor.next_due_at;
  if (!nextDueAt || !Number.isFinite(Date.parse(nextDueAt))) {
    nextDueAt = new Date(alignedDueAt(task, nowMs)).toISOString();
  }
  return {
    cursor: {
      ...cursor,
      cadence_seconds: task.cadenceSeconds,
      offset_seconds: task.offsetSeconds,
      next_due_at: nextDueAt,
      scheduler_source: CONTROL_SOURCE,
    },
    status: row?.status ?? "unknown",
    last_attempt_at: row?.last_attempt_at ?? null,
    last_success_at: row?.last_success_at ?? null,
    consecutive_failures: Number(row?.consecutive_failures ?? 0),
    last_error: cursor.last_error ?? null,
  };
}

function bootstrapStateForTask(task, nowMs) {
  const state = normalizedState(task, null, nowMs);

  // Missing or never-attempted seed state must never defer first-run recovery
  // behind the next aligned cadence. MAX_TASKS_PER_TICK bounds bootstrap execution.
  state.cursor.next_due_at = new Date(nowMs).toISOString();
  state.cursor.bootstrap_pending = true;
  return state;
}

function shouldBootstrapState(row) {
  if (!row) return true;
  const cursor = row?.cursor && typeof row.cursor === "object" ? row.cursor : {};

  // Recover rows created by the pre-fix bootstrap logic, but never re-bootstrap
  // a task that has already been attempted or explicitly disabled.
  if (cursor.bootstrap_pending === true) return true;
  if (cursor.bootstrap_pending === false) return false;
  if (row.status !== "unknown") return false;
  if (row.last_attempt_at || row.last_success_at) return false;
  if (cursor.skipped_reason === "task_disabled_by_configuration") return false;
  return true;
}

async function runTask(task, state) {
  const now = new Date().toISOString();
  state.cursor.bootstrap_pending = false;

  if (typeof task.enabled === "function" && !task.enabled()) {
    state.cursor.next_due_at = new Date(alignedDueAt(task, Date.now())).toISOString();
    state.cursor.skipped_reason = "task_disabled_by_configuration";
    await upsertState(task, { ...state, status: "unknown" });
    return { task: task.key, status: "disabled" };
  }

  if (!hasAllEnv(task.requiredEnv)) {
    state.cursor.next_due_at = new Date(Date.now() + RETRY_SECONDS * 1000).toISOString();
    state.cursor.skipped_reason = "required_environment_not_present";
    await upsertState(task, { ...state, status: "degraded", last_attempt_at: now });
    return { task: task.key, status: "degraded", reason: "required_environment_not_present" };
  }

  if (task.oidcAudience) {
    const tokenReady = await refreshOidcToken(task.oidcAudience);
    if (!tokenReady) {
      state.status = "degraded";
      state.consecutive_failures += 1;
      state.cursor.last_error = "OIDC_TOKEN_REFRESH_FAILED";
      state.cursor.retry_pending = true;
      state.cursor.next_due_at = new Date(Date.now() + RETRY_SECONDS * 1000).toISOString();
      await upsertState(task, state);
      return { task: task.key, status: "degraded", reason: "OIDC_TOKEN_REFRESH_FAILED" };
    }
  }

  state.cursor.next_due_at = new Date(Date.now() + RETRY_SECONDS * 1000).toISOString();
  state.cursor.retry_pending = true;
  state.last_attempt_at = now;
  await upsertState(task, state);

  const started = Date.now();
  let failedStep = null;
  let result = null;

  for (let index = 0; index < task.steps.length; index += 1) {
    const [command, args, cwd] = task.steps[index];
    result = await runStep(command, args, cwd, task.timeoutMs ?? TASK_TIMEOUT_MS);
    if (!result.ok) {
      failedStep = {
        index,
        command,
        args,
        cwd,
        exit_code: result.code,
        signal: result.signal,
        timed_out: result.timed_out,
        stderr: result.stderr,
      };
      break;
    }
  }

  if (failedStep) {
    const errorText = JSON.stringify(failedStep).slice(0, 6000);
    state.status = "degraded";
    state.consecutive_failures += 1;
    state.cursor.last_error = errorText;
    state.cursor.retry_pending = true;
    await upsertState(task, state);
    return {
      task: task.key,
      status: "degraded",
      duration_ms: Date.now() - started,
      failed_step: failedStep,
    };
  }

  state.status = "healthy";
  state.consecutive_failures = 0;
  state.last_success_at = new Date().toISOString();
  state.cursor.last_error = null;
  state.cursor.retry_pending = false;
  state.cursor.last_run_duration_ms = Date.now() - started;
  state.cursor.next_due_at = new Date(alignedDueAt(task, Date.now())).toISOString();
  await upsertState(task, state);

  return {
    task: task.key,
    status: "succeeded",
    duration_ms: Date.now() - started,
    next_due_at: state.cursor.next_due_at,
  };
}

async function main() {
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const states = await loadStates();

  // Seed missing task state as immediately due. This lets a first heartbeat
  // repair stale production freshness instead of waiting for a future slot.
  // MAX_TASKS_PER_TICK prevents the bootstrap from becoming a thundering herd.
  for (const task of TASKS) {
    const key = STATE_PREFIX + task.key;
    if (shouldBootstrapState(states.get(key))) {
      const state = bootstrapStateForTask(task, nowMs);
      await upsertState(task, state);
      states.set(key, {
        stream_key: key,
        cursor: state.cursor,
        status: state.status,
        last_attempt_at: null,
        last_success_at: null,
        consecutive_failures: 0,
      });
    }
  }

  const dueAll = TASKS
    .map((task) => ({ task, state: normalizedState(task, states.get(STATE_PREFIX + task.key), nowMs) }))
    .filter(({ task, state }) => isPast(state.cursor.next_due_at, nowMs))
    .sort((a, b) => a.task.priority - b.task.priority);
  const due = dueAll.slice(0, MAX_TASKS_PER_TICK);

  const results = [];
  for (const item of due) {
    results.push(await runTask(item.task, item.state));
  }

  const deferredCount = Math.max(0, dueAll.length - MAX_TASKS_PER_TICK);
  const summary = {
    ok: true,
    orchestrator: CONTROL_SOURCE,
    generated_at: now,
    project_ref: PROJECT_REF,
    heartbeat_seconds: 900,
    max_tasks_per_tick: MAX_TASKS_PER_TICK,
    due_task_count: due.length,
    results,
    source_failures_are_recorded_as_degraded: true,
    scheduler_internal_failures_remain_fail_closed: true,
    bootstrap_seeds_are_immediately_due: true,
    deferred_count: deferredCount,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("INTELLIGENCE_ORCHESTRATOR_FAILED");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
