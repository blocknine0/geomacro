#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createD1ControlPlaneStateClient } from "./lib/d1-control-plane-state.mjs";
import { officialSourcePollCursorOutcome } from "./lib/official-source-poll-cursor.mjs";
import {
  DEFAULT_HEARTBEAT_BUDGET_MS,
  DEFAULT_HEARTBEAT_RESERVE_MS,
  DEFAULT_MAX_TASKS_PER_TICK,
  orderDueTasks,
  taskFitsWithinBudget,
} from "./lib/intelligence-scheduler.mjs";

// Canonical scheduler/control-plane authority is Cloudflare D1 directly.
// Never require or synthesize a Supabase service role for orchestration.
const PROJECT_REF = "ldpwajisioljyjtojvfx";
const CONTROL_SOURCE = "geomacro_intelligence_orchestrator";
const STATE_SOURCE = CONTROL_SOURCE;
const STATE_PREFIX = "orchestrator:";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_TASKS_PER_TICK = Math.max(1, Math.min(8, Number(process.env.INTELLIGENCE_ORCHESTRATOR_MAX_TASKS ?? DEFAULT_MAX_TASKS_PER_TICK)));
const RETRY_SECONDS = Math.max(60, Math.min(900, Number(process.env.INTELLIGENCE_ORCHESTRATOR_RETRY_SECONDS ?? 300)));
const TASK_TIMEOUT_MS = Math.max(60_000, Math.min(3_600_000, Number(process.env.INTELLIGENCE_ORCHESTRATOR_TASK_TIMEOUT_MS ?? 1_500_000)));
const HEARTBEAT_BUDGET_MS = Math.max(10 * 60_000, Math.min(50 * 60_000, Number(process.env.INTELLIGENCE_ORCHESTRATOR_BUDGET_MS ?? DEFAULT_HEARTBEAT_BUDGET_MS)));
const HEARTBEAT_RESERVE_MS = Math.max(60_000, Math.min(10 * 60_000, Number(process.env.INTELLIGENCE_ORCHESTRATOR_RESERVE_MS ?? DEFAULT_HEARTBEAT_RESERVE_MS)));

const TASK_ALLOWLIST = new Set(
  String(process.env.INTELLIGENCE_ORCHESTRATOR_TASK_ALLOWLIST ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const FORCE_TASKS = new Set(
  String(process.env.INTELLIGENCE_ORCHESTRATOR_FORCE_TASKS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

const edgeServiceAvailable = () =>
  String(process.env.GEOMACRO_SUPABASE_EDGE_AVAILABLE ?? "false").trim().toLowerCase() === "true";
const restrictedDataPlane =
  String(process.env.GEOMACRO_SUPABASE_RESTRICTED_MODE ?? "false").trim().toLowerCase() === "true";
const governedTelegramEnabled = () =>
  String(process.env.TELEGRAM_ENABLED ?? "false").trim().toLowerCase() === "true";

// D1 client enforces CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and the
// already resolved canonical D1_DATABASE_ID. No Supabase network fallback.
const d1State = createD1ControlPlaneStateClient();

const TASKS = [
  {
    key: "phase_a_heartbeat",
    // Heartbeat-only still calls refreshTargets() which executes SQL INSERT/
    // UPDATE for every country × source in frozen Supabase; NOT read-only.
    // Its requiredEnv contains SUPABASE_DB_URL. Never run while restricted.
    restrictedDirectPostgresSafe: false,
    cadenceSeconds: 3600,
    offsetSeconds: 300,
    priority: 9,
    timeoutMs: 240_000,
    requiredEnv: ["SUPABASE_DB_URL"],
    steps: [
      ["bash", ["-lc", "PHASE_A_HEARTBEAT_ONLY=1 node scripts/ops/phase-a-runtime-freshness-repair.mjs"], "."],
    ],
  },
  {
    // Original publisher pubDate, no processing-time laundering. Safe lane:
    // read-only fixed HTTPS feeds, no Supabase/B2/paid API/public scoring.
    key: "official_native_rss",
    restrictedDirectPostgresSafe: true,
    cadenceSeconds: 3600,
    offsetSeconds: 120,
    priority: 8,
    timeoutMs: 75_000,
    requiredEnv: [],
    steps: [
      ["node", ["scripts/ops/probe-official-native-rss-three-domains.mjs"], "."],
    ],
  },
  {
    key: "gdelt_gal",
    // GAL imports the live structure loader, Supabase SDK and reconciliation.
    // Having a B2 account ticket does NOT make the task Supabase-independent.
    restrictedDirectPostgresSafe: false,
    cadenceSeconds: 900,
    offsetSeconds: 0,
    priority: 10,
    timeoutMs: 1_200_000,
    requiredEnv: ["LIVE_STRUCTURE_TOKEN", "SUPABASE_DB_URL", "B2_KEY_ID", "B2_APPLICATION_KEY"],
    steps: [
      ["node", ["scripts/run-gdelt-gal-cycle.mjs"], "."],
    ],
  },
  {
    key: "gdelt_v2",
    cadenceSeconds: 900,
    offsetSeconds: 180,
    priority: 11,
    timeoutMs: 900_000,
    requiredEnv: ["SUPABASE_DB_URL"],
    steps: [["bun", ["scripts/ingest-gdelt-v2-events-live.mjs", "--write"], "."]],
  },
  {
    key: "current_scoring",
    cadenceSeconds: 1200,
    offsetSeconds: 780,
    priority: 12,
    timeoutMs: 900_000,
    requiredEnv: ["SUPABASE_DB_URL", "B2_KEY_ID", "B2_APPLICATION_KEY"],
    steps: [["node", ["scripts/ops/run-intelligence-current-scoring-cycle.mjs"], "."]],
  },
  {
    key: "open_realtime_mesh",
    cadenceSeconds: 900,
    offsetSeconds: 240,
    priority: 15,
    requiredEnv: ["LIVE_STRUCTURE_TOKEN"],
    timeoutMs: 1_200_000,
    enabled: edgeServiceAvailable,
    disabledReason: () => "supabase_edge_storage_service_unavailable",
    steps: [
      ["bun", ["scripts/sync-open-live-source-mesh.mjs"], "."],
      ["node", ["scripts/drain-live-structure.mjs", "--fragment-ids-file", "open-live-source-sync.json"], "."],
    ],
  },
  {
    key: "country_raw_mesh",
    cadenceSeconds: 900,
    offsetSeconds: 360,
    priority: 20,
    requiredEnv: ["LIVE_STRUCTURE_TOKEN", "SUPABASE_DB_URL", "B2_KEY_ID", "B2_APPLICATION_KEY"],
    timeoutMs: 1_500_000,
    steps: [
      ["bash", ["-lc", "bun scripts/sync-country-raw-source-mesh.mjs | tee country-raw-source-sync.json"], "."],
      ["node", ["scripts/drain-live-structure.mjs", "--fragment-ids-file", "country-raw-source-sync.json"], "."],
      ["bash", ["-lc", "RECONCILE_SOURCE_KEYS=country_raw_web_mesh RECONCILE_LOOKBACK_MINUTES=120 node scripts/reconcile-structured-event-commercial-rights.mjs"], "."],
      ["bun", ["scripts/audit-global-raw-source-coverage.mjs"], "."],
      ["bun", ["scripts/audit-global-raw-source-runtime.mjs"], "."],
    ],
  },
  {
    key: "rss_live",
    cadenceSeconds: 900,
    offsetSeconds: 540,
    priority: 30,
    requiredEnv: ["SUPABASE_DB_URL"],
    timeoutMs: 1_200_000,
    maxAttempts: 3,
    retryBackoffMs: 5000,
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
    enabled: governedTelegramEnabled,
    disabledReason: () => "governed_telegram_discovery_disabled",
    steps: [["python", ["workers/telegram-flash/global_discovery.py"], "."]],
  },
  {
    key: "news_ingest",
    cadenceSeconds: 7200,
    offsetSeconds: 1800,
    priority: 60,
    requiredEnv: ["GUARDIAN_API_KEY"],
    timeoutMs: 1_800_000,
    enabled: edgeServiceAvailable,
    disabledReason: () => "supabase_edge_storage_service_unavailable",
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
    requiredEnv: ["SUPABASE_DB_URL"],
    enabled: () => String(process.env.GRI_PUBLISH_ENABLED ?? "").trim().toLowerCase() === "true",
    disabledReason: () => "gri_publish_disabled_by_configuration",
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
      ["bun", ["scripts/global-risk-gate-country-census.ts"], "."],
      ["node", ["scripts/audit-global-realtime-source-freshness.mjs"], "."],
      ["bun", ["scripts/audit-agent-hot-topic-readiness.ts"], "."],
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

  let response;
  try {
    response = await fetch(
      `${requestUrl}&audience=${encodeURIComponent(audience)}`,
      {
        headers: { authorization: `bearer ${requestToken}` },
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    return false;
  }
  if (!response.ok) return false;
  const payload = await response.json();
  const token = String(payload?.value ?? "").trim();
  if (!token) return false;
  process.env.GEOMACRO_FLASH_OIDC_TOKEN = token;
  return true;
}

function nextDueFrom(task, attemptMs, success) {
  return success
    ? new Date(alignedDueAt(task, attemptMs)).toISOString()
    : new Date(attemptMs + RETRY_SECONDS * 1000).toISOString();
}

function taskKey(task) {
  return `${STATE_PREFIX}${task.key}`;
}

function normalizeState(task, row, nowMs) {
  const payload = row?.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
    ? structuredClone(row.payload)
    : {};
  const cursor = payload?.cursor && typeof payload.cursor === "object" && !Array.isArray(payload.cursor)
    ? payload.cursor
    : {};
  return {
    ...payload,
    source: STATE_SOURCE,
    task: task.key,
    cursor: {
      ...cursor,
      next_due_at:
        typeof cursor.next_due_at === "string" && cursor.next_due_at
          ? cursor.next_due_at
          : new Date(alignedDueAt(task, nowMs - task.cadenceSeconds * 1000)).toISOString(),
    },
  };
}

function shouldBootstrapState(row) {
  if (!row) return true;
  if (row.last_attempt_at || row.last_success_at) return false;
  const cursor = row?.payload?.cursor;
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return true;
  if (cursor.skipped_reason === "task_disabled_by_configuration") return false;
  if (typeof cursor.skipped_reason === "string" && cursor.skipped_reason.length > 0) return false;
  return !Object.prototype.hasOwnProperty.call(cursor, "bootstrap_pending");
}

function bootstrapStateForTask(task, nowMs) {
  const state = normalizeState(task, null, nowMs);
  state.cursor.next_due_at = new Date(nowMs).toISOString();
  state.cursor.bootstrap_pending = true;
  return state;
}

async function persistState(task, state, update = {}) {
  const payload = {
    ...state,
    source: STATE_SOURCE,
    task: task.key,
    cursor: {
      ...(state.cursor ?? {}),
      ...(update.cursor ?? {}),
    },
    ...(update.payload ?? {}),
  };
  await d1State.persist(task.key, payload, {
    cursor: payload.cursor,
    last_attempt_at: update.last_attempt_at ?? null,
    last_success_at: update.last_success_at ?? null,
  });
  return payload;
}

async function runStep([command, args, cwd], timeoutMs) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stderr.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, signal, stdout, stderr });
    });
  });
}

async function runTask(task) {
  const timeoutMs = task.timeoutMs ?? TASK_TIMEOUT_MS;
  const maxAttempts = Math.max(1, Number(task.maxAttempts ?? 1));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let attemptOk = true;
    const stepResults = [];
    if (!(await refreshOidcToken(task.oidcAudience))) {
      attemptOk = false;
      stepResults.push({ ok: false, reason: "oidc_token_unavailable" });
    } else {
      for (const step of task.steps) {
        const result = await runStep(step, timeoutMs);
        stepResults.push(result);
        if (!result.ok) {
          attemptOk = false;
          break;
        }
      }
    }
    if (attemptOk) return { ok: true, attempts: attempt, steps: stepResults };
    if (attempt < maxAttempts) await sleep(Number(task.retryBackoffMs ?? 2000) * attempt);
  }
  return { ok: false, attempts: maxAttempts, steps: [] };
}

async function loadStateRows() {
  // D1 adapter maps rows by bare scope; scheduler taskKey() uses the fully
  // qualified "orchestrator:<scope>" source_id. Normalize explicitly to
  // preserve existing cursor/next_due_at and NEVER re-bootstrap good state.
  const rows = await d1State.loadRows();
  return new Map([...rows.values()].map((row) => [row.source_id, row]));
}

async function main() {
  const startMs = Date.now();
  const rows = await loadStateRows();
  const due = [];
  const disabled = [];
  for (const task of TASKS) {
    if (TASK_ALLOWLIST.size > 0 && !TASK_ALLOWLIST.has(task.key)) continue;
    // First preserve the canonical D1-only restricted-mode guard.
    // Additional independent guards prevent accidental "safe" mislabeling.
    if (restrictedDataPlane && task.restrictedDirectPostgresSafe !== true) continue;
    if (restrictedDataPlane &&
        task.requiredEnv?.some((name) => /SUPABASE|POSTGRES|PGHOST|PGUSER|PGPASSWORD/i.test(name))) continue;
    // Known historic quota-consuming tasks always require frozen Supabase SQL
    // or downstream writers, irrespective of a future task flag regression.
    if (restrictedDataPlane &&
        (task.key === "phase_a_heartbeat" || task.key === "gdelt_gal")) continue;
    const row = rows.get(taskKey(task));
    const enabled = typeof task.enabled === "function" ? task.enabled() : true;
    let state;
    if (shouldBootstrapState(row)) {
      state = bootstrapStateForTask(task, startMs);
      await persistState(task, state, { cursor: state.cursor });
    } else {
      state = normalizeState(task, row, startMs);
    }
    if (!enabled) {
      const skippedReason = typeof task.disabledReason === "function"
        ? task.disabledReason()
        : "task_disabled_by_configuration";
      state.cursor.next_due_at = new Date(alignedDueAt(task, startMs)).toISOString();
      state.cursor.skipped_reason = skippedReason;
      state.cursor.bootstrap_pending = false;
      state.cursor.status = "degraded";
      await persistState(task, state, { cursor: state.cursor });
      disabled.push({ task: task.key, reason: skippedReason });
      continue;
    }
    state.cursor.skipped_reason = null;
    if (FORCE_TASKS.has(task.key) || isPast(state.cursor.next_due_at, startMs)) {
      due.push({ task, state, forced: FORCE_TASKS.has(task.key) });
    }
  }

  const orderedDue = orderDueTasks(due);
  const summary = {
    ok: true,
    project_ref: PROJECT_REF,
    started_at: new Date(startMs).toISOString(),
    selected: [],
    skipped: disabled,
    bootstrap_seeds_are_immediately_due: true,
    task_allowlist: [...TASK_ALLOWLIST].sort(),
    restricted_data_plane: restrictedDataPlane,
    restricted_direct_postgres_safe_tasks: TASKS
      .filter((task) => task.restrictedDirectPostgresSafe === true)
      .map((task) => task.key)
      .sort(),
    supabase_edge_available: edgeServiceAvailable(),
    direct_postgres_mode: String(process.env.GRI_DB_MODE ?? "").trim().toLowerCase() === "direct_postgres",
    raw_archive_mode: String(process.env.RAW_SOURCE_ARCHIVE_MODE ?? "").trim().toLowerCase(),
    scheduler_note: "MAX_TASKS_PER_TICK prevents the bootstrap from becoming a thundering herd",
  };

  let completed = 0;
  for (const item of orderedDue) {
    if (completed >= MAX_TASKS_PER_TICK) {
      summary.skipped.push({ task: item.task.key, reason: "max_tasks_per_tick" });
      continue;
    }
    const elapsed = Date.now() - startMs;
    const timeoutMs = item.task.timeoutMs ?? TASK_TIMEOUT_MS;
    if (!taskFitsWithinBudget({
      elapsedMs: elapsed,
      timeoutMs,
      budgetMs: HEARTBEAT_BUDGET_MS,
      reserveMs: HEARTBEAT_RESERVE_MS,
    })) {
      summary.skipped.push({ task: item.task.key, reason: "heartbeat_budget" });
      continue;
    }
    const task = item.task;
    const state = item.state;
    const attemptMs = Date.now();
    state.cursor.bootstrap_pending = false;
    if (!hasAllEnv(task.requiredEnv)) {
      state.cursor.next_due_at = new Date(attemptMs + RETRY_SECONDS * 1000).toISOString();
      state.cursor.last_error = "missing_required_env";
      state.cursor.consecutive_failures = Number(state.cursor.consecutive_failures ?? 0) + 1;
      await persistState(task, state, {
        last_attempt_at: new Date(attemptMs).toISOString(),
        cursor: state.cursor,
      });
      summary.ok = false;
      summary.selected.push({ task: task.key, ok: false, reason: "missing_required_env" });
      completed += 1;
      continue;
    }

    const result = await runTask(task);
    const success = result.ok;
    state.cursor.next_due_at = nextDueFrom(task, attemptMs, success);
    state.cursor.last_error = success ? null : "task_failed";
    state.cursor.retry_pending = !success;
    state.cursor.consecutive_failures = success
      ? 0
      : Number(state.cursor.consecutive_failures ?? 0) + 1;
    if (task.key === "official_native_rss") {
      // A failed publisher poll must never leave the persistent D1 cursor
      // advertising the prior healthy observation or a successful heartbeat.
      const sourceOutcome = officialSourcePollCursorOutcome(success);
      state.cursor.status = sourceOutcome.status;
      state.cursor.failure_class = sourceOutcome.failure_class;
    } else if (!success && task.key === "gdelt_gal") {
      const detail = result.steps?.find((step) => step && step.ok === false);
      const text = `${detail?.stderr ?? ""}\n${detail?.stdout ?? ""}`;
      const failureClass = text.includes("WORLD_BANK") || text.includes("world bank")
        ? "world_bank_dependency"
        : text.includes("timeout") || text.includes("ETIMEDOUT")
          ? "network_timeout"
          : "unknown";
      state.cursor.GDELT_GAL_FAILURE_CLASS = failureClass;
      state.cursor.failure_class = failureClass;
      if (state.cursor.consecutive_failures >= 2) state.cursor.status = "degraded";
    } else if (success) {
      state.cursor.failure_class = null;
      state.cursor.status = "healthy";
    }
    await persistState(task, state, {
      last_attempt_at: new Date(attemptMs).toISOString(),
      last_success_at: success ? new Date().toISOString() : null,
      cursor: state.cursor,
    });
    summary.ok = summary.ok && success;
    summary.selected.push({ task: task.key, ok: success, attempts: result.attempts });
    completed += 1;
  }

  summary.completed_at = new Date().toISOString();
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
