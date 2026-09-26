#!/usr/bin/env node

import { spawn } from "node:child_process";

const APP_SUPABASE_URL = String(process.env.APP_SUPABASE_URL ?? "").trim();
const SUPABASE_PROJECT_ID = String(
  process.env.SUPABASE_PROJECT_ID ?? new URL(APP_SUPABASE_URL).hostname.split(".")[0],
).trim();
let OIDC = String(process.env.GEOMACRO_FLASH_OIDC_TOKEN ?? "").trim();
const INGEST_TOKEN = String(process.env.GEOMACRO_FLASH_INGEST_TOKEN ?? "").trim();

if (!APP_SUPABASE_URL || !SUPABASE_PROJECT_ID || !OIDC) {
  throw new Error("RSS_LIVE_CYCLE_CREDENTIALS_REQUIRED");
}

function runWorker() {
  return new Promise((resolve) => {
    const child = spawn("python", ["worker.py"], {
      cwd: "workers/telegram-flash",
      env: {
        ...process.env,
        // Public Telegram MTProto is forbidden in the production RSS cycle.
        // Publisher-authorized Telegram submissions use the isolated push path.
        TELEGRAM_ENABLED: "false",
        TELEGRAM_CHANNELS: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    const forward = (chunk, target) => {
      const value = String(chunk);
      target(value);
      return value;
    };

    child.stdout.on("data", (chunk) => {
      stdout += forward(chunk, process.stdout.write.bind(process.stdout));
    });
    child.stderr.on("data", (chunk) => {
      stderr += forward(chunk, process.stderr.write.bind(process.stderr));
    });
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
    child.on("error", (error) => resolve({ code: null, signal: null, stdout, stderr: stderr + "\n" + error.message }));
  });
}

async function refreshOidcToken() {
  const requestUrl = String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL ?? "").trim();
  const requestToken = String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN ?? "").trim();
  if (!requestUrl || !requestToken) return false;
  const separator = requestUrl.includes("?") ? "&" : "?";
  let response;
  try {
    response = await fetch(
      requestUrl + separator + "audience=" + encodeURIComponent("https://geomacro.live/actions/live-flash-rss"),
      {
        headers: { authorization: "bearer " + requestToken },
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch { return false; }
  if (!response.ok) return false;
  try {
    const payload = await response.json();
    const token = String(payload?.value ?? "").trim();
    if (!token) return false;
    OIDC = token;
    process.env.GEOMACRO_FLASH_OIDC_TOKEN = token;
    return true;
  } catch { return false; }
}

async function postCorroboration() {
  return fetch(
    `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/live-flash-corroborate`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${OIDC}`,
        "x-geomacro-github-oidc-token": OIDC,
        "content-type": "application/json",
        ...(INGEST_TOKEN ? { "x-geomacro-flash-ingest-token": INGEST_TOKEN } : {}),
      },
      body: "{}",
      signal: AbortSignal.timeout(120_000),
    },
  );
}
async function corroborate() {
  let response = await postCorroboration();
  if (response.status === 401 && await refreshOidcToken()) {
    response = await postCorroboration();
  }
  const text = await response.text();
  if (!response.ok) throw new Error(`live-flash-corroborate HTTP ${response.status}: ${text.slice(0, 2000)}`);
  const data = JSON.parse(text);
  if (data?.ok !== true) throw new Error(`live-flash-corroborate rejected cycle: ${JSON.stringify(data).slice(0, 2000)}`);
  return data;
}

function verifyWorkerSources(stdout) {
  let ready = null;
  const lastState = new Map();
  const hadError = new Set();

  for (const raw of stdout.split(/\r?\n/)) {
    try {
      const event = JSON.parse(raw);
      if (event?.rss === "ready") ready = event;
      if ((event?.kind === "rss_source_complete" || event?.kind === "rss_error") && event?.source_id) {
        const sourceId = String(event.source_id);
        if (event.kind === "rss_error") {
          hadError.add(sourceId);
          lastState.set(sourceId, "error");
        } else if (event.ok === true) {
          lastState.set(sourceId, "success");
        }
      }
    } catch {}
  }

  if (!ready || !Array.isArray(ready.feeds) || ready.feeds.length === 0) {
    throw new Error("RSS_WORKER_MANIFEST_MISSING");
  }

  const expected = [...new Set(ready.feeds.map(String).filter(Boolean))];
  const missing = expected.filter((id) => lastState.get(id) !== "success");
  if (missing.length) {
    throw new Error(`RSS_SOURCES_INCOMPLETE: ${missing.join(",")}`);
  }

  return {
    configured_source_count: expected.length,
    completed_source_count: expected.filter((id) => lastState.get(id) === "success").length,
    recovered_source_count: expected.filter((id) => lastState.get(id) === "success" && hadError.has(id)).length,
  };
}

async function main() {
  const result = await runWorker();
  if (result.code !== 0) throw new Error(`RSS worker failed with exit code=${result.code}, signal=${result.signal}`);
  const sourceSummary = verifyWorkerSources(result.stdout);
  const corroboration = await corroborate();
  console.log(JSON.stringify({
    ok: true,
    source_summary: sourceSummary,
    corroboration: { ok: corroboration.ok === true },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
