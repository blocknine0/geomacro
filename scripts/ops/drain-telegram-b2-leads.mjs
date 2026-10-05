#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { createB2Client } from "./b2-s3-client.mjs";
import { verifyTelegramLeadEnvelope } from "../verify-telegram-lead-envelope.mjs";

const args = process.argv.slice(2);
function arg(name, fallback = "") {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] ?? fallback) : fallback;
}

const queueFile = arg("--queue-file");
const outDir = path.resolve(arg("--out-dir", "artifacts/telegram-lead-intake"));
const maxItems = Math.max(1, Math.min(100, Number(arg("--max", "25")) || 25));
const endpointUrl = String(process.env.B2_ENDPOINT ?? "https://s3.us-east-005.backblazeb2.com").trim();
const bucket = String(process.env.B2_BUCKET ?? "geomacro-private-archive").trim();
const accessKey = String(process.env.B2_KEY_ID ?? process.env.B2_ARCHIVE_READ_KEY_ID ?? "").trim();
const secretKey = String(process.env.B2_APPLICATION_KEY ?? process.env.B2_ARCHIVE_READ_APPLICATION_KEY ?? "").trim();

if (!queueFile) throw new Error("TELEGRAM_QUEUE_FILE_REQUIRED");
if (!accessKey || !secretKey) throw new Error("TELEGRAM_B2_READ_CREDENTIALS_REQUIRED");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const KEY_RE = /^telegram\/leads\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9_]{5,32}\/[1-9]\d*-[a-f0-9]{16}\.json\.gz$/;
const SHA_RE = /^[a-f0-9]{64}$/;
const SIGNAL_RE = /^tg_[a-f0-9]{32}$/;

function collectResults(value) {
  if (Array.isArray(value)) return value.flatMap(collectResults);
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value.results)) return value.results;
  if (Array.isArray(value.result)) return value.result;
  return [];
}

function parseQueue(file) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  const rows = collectResults(parsed);
  return rows
    .filter((row) => row && typeof row === "object" && String(row.state ?? "") === "PENDING")
    .map((row) => ({
      signal_id: String(row.signal_id ?? "").trim(),
      source_channel_key: String(row.source_channel_key ?? "").trim().toLowerCase(),
      source_record_id: Number(row.source_record_id ?? 0),
      published_at: String(row.published_at ?? "").trim(),
      b2_object_key: String(row.b2_object_key ?? "").trim(),
      b2_sha256: String(row.b2_sha256 ?? "").trim().toLowerCase(),
      state: String(row.state ?? "").trim(),
      created_at: String(row.created_at ?? "").trim(),
      attempt_count: Number(row.attempt_count ?? 0),
    }))
    .sort((a, b) => {
      const byCreated = a.created_at.localeCompare(b.created_at);
      return byCreated || a.signal_id.localeCompare(b.signal_id);
    });
}

function validateQueueRow(row) {
  if (!SIGNAL_RE.test(row.signal_id)) throw new Error("TELEGRAM_QUEUE_SIGNAL_ID_INVALID");
  if (!/^[a-z0-9_]{5,32}$/.test(row.source_channel_key)) throw new Error("TELEGRAM_QUEUE_CHANNEL_INVALID");
  if (!Number.isSafeInteger(row.source_record_id) || row.source_record_id <= 0) throw new Error("TELEGRAM_QUEUE_MESSAGE_ID_INVALID");
  if (!row.published_at || !Number.isFinite(Date.parse(row.published_at))) throw new Error("TELEGRAM_QUEUE_PUBLISHED_AT_INVALID");
  if (!KEY_RE.test(row.b2_object_key) || row.b2_object_key.includes("..")) throw new Error("TELEGRAM_QUEUE_B2_KEY_INVALID");
  if (!SHA_RE.test(row.b2_sha256)) throw new Error("TELEGRAM_QUEUE_B2_SHA_INVALID");
  if (row.state !== "PENDING") throw new Error("TELEGRAM_QUEUE_STATE_INVALID");
  if (!Number.isSafeInteger(row.attempt_count) || row.attempt_count < 0) throw new Error("TELEGRAM_QUEUE_ATTEMPT_COUNT_INVALID");
  const channelSegment = `/${row.source_channel_key}/`;
  if (!row.b2_object_key.startsWith("telegram/leads/") || !row.b2_object_key.includes(channelSegment)) {
    throw new Error("TELEGRAM_QUEUE_CHANNEL_KEY_MISMATCH");
  }
}

async function main() {
  const rows = parseQueue(queueFile).slice(0, maxItems);
  mkdirSync(outDir, { recursive: true });
  if (rows.length === 0) {
    const summary = {
      schema: "geomacro.telegram-drain-proof.v2",
      checked_at: new Date().toISOString(),
      queue_rows: 0,
      verified_objects: 0,
      status: "NO_PENDING_AUTHORIZED_TELEGRAM_LEADS",
    };
    writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(summary));
    return;
  }

  const b2 = createB2Client({ endpointUrl, accessKey, secretKey, bucket, allowedKeyPrefixes: ["telegram/leads/"] });
  const accepted = [];
  for (const row of rows) {
    validateQueueRow(row);
    const compressed = await b2.get(row.b2_object_key);
    const actualSha = sha256(compressed);
    if (actualSha !== row.b2_sha256) throw new Error("TELEGRAM_B2_QUEUE_HASH_MISMATCH");
    let envelope;
    try {
      envelope = JSON.parse(gunzipSync(compressed).toString("utf8"));
    } catch (error) {
      throw new Error(`TELEGRAM_B2_PAYLOAD_DECODE_FAILED:${error instanceof Error ? error.message : String(error)}`);
    }
    if (String(envelope.signal_id ?? "") !== row.signal_id) throw new Error("TELEGRAM_SIGNAL_ID_QUEUE_MISMATCH");
    if (String(envelope.source_channel_key ?? "") !== row.source_channel_key) throw new Error("TELEGRAM_CHANNEL_QUEUE_MISMATCH");
    if (Number(envelope.source_record_id ?? 0) !== row.source_record_id) throw new Error("TELEGRAM_MESSAGE_ID_QUEUE_MISMATCH");
    if (String(envelope.published_at ?? "") !== row.published_at) throw new Error("TELEGRAM_PUBLISHED_AT_QUEUE_MISMATCH");
    const sanitized = verifyTelegramLeadEnvelope(envelope);
    const outputPath = path.join(outDir, `${row.signal_id}.json`);
    writeFileSync(outputPath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
    accepted.push({
      signal_id: row.signal_id,
      source_channel_key: row.source_channel_key,
      source_record_id: sanitized.source_record_id,
      published_at: sanitized.published_at,
      b2_object_key: row.b2_object_key,
      b2_sha256: row.b2_sha256,
      payload_file: outputPath,
      queue_state: "PENDING",
      attempt_count: row.attempt_count,
      verification_status: "UNVERIFIED",
      scoring_eligible: false,
      commercial_eligible: false,
    });
  }

  const summary = {
    schema: "geomacro.telegram-drain-proof.v2",
    checked_at: new Date().toISOString(),
    queue_rows: rows.length,
    verified_objects: accepted.length,
    status: "VERIFIED_UNVERIFIED_LEADS_READY_FOR_CANONICAL_INGEST",
    accepted,
    b2_usage: b2.usage(),
  };
  writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
