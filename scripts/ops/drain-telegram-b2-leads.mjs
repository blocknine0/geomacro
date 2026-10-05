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

const checkpointFile = arg("--checkpoint-file");
const outDir = path.resolve(arg("--out-dir", "artifacts/telegram-lead-intake"));
const maxItems = Math.max(1, Math.min(100, Number(arg("--max", "25")) || 25));
const endpointUrl = String(process.env.B2_ENDPOINT ?? "https://s3.us-east-005.backblazeb2.com").trim();
const bucket = String(process.env.B2_BUCKET ?? "geomacro-private-archive").trim();
const accessKey = String(process.env.B2_KEY_ID ?? process.env.B2_ARCHIVE_READ_KEY_ID ?? "").trim();
const secretKey = String(process.env.B2_APPLICATION_KEY ?? process.env.B2_ARCHIVE_READ_APPLICATION_KEY ?? "").trim();

if (!checkpointFile) throw new Error("TELEGRAM_CHECKPOINT_FILE_REQUIRED");
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

function parseCheckpoints(file) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  const rows = collectResults(parsed);
  return rows
    .filter((row) => row && typeof row === "object" && row.last_b2_object_key)
    .map((row) => ({
      source_channel_key: String(row.source_channel_key ?? "").trim().toLowerCase(),
      last_message_id: Number(row.last_message_id ?? 0),
      last_published_at: row.last_published_at == null ? null : String(row.last_published_at),
      last_b2_object_key: String(row.last_b2_object_key ?? "").trim(),
      last_b2_sha256: String(row.last_b2_sha256 ?? "").trim().toLowerCase(),
      last_signal_id: String(row.last_signal_id ?? "").trim(),
      updated_at: row.updated_at == null ? null : String(row.updated_at),
    }))
    .sort((a, b) => String(a.source_channel_key).localeCompare(String(b.source_channel_key)));
}

function validateCheckpoint(row) {
  if (!/^[a-z0-9_]{5,32}$/.test(row.source_channel_key)) throw new Error("TELEGRAM_CHECKPOINT_CHANNEL_INVALID");
  if (!Number.isSafeInteger(row.last_message_id) || row.last_message_id <= 0) throw new Error("TELEGRAM_CHECKPOINT_MESSAGE_ID_INVALID");
  if (!KEY_RE.test(row.last_b2_object_key) || row.last_b2_object_key.includes("..")) throw new Error("TELEGRAM_CHECKPOINT_B2_KEY_INVALID");
  if (!SHA_RE.test(row.last_b2_sha256)) throw new Error("TELEGRAM_CHECKPOINT_B2_SHA_INVALID");
  if (!SIGNAL_RE.test(row.last_signal_id)) throw new Error("TELEGRAM_CHECKPOINT_SIGNAL_ID_INVALID");
  const channelSegment = `/${row.source_channel_key}/`;
  if (!row.last_b2_object_key.startsWith("telegram/leads/") || !row.last_b2_object_key.includes(channelSegment)) {
    throw new Error("TELEGRAM_CHECKPOINT_CHANNEL_KEY_MISMATCH");
  }
}

async function main() {
  const rows = parseCheckpoints(checkpointFile).slice(0, maxItems);
  mkdirSync(outDir, { recursive: true });
  if (rows.length === 0) {
    const summary = {
      schema: "geomacro.telegram-drain-proof.v1",
      checked_at: new Date().toISOString(),
      checkpoint_rows: 0,
      verified_objects: 0,
      status: "NO_AUTHORIZED_TELEGRAM_CHECKPOINTS",
    };
    writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(summary));
    return;
  }

  const b2 = createB2Client({ endpointUrl, accessKey, secretKey, bucket, allowedKeyPrefixes: ["telegram/leads/"] });
  const accepted = [];
  for (const row of rows) {
    validateCheckpoint(row);
    const compressed = await b2.get(row.last_b2_object_key);
    const actualSha = sha256(compressed);
    if (actualSha !== row.last_b2_sha256) throw new Error("TELEGRAM_B2_CHECKPOINT_HASH_MISMATCH");
    let envelope;
    try {
      envelope = JSON.parse(gunzipSync(compressed).toString("utf8"));
    } catch (error) {
      throw new Error(`TELEGRAM_B2_PAYLOAD_DECODE_FAILED:${error instanceof Error ? error.message : String(error)}`);
    }
    if (String(envelope.signal_id ?? "") !== row.last_signal_id) throw new Error("TELEGRAM_SIGNAL_ID_CHECKPOINT_MISMATCH");
    if (String(envelope.source_channel_key ?? "") !== row.source_channel_key) throw new Error("TELEGRAM_CHANNEL_CHECKPOINT_MISMATCH");
    if (Number(envelope.source_record_id ?? 0) !== row.last_message_id) throw new Error("TELEGRAM_MESSAGE_ID_CHECKPOINT_MISMATCH");
    const sanitized = verifyTelegramLeadEnvelope(envelope);
    const outputPath = path.join(outDir, `${row.last_signal_id}.json`);
    writeFileSync(outputPath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
    accepted.push({
      signal_id: row.last_signal_id,
      source_channel_key: row.source_channel_key,
      source_record_id: sanitized.source_record_id,
      published_at: sanitized.published_at,
      b2_object_key: row.last_b2_object_key,
      b2_sha256: row.last_b2_sha256,
      payload_file: outputPath,
      verification_status: "UNVERIFIED",
      scoring_eligible: false,
      commercial_eligible: false,
    });
  }

  const summary = {
    schema: "geomacro.telegram-drain-proof.v1",
    checked_at: new Date().toISOString(),
    checkpoint_rows: rows.length,
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
