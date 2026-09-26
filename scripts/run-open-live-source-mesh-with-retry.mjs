#!/usr/bin/env node

import { spawn } from "node:child_process";

const maxAttempts = Math.max(1, Math.min(5, Number(process.env.OPEN_LIVE_SOURCE_MAX_ATTEMPTS ?? 3)));
const baseDelayMs = Math.max(250, Math.min(10_000, Number(process.env.OPEN_LIVE_SOURCE_RETRY_DELAY_MS ?? 2_000)));

function runOnce(attempt) {
  return new Promise((resolve, reject) => {
    console.log(`OPEN_LIVE_SOURCE_SYNC_ATTEMPT ${attempt}/${maxAttempts}`);
    const child = spawn(process.execPath, ["scripts/sync-open-live-source-mesh.mjs"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        resolve({ ok: false, code: 1, signal });
        return;
      }
      resolve({ ok: code === 0, code: code ?? 1, signal: null });
    });
  });
}

async function main() {
  let lastCode = 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runOnce(attempt);
    if (result.ok) {
      if (attempt > 1) console.log(`OPEN_LIVE_SOURCE_SYNC_RECOVERED_AFTER_RETRY attempt=${attempt}`);
      return;
    }
    lastCode = result.code;
    if (attempt >= maxAttempts) break;
    const delayMs = baseDelayMs * attempt;
    console.warn(`OPEN_LIVE_SOURCE_SYNC_RETRYING attempt=${attempt} delay_ms=${delayMs}`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  console.error(`OPEN_LIVE_SOURCE_SYNC_RETRY_EXHAUSTED attempts=${maxAttempts}`);
  process.exit(lastCode || 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
