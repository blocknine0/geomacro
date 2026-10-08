#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const DB_URL = String(process.env.SUPABASE_DB_URL ?? "").trim();
const DB_MODE = String(process.env.GRI_DB_MODE ?? "").trim().toLowerCase();
const SUMMARY_OUT = String(process.env.RSS_LIVE_CYCLE_SUMMARY_OUT ?? "").trim();
const SKIP_CORROBORATION = String(process.env.RSS_LIVE_SKIP_CORROBORATION ?? "").trim().toLowerCase() === "true";
const ALLOW_PARTIAL_SOURCE_FAILURES =
  String(process.env.RSS_LIVE_ALLOW_PARTIAL_SOURCE_FAILURES ?? "").trim().toLowerCase() === "true";
const MIN_PARTIAL_COMPLETED_SOURCES = Math.max(
  2,
  Math.min(50, Number(process.env.RSS_LIVE_MIN_PARTIAL_COMPLETED_SOURCES ?? 2)),
);

if (!DB_URL || DB_MODE !== "direct_postgres") {
  throw new Error("RSS_LIVE_CYCLE_REQUIRES_DIRECT_POSTGRES");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? ".",
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const value = String(chunk);
      stdout += value;
      if (options.forward !== false) process.stdout.write(value);
    });
    child.stderr.on("data", (chunk) => {
      // stderr can contain stack traces, filesystem paths, tokens, request details,
      // or upstream response bodies. Capture it for bounded process control only;
      // never forward it to the workflow/public log boundary.
      stderr += String(chunk);
    });
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
    child.on("error", () => resolve({
      code: null,
      signal: null,
      stdout,
      stderr,
    }));
  });
}

function parseLastJson(stdout, label) {
  const lines = String(stdout ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {}
  }
  throw new Error(`${label}_JSON_OUTPUT_MISSING`);
}

function verifyWorkerSources(stdout, { allowPartial = false } = {}) {
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
  const completed = expected.filter((id) => lastState.get(id) === "success");
  const missing = expected.filter((id) => lastState.get(id) !== "success");
  const unprovenMissing = missing.filter((id) => !hadError.has(id));
  if (missing.length && !allowPartial) throw new Error("RSS_SOURCES_INCOMPLETE");
  if (allowPartial && unprovenMissing.length) {
    throw new Error("RSS_PARTIAL_SOURCE_STATE_UNPROVEN");
  }
  if (allowPartial && completed.length < MIN_PARTIAL_COMPLETED_SOURCES) {
    throw new Error("RSS_PARTIAL_SOURCE_FLOOR_NOT_MET");
  }

  return {
    configured_source_count: expected.length,
    completed_source_count: completed.length,
    recovered_source_count: completed.filter((id) => hadError.has(id)).length,
    failed_source_count: missing.length,
    failed_sources: missing.sort(),
    partial_refresh: missing.length > 0,
    minimum_partial_completed_sources: MIN_PARTIAL_COMPLETED_SOURCES,
    sources: expected.sort(),
  };
}

async function createLocalSpoolServer(spoolDir) {
  const seen = new Set();
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "POST" || request.url !== "/live-flash-ingest") {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: false, error: "not_found" }));
        return;
      }

      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 2_000_000) throw new Error("RSS_SPOOL_PAYLOAD_TOO_LARGE");
        chunks.push(chunk);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("RSS_SPOOL_PAYLOAD_INVALID");
      const sourceId = String(payload.source_id ?? "").trim();
      const sourceRecordId = String(payload.source_record_id ?? "").trim();
      if (!sourceId || !sourceRecordId) throw new Error("RSS_SPOOL_SOURCE_IDENTITY_REQUIRED");

      const canonical = JSON.stringify(canonicalize(payload));
      const digest = sha256(Buffer.from(canonical));
      const file = path.join(spoolDir, `${digest}.json`);
      if (!seen.has(digest)) {
        await writeFile(file, JSON.stringify(payload) + "\n", { mode: 0o600 });
        seen.add(digest);
      }
      const country = String(payload.country_iso3 ?? "").trim().toUpperCase();
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({
        ok: true,
        flash_id: `spool_${digest.slice(0, 32)}`,
        countries: /^[A-Z]{3}$/.test(country) ? [country] : [],
        scoring_eligible: false,
        persisted: false,
        transport: "local_spool_pending_canonical_direct_postgres",
      }));
    } catch {
      response.writeHead(400, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({
        ok: false,
        error: "RSS_SPOOL_REQUEST_REJECTED",
      }));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("RSS_LOCAL_SPOOL_SERVER_ADDRESS_INVALID");

  return {
    url: `http://127.0.0.1:${address.port}/live-flash-ingest`,
    server,
    spooledCount: () => seen.size,
  };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function main() {
  const spoolDir = await mkdtemp(path.join(tmpdir(), "geomacro-rss-spool-"));
  let server = null;
  try {
    const local = await createLocalSpoolServer(spoolDir);
    server = local.server;

    const worker = await runCommand("python", ["worker.py"], {
      cwd: "workers/telegram-flash",
      env: {
        GEOMACRO_FLASH_INGEST_URL: local.url,
        GEOMACRO_FLASH_INGEST_TOKEN: "",
        GEOMACRO_FLASH_OIDC_TOKEN: "",
        TELEGRAM_ENABLED: "false",
        TELEGRAM_CHANNELS: "",
        BREAKING_RSS_ENABLED: "true",
        BREAKING_RSS_RUN_ONCE: "true",
      },
    });
    await closeServer(server);
    server = null;

    if (worker.code !== 0 && !ALLOW_PARTIAL_SOURCE_FAILURES) {
      throw new Error("RSS_WORKER_FAILED");
    }
    const sourceSummary = verifyWorkerSources(worker.stdout, {
      allowPartial: ALLOW_PARTIAL_SOURCE_FAILURES,
    });
    if (worker.code !== 0 && sourceSummary.partial_refresh !== true) {
      throw new Error("RSS_WORKER_FAILED");
    }

    const ingest = await runCommand(
      "bun",
      ["scripts/run-live-flash-ingest-local.ts", "--payload-dir", spoolDir],
      { forward: true },
    );
    if (ingest.code !== 0) throw new Error("RSS_CANONICAL_DIRECT_INGEST_FAILED");
    const ingestSummary = parseLastJson(ingest.stdout, "RSS_CANONICAL_DIRECT_INGEST");
    if (ingestSummary?.ok !== true || Number(ingestSummary.accepted) !== local.spooledCount()) {
      throw new Error("RSS_CANONICAL_DIRECT_INGEST_COUNT_MISMATCH");
    }

    let corroborationSummary;
    if (SKIP_CORROBORATION) {
      corroborationSummary = {
        ok: true,
        skipped: true,
        reason: "explicit_partner_bootstrap_country_corroboration_follows",
        processed: 0,
        verified: 0,
        corroborating: 0,
        unverified: 0,
        execution_mode: "skipped_explicitly",
        threshold_weakening: false,
      };
    } else {
      const corroboration = await runCommand(
        "bun",
        ["scripts/run-live-flash-corroborate-local.ts"],
        { forward: true },
      );
      if (corroboration.code !== 0) throw new Error("RSS_CANONICAL_DIRECT_CORROBORATION_FAILED");
      corroborationSummary = parseLastJson(corroboration.stdout, "RSS_CANONICAL_DIRECT_CORROBORATION");
      if (corroborationSummary?.ok !== true || corroborationSummary?.threshold_weakening !== false) {
        throw new Error("RSS_CANONICAL_DIRECT_CORROBORATION_REJECTED");
      }
    }

    const summary = {
      ok: true,
      schema: "geomacro.rss-live-cycle.v2",
      transport: "canonical_direct_postgres",
      edge_function_dependency: false,
      source_summary: sourceSummary,
      partial_source_failure_tolerance_enabled: ALLOW_PARTIAL_SOURCE_FAILURES,
      spool: {
        payloads: local.spooledCount(),
        durable_authority: "canonical_live_flash_tables",
        prepromotion: false,
      },
      ingestion: {
        attempted: Number(ingestSummary.attempted ?? 0),
        accepted: Number(ingestSummary.accepted ?? 0),
        execution_mode: ingestSummary.execution_mode,
      },
      corroboration: {
        ok: true,
        skipped: corroborationSummary.skipped === true,
        reason: corroborationSummary.reason ?? null,
        processed: Number(corroborationSummary.processed ?? 0),
        verified: Number(corroborationSummary.verified ?? 0),
        corroborating: Number(corroborationSummary.corroborating ?? 0),
        unverified: Number(corroborationSummary.unverified ?? 0),
        execution_mode: corroborationSummary.execution_mode,
        threshold_weakening: false,
      },
      payment_performed: false,
      execution_authorized: false,
    };

    if (SUMMARY_OUT) {
      await writeFile(path.resolve(SUMMARY_OUT), JSON.stringify(summary, null, 2) + "\n", { mode: 0o600 });
    }
    console.log(JSON.stringify(summary));
  } finally {
    if (server) await closeServer(server).catch(() => {});
    await rm(spoolDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "";
  const failureCode = /^RSS_[A-Z0-9_]+$/.test(message)
    ? message
    : "RSS_LIVE_CYCLE_FAILED";
  console.error(failureCode);
  process.exit(1);
});
