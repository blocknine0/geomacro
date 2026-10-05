#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);
const APP_SUPABASE_URL = String(process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
const LIVE_STRUCTURE_TOKEN = String(process.env.LIVE_STRUCTURE_TOKEN ?? "").trim();
const EXECUTION_MODE = String(process.env.LIVE_STRUCTURE_EXECUTION_MODE ?? "edge").trim().toLowerCase();
const LOCAL_MODE = EXECUTION_MODE === "local_direct_postgres";
const MAX_CYCLES = Math.max(1, Math.min(24, Number(process.env.LIVE_STRUCTURE_MAX_CYCLES ?? 12)));
const RETRIES = Math.max(1, Math.min(5, Number(process.env.LIVE_STRUCTURE_RETRIES ?? 3)));
const CONCURRENCY = Math.max(1, Math.min(16, Number(process.env.LIVE_STRUCTURE_DRAIN_CONCURRENCY ?? 8)));
const argIndex = process.argv.indexOf("--fragment-ids-file");
const IDS_FILE = String(
  argIndex >= 0 ? process.argv[argIndex + 1] ?? "" : process.env.STRUCTURE_FRAGMENT_IDS_FILE ?? "",
).trim();

if (!LIVE_STRUCTURE_TOKEN || (!LOCAL_MODE && !APP_SUPABASE_URL)) {
  throw new Error("LIVE_STRUCTURE_CREDENTIALS_REQUIRED");
}
if (LOCAL_MODE && String(process.env.GRI_DB_MODE ?? "").trim().toLowerCase() !== "direct_postgres") {
  throw new Error("LIVE_STRUCTURE_LOCAL_REQUIRES_DIRECT_POSTGRES");
}

const endpoint = APP_SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/live-structure-intelligence";

function fragmentIdsFromFilePayload(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.fragment_ids)) return raw.fragment_ids;
  if (Array.isArray(raw?.sources)) {
    return raw.sources
      .map((source) => source?.fragment_id)
      .filter(Boolean);
  }
  return [];
}

async function postLocal(body) {
  const fragmentId = String(body?.fragment_id ?? "").trim();
  if (!fragmentId) throw new Error("LOCAL_STRUCTURE_REQUIRES_FRAGMENT_ID");
  const { stdout, stderr } = await execFileAsync(
    "node",
    ["--import", "tsx", "scripts/run-live-structure-local.ts", "--fragment-id", fragmentId],
    {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    },
  );
  if (stderr?.trim()) process.stderr.write(stderr);
  const lines = String(stdout ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let data = null;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      data = JSON.parse(lines[i]);
      break;
    } catch {}
  }
  if (data?.ok !== true) {
    throw new Error(`Local canonical structurer rejected request: ${String(stdout).slice(-2000)}`);
  }
  return data;
}

async function postRemote(body) {
  let lastError = null;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-geomacro-structure-token": LIVE_STRUCTURE_TOKEN,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 1000)}`);
      const data = JSON.parse(text);
      if (data?.ok !== true) throw new Error(`Structure endpoint rejected request: ${JSON.stringify(data).slice(0, 2000)}`);
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
  throw lastError ?? new Error("LIVE_STRUCTURE_REQUEST_FAILED");
}

async function post(body) {
  return LOCAL_MODE ? postLocal(body) : postRemote(body);
}

async function drainSpecificFragment(fragmentId) {
  if (!LOCAL_MODE) return [await post({ fragment_id: fragmentId })];
  const rows = [];
  for (let cycle = 0; cycle < MAX_CYCLES; cycle += 1) {
    const data = await post({ fragment_id: fragmentId });
    rows.push(data);
    const remaining = Number(data?.remaining ?? data?.fragment_total_remaining ?? 0);
    const status = String(data?.status ?? "").toLowerCase();
    if (remaining <= 0 || status === "nothing_new" || status === "idle" || status === "nothing_to_structure") break;
  }
  const remaining = rows.length
    ? Number(rows.at(-1)?.remaining ?? rows.at(-1)?.fragment_total_remaining ?? 0)
    : 0;
  if (remaining > 0) throw new Error(`LIVE_STRUCTURE_LOCAL_FRAGMENT_INCOMPLETE:${fragmentId}:remaining=${remaining}`);
  return rows;
}

async function main() {
  const outputs = [];

  if (IDS_FILE) {
    const raw = JSON.parse(await readFile(IDS_FILE, "utf8"));
    const ids = fragmentIdsFromFilePayload(raw);
    const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
    for (let offset = 0; offset < uniqueIds.length; offset += CONCURRENCY) {
      const batch = uniqueIds.slice(offset, offset + CONCURRENCY);
      const results = await Promise.all(batch.map((fragmentId) => drainSpecificFragment(fragmentId)));
      outputs.push(...results.flat());
    }
  } else {
    if (LOCAL_MODE) throw new Error("LIVE_STRUCTURE_LOCAL_REQUIRES_EXPLICIT_FRAGMENT_IDS");
    for (let cycle = 0; cycle < MAX_CYCLES; cycle += 1) {
      const data = await post({});
      outputs.push(data);
      const remaining = Number(data?.remaining ?? data?.fragment_total_remaining ?? 0);
      const status = String(data?.status ?? "").toLowerCase();
      if (remaining <= 0 || status === "nothing_new" || status === "idle") break;
    }
  }

  const remaining = outputs.length
    ? Number(outputs.at(-1)?.remaining ?? outputs.at(-1)?.fragment_total_remaining ?? 0)
    : 0;
  if ((!IDS_FILE || LOCAL_MODE) && remaining > 0) {
    throw new Error(`LIVE_STRUCTURE_DRAIN_INCOMPLETE: remaining=${remaining}`);
  }

  const summary = {
    ok: true,
    execution_mode: LOCAL_MODE ? "local_canonical_source_direct_postgres" : "edge",
    requests: outputs.length,
    remaining,
    structured: outputs.reduce((n, row) => n + Number(row?.evidence_structured ?? row?.event_rows ?? 0), 0),
    events_created: outputs.reduce((n, row) => n + Number(row?.events_created ?? 0), 0),
    events_updated: outputs.reduce((n, row) => n + Number(row?.events_updated ?? 0), 0),
    outputs: outputs.slice(-12),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
