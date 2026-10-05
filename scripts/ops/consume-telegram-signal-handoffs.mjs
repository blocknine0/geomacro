#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { createGriDbClient } from "../lib/gri-db-client.mjs";
import { verifyTelegramLeadEnvelope } from "../verify-telegram-lead-envelope.mjs";
import { createTelegramB2Reader, telegramB2Sha256 } from "./telegram-b2-reader.mjs";

const WRANGLER_VERSION = String(process.env.WRANGLER_VERSION ?? "4.146.0").trim();
const D1_DATABASE_NAME = String(process.env.D1_DATABASE_NAME ?? "geomacro-control-plane").trim();
const B2_ENDPOINT = String(process.env.B2_S3_ENDPOINT ?? "https://s3.us-east-005.backblazeb2.com").trim();
const B2_BUCKET = "geomacro-private-archive";
const BATCH_SIZE = Math.max(1, Math.min(100, Number(process.env.TELEGRAM_HANDOFF_BATCH_SIZE ?? 25)));
const OUT_DIR = "artifacts/telegram-handoff";
const D1_CONFIG = `${OUT_DIR}/wrangler.runtime.jsonc`;
const HASH_RE = /^[a-f0-9]{64}$/;
const SIGNAL_RE = /^tg_[a-f0-9]{32}$/;
const CHANNEL_RE = /^[a-z0-9_]{5,32}$/;

if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error("TELEGRAM_HANDOFF_D1_CONFIG_REQUIRED");
}
if (!process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY) {
  throw new Error("TELEGRAM_HANDOFF_B2_CONFIG_REQUIRED");
}
if (String(process.env.GRI_DB_MODE ?? "").trim().toLowerCase() !== "direct_postgres") {
  throw new Error("TELEGRAM_HANDOFF_DIRECT_POSTGRES_REQUIRED");
}

const db = createGriDbClient();
const b2 = createTelegramB2Reader({
  endpointUrl: B2_ENDPOINT,
  bucket: B2_BUCKET,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
});

function sqlText(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function wrangler(args) {
  return execFileSync("npx", ["-y", `wrangler@${WRANGLER_VERSION}`, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  });
}

function parseD1(raw) {
  const parsed = JSON.parse(raw);
  const envelopes = Array.isArray(parsed) ? parsed : [parsed];
  return envelopes.flatMap((entry) => Array.isArray(entry?.results) ? entry.results : []);
}

function resolveD1Config() {
  const list = JSON.parse(wrangler(["d1", "list", "--json"]));
  const row = list.find((item) => item.name === D1_DATABASE_NAME);
  const databaseId = String(row?.uuid ?? row?.id ?? "");
  if (!/^[0-9a-f-]{20,}$/i.test(databaseId)) throw new Error("TELEGRAM_HANDOFF_D1_DATABASE_NOT_FOUND");
  mkdirSync(OUT_DIR, { recursive: true });
  const example = readFileSync("workers/control-plane/wrangler.example.jsonc", "utf8");
  writeFileSync(D1_CONFIG, example.replace("REPLACE_WITH_D1_DATABASE_ID", databaseId), { encoding: "utf8", mode: 0o600 });
}

function d1Rows(command) {
  return parseD1(wrangler([
    "d1", "execute", "DB", "--remote", "--yes", "--json", "--config", D1_CONFIG, "--command", command,
  ]));
}

function d1Exec(command) {
  wrangler(["d1", "execute", "DB", "--remote", "--yes", "--config", D1_CONFIG, "--command", command]);
}

function stableFlashId(signalId) {
  if (!SIGNAL_RE.test(signalId)) throw new Error("TELEGRAM_HANDOFF_SIGNAL_ID_INVALID");
  return signalId;
}

function validateQueueRow(row) {
  const handoffId = String(row.handoff_id ?? "");
  const signalId = String(row.signal_id ?? "");
  const channel = String(row.source_channel_key ?? "");
  const sourceRecordId = String(row.source_record_id ?? "");
  const publishedAt = String(row.published_at ?? "");
  const objectKey = String(row.b2_object_key ?? "");
  const objectHash = String(row.b2_sha256 ?? "");
  const producerCommit = String(row.producer_commit ?? "");

  if (!SIGNAL_RE.test(signalId) || !handoffId.startsWith(`${signalId}:`)) throw new Error("TELEGRAM_HANDOFF_ID_INVALID");
  if (!CHANNEL_RE.test(channel)) throw new Error("TELEGRAM_HANDOFF_CHANNEL_INVALID");
  if (!/^\d+$/.test(sourceRecordId)) throw new Error("TELEGRAM_HANDOFF_SOURCE_RECORD_INVALID");
  if (!Number.isFinite(Date.parse(publishedAt))) throw new Error("TELEGRAM_HANDOFF_PUBLISHED_AT_INVALID");
  if (!HASH_RE.test(objectHash)) throw new Error("TELEGRAM_HANDOFF_B2_HASH_INVALID");
  if (!/^[a-f0-9]{40}$/.test(producerCommit)) throw new Error("TELEGRAM_HANDOFF_PRODUCER_COMMIT_INVALID");
  if (!/^telegram\/leads\//.test(objectKey)) throw new Error("TELEGRAM_HANDOFF_B2_KEY_INVALID");

  return { handoffId, signalId, channel, sourceRecordId, publishedAt, objectKey, objectHash, producerCommit };
}

async function persistCanonicalLead(envelope) {
  const normalized = verifyTelegramLeadEnvelope(envelope);
  const sourceId = normalized.source_id;
  const sourceRecordId = String(normalized.source_record_id);
  const now = new Date().toISOString();

  const existingResult = await db
    .from("live_flash_events")
    .select("flash_id,content_hash,source_version,first_seen_at,last_material_update_at,event_family_id,headline")
    .eq("source_id", sourceId)
    .eq("source_record_id", sourceRecordId)
    .maybeSingle();
  if (existingResult.error) throw new Error(`TELEGRAM_CANONICAL_LOOKUP_FAILED:${existingResult.error.message}`);

  const existing = existingResult.data;
  if (existing?.content_hash === envelope.content_hash) {
    return { flash_id: String(existing.flash_id), duplicate: true, source_version: Number(existing.source_version ?? 1) };
  }

  const sourceVersion = existing ? Number(existing.source_version ?? 1) + 1 : 1;
  const flashId = existing ? String(existing.flash_id) : stableFlashId(String(envelope.signal_id));
  const materialUpdate = Boolean(existing);

  const eventRow = {
    flash_id: flashId,
    source_id: sourceId,
    source_record_id: sourceRecordId,
    published_at: normalized.published_at,
    updated_at: now,
    headline: normalized.headline,
    body: null,
    source_channel: normalized.source_channel,
    source_channel_key: normalized.source_channel_key,
    source_url: normalized.source_url,
    event_type: `${normalized.signal_category}_TELEGRAM_LEAD`,
    severity: null,
    source_reliability: null,
    verification_status: "UNVERIFIED",
    commodity_tags: [],
    raw_payload: null,
    content_hash: envelope.content_hash,
    signal_category: normalized.signal_category,
    source_version: sourceVersion,
    material_update: materialUpdate,
    material_update_reason: materialUpdate ? "telegram_source_edit" : "initial_source_record",
    first_seen_at: existing?.first_seen_at ?? now,
    last_seen_at: now,
    last_material_update_at: materialUpdate ? now : (existing?.last_material_update_at ?? null),
    event_family_id: existing?.event_family_id ?? null,
  };

  const upsertResult = await db
    .from("live_flash_events")
    .upsert(eventRow, { onConflict: "source_id,source_record_id" });
  if (upsertResult.error) throw new Error(`TELEGRAM_CANONICAL_UPSERT_FAILED:${upsertResult.error.message}`);

  const versionResult = await db
    .from("live_flash_event_versions")
    .upsert({
      flash_id: flashId,
      event_family_id: existing?.event_family_id ?? null,
      source_version: sourceVersion,
      captured_at: now,
      published_at: normalized.published_at,
      headline: normalized.headline,
      content_hash: envelope.content_hash,
      signal_category: normalized.signal_category,
      material_update: materialUpdate,
      material_update_reason: materialUpdate ? "telegram_source_edit" : "initial_source_record",
    }, { onConflict: "flash_id,source_version", ignoreDuplicates: true });
  if (versionResult.error) throw new Error(`TELEGRAM_VERSION_UPSERT_FAILED:${versionResult.error.message}`);

  if (normalized.country_iso3) {
    const countryResult = await db
      .from("live_flash_event_countries")
      .upsert({
        flash_id: flashId,
        country_iso3: normalized.country_iso3,
        is_primary: true,
        confidence: 100,
        attribution_method: "TELEGRAM_AUTHORIZED_PUBLISHER_SUPPLIED_ISO3",
      }, { onConflict: "flash_id,country_iso3" });
    if (countryResult.error) throw new Error(`TELEGRAM_COUNTRY_UPSERT_FAILED:${countryResult.error.message}`);
  }

  return { flash_id: flashId, duplicate: false, source_version: sourceVersion };
}

function acknowledge(row, result) {
  const at = new Date().toISOString();
  d1Exec(`BEGIN;
UPDATE telegram_signal_handoff_queue
SET status='CONSUMED', attempts=attempts+1, last_error_code=NULL, consumed_at=${sqlText(at)}
WHERE handoff_id=${sqlText(row.handoffId)} AND status='PENDING';
UPDATE telegram_signal_consumer_state
SET last_consumed_handoff_id=${sqlText(row.handoffId)}, last_consumed_at=${sqlText(at)}, last_error_code=NULL, updated_at=${sqlText(at)}
WHERE id=1;
COMMIT;`);
  return { handoff_id: row.handoffId, ...result };
}

function recordFailure(row, error) {
  const code = String(error instanceof Error ? error.message : error).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 120) || "UNKNOWN";
  const at = new Date().toISOString();
  d1Exec(`BEGIN;
UPDATE telegram_signal_handoff_queue
SET attempts=attempts+1, last_error_code=${sqlText(code)}
WHERE handoff_id=${sqlText(row.handoffId)} AND status='PENDING';
UPDATE telegram_signal_consumer_state
SET last_error_code=${sqlText(code)}, updated_at=${sqlText(at)}
WHERE id=1;
COMMIT;`);
  return code;
}

resolveD1Config();
const rows = d1Rows(`SELECT handoff_id,signal_id,source_channel_key,source_record_id,published_at,b2_object_key,b2_sha256,producer_commit,attempts,created_at FROM telegram_signal_handoff_queue WHERE status='PENDING' ORDER BY created_at ASC LIMIT ${BATCH_SIZE};`);
const consumed = [];
const failed = [];

for (const rawRow of rows) {
  let row;
  try {
    row = validateQueueRow(rawRow);
    const packed = await b2.get(row.objectKey);
    if (telegramB2Sha256(packed) !== row.objectHash) throw new Error("TELEGRAM_B2_READBACK_HASH_MISMATCH");
    const envelope = JSON.parse(gunzipSync(packed, { maxOutputLength: 1_000_000 }).toString("utf8"));
    if (String(envelope.signal_id ?? "") !== row.signalId ||
        String(envelope.source_channel_key ?? "") !== row.channel ||
        String(envelope.source_record_id ?? "") !== row.sourceRecordId ||
        String(envelope.published_at ?? "") !== row.publishedAt) {
      throw new Error("TELEGRAM_HANDOFF_ENVELOPE_POINTER_MISMATCH");
    }
    const result = await persistCanonicalLead(envelope);
    consumed.push(acknowledge(row, result));
  } catch (error) {
    const fallback = row ?? {
      handoffId: String(rawRow?.handoff_id ?? "invalid"),
    };
    const code = row ? recordFailure(fallback, error) : String(error instanceof Error ? error.message : error).slice(0, 120);
    failed.push({ handoff_id: fallback.handoffId, error: code });
  }
}

const artifact = {
  schema: "geomacro.telegram-handoff-consumer-proof.v1",
  checked_at: new Date().toISOString(),
  pending_selected: rows.length,
  consumed_count: consumed.length,
  failed_count: failed.length,
  consumed,
  failed,
  storage: { durable: "B2", queue: "D1", canonical_truth: "live_flash_events" },
  supabase_postgrest_used: false,
  raw_telegram_persisted: false,
  commercial_promotion_performed: false,
};
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/consumer-proof.json`, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(JSON.stringify(artifact, null, 2));
if (failed.length) process.exitCode = 1;
