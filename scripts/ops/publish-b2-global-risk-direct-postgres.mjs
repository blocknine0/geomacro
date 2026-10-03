#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { assemblePublicGlobalRisk } from "../../src/lib/global-risk-assemble.ts";
import { validateGlobalRiskContinuity } from "../../src/lib/global-risk-continuity.ts";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const METHODOLOGY = "gri-v1.2.0";
const LIVE_KEY = "geomacro-evidence/v1/live/global-risk/latest.json.gz";
const LIVE_PROOF_KEY = "geomacro-evidence/v1/live/global-risk/latest-proof.json";
const HISTORY_PREFIX = `geomacro-evidence/v1/history/global-risk/${METHODOLOGY}`;
const SNAPSHOT_LIMIT = 1000;
const EVENT_LIMIT = 24;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function authoritativeDbUrl() {
  const raw = String(process.env.SUPABASE_DB_URL ?? "").trim();
  if (!raw) throw new Error("SUPABASE_DB_URL_REQUIRED");
  let db;
  try {
    db = new URL(raw);
  } catch {
    throw new Error("SUPABASE_DB_URL_INVALID");
  }
  const direct = db.hostname === `db.${PROJECT_REF}.supabase.co` && db.username === "postgres";
  const pooler = db.hostname.endsWith(".pooler.supabase.com") && db.username === `postgres.${PROJECT_REF}`;
  if (
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    (!direct && !pooler) ||
    !db.password ||
    db.pathname !== "/postgres"
  ) throw new Error("SUPABASE_DB_URL_NOT_AUTHORITATIVE");
  return raw;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function psqlRows(dbUrl, sql) {
  const wrapped = `
    begin read only;
    set local statement_timeout = '20s';
    set local lock_timeout = '5s';
    ${sql}
    commit;
  `;
  const stdout = execFileSync(
    "psql",
    [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-Atqc", wrapped],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readSnapshots(dbUrl) {
  return psqlRows(
    dbUrl,
    `
      select row_to_json(t)::text
      from (
        select
          id,as_of,methodology_version,methodology_hash,input_hash,evidence_hash,
          calculation_hash,disposition_hash,candidate_event_count,proof_version,
          proof_hash,verification_status,reconciliation_residual,change_residual,
          raw_score,display_score,coverage,weighted_confidence,active_categories,
          event_count,source_count,independent_story_count,story_correlation_version,
          story_correlation_prompt_version,category_breakdown,previous_as_of,
          previous_raw_score,previous_display_score,change_points,change_hash,
          change_attribution,explanation,status
        from public.gri_snapshots
        where status = 'published'
          and verification_status = 'verified'
          and methodology_version = ${sqlLiteral(METHODOLOGY)}
        order by as_of desc
        limit ${SNAPSHOT_LIMIT}
      ) t
    `,
  );
}

function readRecentEvents(dbUrl, snapshotAsOf) {
  return psqlRows(
    dbUrl,
    `
      select row_to_json(t)::text
      from (
        select
          id,source_title,summary,category,severity,confidence,delta,source_name,
          source_domain,source_url,created_at,published_at,classification_provider,
          classification_model,classification_version,classification_prompt_version,
          classification_input_hash,market_created
        from public.events
        where category in ('geopolitics','macro','rare_earth')
          and created_at > ${sqlLiteral(snapshotAsOf)}::timestamptz - interval '72 hours'
          and created_at <= ${sqlLiteral(snapshotAsOf)}::timestamptz
        order by created_at desc
        limit ${EVENT_LIMIT}
      ) t
    `,
  );
}

function assertB2Config() {
  if (
    String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim() !== B2_ENDPOINT ||
    !process.env.B2_KEY_ID ||
    !process.env.B2_APPLICATION_KEY
  ) throw new Error("B2_GLOBAL_RISK_CONFIG_REQUIRED");
}

function safeSnapshotId(value) {
  const id = String(value ?? "").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new Error("GLOBAL_RISK_SNAPSHOT_ID_INVALID");
  }
  return id;
}

const dbUrl = authoritativeDbUrl();
assertB2Config();
const snapshots = readSnapshots(dbUrl);
if (snapshots.length < 2) throw new Error("GLOBAL_RISK_HISTORY_INSUFFICIENT");
if (snapshots.some((snapshot) => snapshot.verification_status !== "verified")) {
  throw new Error("GLOBAL_RISK_HISTORY_UNVERIFIED_ROW");
}
const latestSnapshot = snapshots[0];
const recentEvents = readRecentEvents(dbUrl, latestSnapshot.as_of);
const risk = assemblePublicGlobalRisk(snapshots, recentEvents);
const continuity = validateGlobalRiskContinuity(risk);
if (!continuity.ok) throw new Error(`GLOBAL_RISK_CONTINUITY_REJECTED_${continuity.code}`);

const b2 = createB2Client({
  endpointUrl: B2_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: B2_BUCKET,
});

// Immutable archive: one exact verified continuity package per snapshot. The
// package includes every verified same-methodology snapshot row used to build
// the chart, so B2 preserves the auditable historical source material rather
// than only the projected buckets. Existing objects are never overwritten.
const snapshotId = safeSnapshotId(risk.snapshotId);
const historyKey = `${HISTORY_PREFIX}/${snapshotId}.json.gz`;
const historyValue = {
  schema: "geomacro.public-global-risk-history.v1",
  source_project: PROJECT_REF,
  methodology_version: risk.methodologyVersion,
  snapshot_id: risk.snapshotId,
  snapshot_as_of: risk.snapshotAsOf,
  verified_snapshot_rows: snapshots,
  data: risk,
};
const historyRaw = JSON.stringify(historyValue);
const existingHistory = await b2.getOptional(historyKey);
if (existingHistory) {
  let restored;
  try {
    restored = gunzipSync(existingHistory).toString("utf8");
  } catch {
    throw new Error("B2_GLOBAL_RISK_HISTORY_EXISTING_RESTORE_INVALID");
  }
  if (restored !== historyRaw) {
    throw new Error("B2_GLOBAL_RISK_HISTORY_IMMUTABILITY_VIOLATION");
  }
} else {
  const packedHistory = gzipSync(Buffer.from(historyRaw), { level: 9 });
  await b2.put(historyKey, packedHistory);
  const historyReadback = await b2.get(historyKey);
  if (gunzipSync(historyReadback).toString("utf8") !== historyRaw) {
    throw new Error("B2_GLOBAL_RISK_HISTORY_READBACK_INVALID");
  }
}

// Dedicated live package: independently promotable without rewriting the
// unrelated public-intelligence/source-rights/source-network proof bundle.
const generatedAt = new Date().toISOString();
const liveValue = {
  schema: "geomacro.public-global-risk-live.v1",
  generated_at: generatedAt,
  source_project: PROJECT_REF,
  history_key: historyKey,
  data: risk,
};
const packedLive = gzipSync(Buffer.from(JSON.stringify(liveValue)), { level: 9 });
const liveDigest = sha256(packedLive);
await b2.put(LIVE_KEY, packedLive);
const liveReadback = await b2.get(LIVE_KEY);
if (liveReadback.length !== packedLive.length || sha256(liveReadback) !== liveDigest) {
  throw new Error("B2_GLOBAL_RISK_LIVE_HASH_INVALID");
}
let restoredLive;
try {
  restoredLive = JSON.parse(gunzipSync(liveReadback).toString("utf8"));
} catch {
  throw new Error("B2_GLOBAL_RISK_LIVE_RESTORE_INVALID");
}
if (
  restoredLive?.schema !== liveValue.schema ||
  restoredLive?.generated_at !== generatedAt ||
  restoredLive?.history_key !== historyKey ||
  restoredLive?.data?.snapshotId !== risk.snapshotId ||
  !validateGlobalRiskContinuity(restoredLive.data).ok
) throw new Error("B2_GLOBAL_RISK_LIVE_BINDING_INVALID");

const proof = Buffer.from(JSON.stringify({
  schema: "geomacro.public-global-risk-live-proof.v1",
  generated_at: generatedAt,
  source_project: PROJECT_REF,
  live_key: LIVE_KEY,
  history_key: historyKey,
  methodology_version: risk.methodologyVersion,
  snapshot_id: risk.snapshotId,
  snapshot_as_of: risk.snapshotAsOf,
  verified_snapshot_rows: snapshots.length,
  compressed_sha256: liveDigest,
  compressed_bytes: packedLive.length,
  full_b2_readback_verified: true,
  exact_gzip_restore_verified: true,
}));
await b2.put(LIVE_PROOF_KEY, proof);
const proofReadback = await b2.get(LIVE_PROOF_KEY);
if (sha256(proofReadback) !== sha256(proof)) {
  throw new Error("B2_GLOBAL_RISK_PROOF_READBACK_INVALID");
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.public-global-risk-direct-postgres-publish.v1",
  authority_read: "direct-postgres-read-only",
  authority_serve: "backblaze-b2",
  history_anchor: "latest-verified-snapshot",
  methodology_version: risk.methodologyVersion,
  snapshot_id: risk.snapshotId,
  snapshot_as_of: risk.snapshotAsOf,
  verified_snapshot_rows_read: snapshots.length,
  recent_events_read: recentEvents.length,
  history_key: historyKey,
  history_existing: Boolean(existingHistory),
  live_key: LIVE_KEY,
  proof_key: LIVE_PROOF_KEY,
  live_sha256: liveDigest,
  destructive_change: false,
  synthetic_history: false,
  synthetic_current_score: false,
  b2_readback_verified: true,
}));
