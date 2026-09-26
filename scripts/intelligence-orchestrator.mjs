#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_HEARTBEAT_BUDGET_MS,
  DEFAULT_HEARTBEAT_RESERVE_MS,
  DEFAULT_MAX_TASKS_PER_TICK,
  orderDueTasks,
  taskFitsWithinBudget,
} from "./lib/intelligence-scheduler.mjs";

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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_TASKS_PER_TICK = Math.max(1, Math.min(8, Number(process.env.INTELLIGENCE_ORCHESTRATOR_MAX_TASKS ?? DEFAULT_MAX_TASKS_PER_TICK)));
const RETRY_SECONDS = Math.max(60, Math.min(900, Number(process.env.INTELLIGENCE_ORCHESTRATOR_RETRY_SECONDS ?? 300)));
const TASK_TIMEOUT_MS = Math.max(60_000, Math.min(3_600_000, Number(process.env.INTELLIGENCE_ORCHESTRATOR_TASK_TIMEOUT_MS ?? 1_500_000)));
const HEARTBEAT_BUDGET_MS = Math.max(10 * 60_000, Math.min(50 * 60_000, Number(process.env.INTELLIGENCE_ORCHESTRATOR_BUDGET_MS ?? DEFAULT_HEARTBEAT_BUDGET_MS)));
const HEARTBEAT_RESERVE_MS = Math.max(60_000, Math.min(10 * 60_000, Number(process.env.INTELLIGENCE_ORCHESTRATOR_RESERVE_MS ?? DEFAULT_HEARTBEAT_RESERVE_MS)));
const DB_REQUEST_TIMEOUT_MS = Math.max(
  5_000,
  Math.min(120_000, Number(process.env.INTELLIGENCE_ORCHESTRATOR_DB_TIMEOUT_MS ?? 30_000)),
);

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


function fetchWithTimeout(input, init = {}) {
  const timeoutSignal = AbortSignal.timeout(DB_REQUEST_TIMEOUT_MS);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return fetch(input, { ...init, signal });
}

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
  global: { fetch: fetchWithTimeout },
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
      ["node", ["scripts/run-gdelt-gal-cycle.mjs"], "."],
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
      ["node", ["scripts/drain-live-structure.mjs", "--fragment-ids-file", "open-live-source-sync.json"], "."],
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
    requiredEnv: [],
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
  const currentSlot = Math.floor((nowMs - offsetMs) / cadenceMs);
  return (currentSlot + 1) * cadenceMs + offsetMs;
}

function isTaskEnabled(task) {
  if (TASK_ALLOWLIST.size > 0 && !TASK_ALLOWLIST.has(task.key)) return false;
  return typeof task.enabled === "function" ? task.enabled() : true;
}

function hasRequiredEnv(task) {
  return (task.requiredEnv ?? []).every((name) => String(process.env[name] ?? "").trim());
}

function normalizedAt(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function stateKey(taskKey) {
  return `${STATE_PREFIX}${taskKey}`;
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function loadState() {
  const { data, error } = await db
    .from("live_external_sources")
    .select("source_id,updated_at,notes")
    .eq("provider_name", STATE_SOURCE)
    .like("source_id", `${STATE_PREFIX}%`);
  if (error) throw error;
  const map = new Map();
  for (const row of data ?? []) {
    const key = String(row.source_id ?? "").slice(STATE_PREFIX.length);
    let notes = {};
    try { notes = JSON.parse(String(row.notes ?? "{}")); } catch {}
    map.set(key, { ...notes, updated_at: row.updated_at });
  }
  return map;
}

async function writeState(taskKey, patch) {
  const sourceId = stateKey(taskKey);
  const existing = await db
    .from("live_external_sources")
    .select("notes")
    .eq("source_id", sourceId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  let notes = {};
  try { notes = JSON.parse(String(existing.data?.notes ?? "{}")); } catch {}
  const merged = { ...notes, ...patch, task_key: taskKey, updated_at: new Date().toISOString() };
  const { error } = await db.from("live_external_sources").upsert({
    source_id: sourceId,
    source_name: `Orchestrator state: ${taskKey}`,
    provider_name: STATE_SOURCE,
    category: "OPS",
    access_type: "INTERNAL",
    authentication_type: "SERVER",
    commercial_usage_status: "INTERNAL_ONLY",
    raw_redistribution_allowed: false,
    attribution_required: false,
    enabled_for_ingestion: false,
    enabled_for_commercial_signals: false,
    country_scope: "GLOBAL",
    freshness_class: "OPS",
    notes: JSON.stringify(merged),
    updated_at: new Date().toISOString(),
  }, { onConflict: "source_id" });
  if (error) throw error;
}

async function fetchOidcToken(audience) {
  if (!audience) return null;
  const requestUrl = String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL ?? "").trim();
  const requestToken = String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN ?? "").trim();
  if (!requestUrl || !requestToken) return null;
  const separator = requestUrl.includes("?") ? "&" : "?";
  const response = await fetch(
    requestUrl + separator + "audience=" + encodeURIComponent(audience),
    { headers: { authorization: "bearer " + requestToken }, signal: AbortSignal.timeout(30_000) },
  );
  if (!response.ok) throw new Error(`OIDC_TOKEN_HTTP_${response.status}`);
  const payload = await response.json();
  const token = String(payload?.value ?? "").trim();
  if (!token) throw new Error("OIDC_TOKEN_EMPTY");
  return token;
}

async function runStep(task, command, args, cwd, extraEnv = {}) {
  const timeoutMs = Number(task.timeoutMs ?? TASK_TIMEOUT_MS);
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${task.key}:${command} exited code=${code} signal=${signal ?? "none"}`));
    });
  });
  await withTimeout(run(), timeoutMs, `${task.key}:${command}`);
}

async function runTask(task) {
  const oidcToken = task.oidcAudience ? await fetchOidcToken(task.oidcAudience) : null;
  const extraEnv = oidcToken ? { GEOMACRO_FLASH_OIDC_TOKEN: oidcToken } : {};
  const maxAttempts = Math.max(1, Number(task.maxAttempts ?? 1));
  const retryBackoffMs = Math.max(1000, Number(task.retryBackoffMs ?? 5000));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      for (const [command, args, cwd] of task.steps) {
        await runStep(task, command, args, cwd, extraEnv);
      }
      return;
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
      await sleep(retryBackoffMs * attempt);
    }
  }
}

async function main() {
  const startedAt = Date.now();
  const state = await loadState();
  const now = Date.now();
  const due = [];
  for (const task of TASKS) {
    if (!isTaskEnabled(task)) continue;
    if (!hasRequiredEnv(task)) {
      await writeState(task.key, { status: "DEGRADED", reason: "missing_required_env" });
      continue;
    }
    const last = state.get(task.key) ?? {};
    const lastSuccessAt = normalizedAt(last.last_success_at);
    const lastAttemptAt = normalizedAt(last.last_attempt_at);
    const retryAt = normalizedAt(last.next_retry_at);
    const force = FORCE_TASKS.has(task.key);
    const cadenceDue = force || !lastSuccessAt || now >= alignedDueAt(task, lastSuccessAt);
    const retryDue = retryAt > 0 && now >= retryAt;
    if (cadenceDue || retryDue) {
      due.push({
        ...task,
        lastSuccessAt,
        lastAttemptAt,
        force,
      });
    }
  }

  const ordered = orderDueTasks(due);
  const selected = [];
  let projectedElapsedMs = 0;
  for (const task of ordered) {
    if (selected.length >= MAX_TASKS_PER_TICK) break;
    const estimatedMs = Number(task.timeoutMs ?? TASK_TIMEOUT_MS);
    if (taskFitsWithinBudget({
      elapsedMs: projectedElapsedMs,
      estimatedTaskMs: estimatedMs,
      budgetMs: HEARTBEAT_BUDGET_MS,
      reserveMs: HEARTBEAT_RESERVE_MS,
    })) {
      selected.push(task);
      projectedElapsedMs += estimatedMs;
    }
  }

  for (const task of selected) {
    const attemptAt = new Date().toISOString();
    await writeState(task.key, { status: "RUNNING", last_attempt_at: attemptAt, next_retry_at: null });
    try {
      await runTask(task);
      await writeState(task.key, {
        status: "SUCCESS",
        last_attempt_at: attemptAt,
        last_success_at: new Date().toISOString(),
        next_retry_at: null,
        last_error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeState(task.key, {
        status: "DEGRADED",
        last_attempt_at: attemptAt,
        next_retry_at: new Date(Date.now() + RETRY_SECONDS * 1000).toISOString(),
        last_error: message.slice(0, 1500),
      });
    }
  }

  console.log(JSON.stringify({
    ok: true,
    project_ref: PROJECT_REF,
    selected_tasks: selected.map((task) => task.key),
    due_task_count: due.length,
    elapsed_ms: Date.now() - startedAt,
    task_budget_ms: HEARTBEAT_BUDGET_MS,
    budget_reserve_ms: HEARTBEAT_RESERVE_MS,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
