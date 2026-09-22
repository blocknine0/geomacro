#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const APP_SUPABASE_URL = String(process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
const LIVE_STRUCTURE_TOKEN = String(process.env.LIVE_STRUCTURE_TOKEN ?? "").trim();
const MAX_CYCLES = Math.max(1, Math.min(24, Number(process.env.LIVE_STRUCTURE_MAX_CYCLES ?? 12)));
const RETRIES = Math.max(1, Math.min(5, Number(process.env.LIVE_STRUCTURE_RETRIES ?? 3)));\nconst CONCURRENCY = Math.max(1, Math.min(16, Number(process.env.LIVE_STRUCTURE_DRAIN_CONCURRENCY ?? 8)));
const argIndex = process.argv.indexOf("--fragment-ids-file");
const IDS_FILE = String(
  argIndex >= 0 ? process.argv[argIndex + 1] ?? "" : process.env.STRUCTURE_FRAGMENT_IDS_FILE ?? "",
).trim();

if (!APP_SUPABASE_URL || !LIVE_STRUCTURE_TOKEN) {
  throw new Error("LIVE_STRUCTURE_CREDENTIALS_REQUIRED");
}

const endpoint = APP_SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/live-structure-intelligence";

async function post(body) {
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

async function main() {
  const outputs = [];

  if (IDS_FILE) {
    const raw = JSON.parse(await readFile(IDS_FILE, "utf8"));
    const ids = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.fragment_ids)
        ? raw.fragment_ids
        : [];
    const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
    for (let offset = 0; offset < uniqueIds.length; offset += CONCURRENCY) {
      const batch = uniqueIds.slice(offset, offset + CONCURRENCY);
      const results = await Promise.all(batch.map((fragmentId) => post({ fragment_id: fragmentId })));
      outputs.push(...results);
    }
  } else {
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
  if (!IDS_FILE && remaining > 0) {
    throw new Error(`LIVE_STRUCTURE_DRAIN_INCOMPLETE: remaining=${remaining}`);
  }

  const summary = {
    ok: true,
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
