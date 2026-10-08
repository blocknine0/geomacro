#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { assemblePublicGlobalRisk } from "../../src/lib/global-risk-assemble.ts";
import { validateGlobalRiskContinuity } from "../../src/lib/global-risk-continuity.ts";
import { riskIndicesFromGlobalRisk } from "../../src/lib/risk-indices-from-global-risk.ts";
import { PUBLIC_RISK_INDICES_CONTRACT_VERSION } from "../../src/lib/risk-indices.types.ts";
import { createB2Client } from "./b2-s3-client.mjs";
import { publishB2VerifiedHotSnapshot } from "./publish-b2-verified-hot-snapshot.mjs";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const METHODOLOGY = "gri-v1.2.0";
const LIVE_KEY = "geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz";
const LIVE_PROOF_KEY = "geomacro-evidence/v1/live/risk-indices-independent/latest-proof.json";
const HISTORY_PREFIX = `geomacro-evidence/v1/history/risk-indices/${METHODOLOGY}`;
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

function terminateSqlStatement(sql) {
  const statement = String(sql ?? "").trim().replace(/;+\s*$/u, "");
  if (!statement) throw new Error("RISK_INDICES_SQL_EMPTY");
  return `${statement};`;
}

function psqlRows(dbUrl, sql) {
  const wrapped = `
    begin read only;
    set local statement_timeout = '20s';
    set local lock_timeout = '5s';
    ${terminateSqlStatement(sql)}
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
  ) throw new Error("B2_RISK_INDICES_CONFIG_REQUIRED");
}

function safeSnapshotId(value) {
  const id = String(value ?? "").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new Error("RISK_INDICES_SNAPSHOT_ID_INVALID");
  }
  return id;
}

function assertIndices(data) {
  if (
    data?.contractVersion !== PUBLIC_RISK_INDICES_CONTRACT_VERSION ||
    data?.parentMethodologyVersion !== METHODOLOGY ||
    data?.verificationStatus !== "verified" ||
    !/^[a-f0-9]{64}$/.test(String(data?.proofHash ?? "")) ||
    !Array.isArray(data?.indices) ||
    data.indices.length !== 3
  ) throw new Error("RISK_INDICES_CONTRACT_INVALID");

  const expected = new Set(["geopolitics", "macro", "critical_minerals"]);
  for (const index of data.indices) {
    if (!expected.delete(index?.key)) throw new Error("RISK_INDICES_KEY_INVALID");
    if (
      index?.status !== "available" ||
      !Number.isFinite(Number(index?.score)) ||
      !Array.isArray(index?.series?.["7D"]?.buckets) ||
      index.series["7D"].buckets.length < 2 ||
      !Array.isArray(index?.series?.["30D"]?.buckets) ||
      index.series["30D"].buckets.length < index.series["7D"].buckets.length
    ) throw new Error(`RISK_INDICES_HISTORY_INVALID_${String(index?.key ?? "unknown")}`);
  }
  if (expected.size !== 0) throw new Error("RISK_INDICES_DOMAIN_MISSING");
}

const dbUrl = authoritativeDbUrl();
assertB2Config();
const snapshots = readSnapshots(dbUrl);
if (snapshots.length < 2) throw new Error("RISK_INDICES_HISTORY_INSUFFICIENT");
if (snapshots.some((snapshot) => snapshot.verification_status !== "verified")) {
  throw new Error("RISK_INDICES_HISTORY_UNVERIFIED_ROW");
}
const latestSnapshot = snapshots[0];
const recentEvents = readRecentEvents(dbUrl, latestSnapshot.as_of);
const canonicalRisk = assemblePublicGlobalRisk(snapshots, recentEvents);
const continuity = validateGlobalRiskContinuity(canonicalRisk);
if (!continuity.ok) throw new Error(`RISK_INDICES_CANONICAL_CONTINUITY_REJECTED_${continuity.code}`);

// The immutable archive must not change merely because wall-clock age changed.
// Anchor its projection to the verified snapshot timestamp. The live projection
// remains wall-clock aware so it can label old evidence as last_verified.
const immutableProjectionAt = Date.parse(canonicalRisk.snapshotAsOf);
if (!Number.isFinite(immutableProjectionAt)) throw new Error("RISK_INDICES_SNAPSHOT_TIME_INVALID");
const immutableIndices = riskIndicesFromGlobalRisk(canonicalRisk, immutableProjectionAt);
const indices = riskIndicesFromGlobalRisk(canonicalRisk);
assertIndices(immutableIndices);
assertIndices(indices);

const b2 = createB2Client({
  endpointUrl: B2_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: B2_BUCKET,
});

const snapshotId = safeSnapshotId(indices.snapshotId);
const historyKey = `${HISTORY_PREFIX}/${snapshotId}.json.gz`;
const historyValue = {
  schema: "geomacro.public-risk-indices-history.v1",
  source_project: PROJECT_REF,
  contract_version: immutableIndices.contractVersion,
  parent_methodology_version: immutableIndices.parentMethodologyVersion,
  snapshot_id: immutableIndices.snapshotId,
  snapshot_as_of: immutableIndices.snapshotAsOf,
  verified_snapshot_rows: snapshots,
  data: immutableIndices,
};
const historyRaw = JSON.stringify(historyValue);
const existingHistory = await b2.getOptional(historyKey);
if (existingHistory) {
  let restored;
  try {
    restored = gunzipSync(existingHistory).toString("utf8");
  } catch {
    throw new Error("B2_RISK_INDICES_HISTORY_EXISTING_RESTORE_INVALID");
  }
  if (restored !== historyRaw) throw new Error("B2_RISK_INDICES_HISTORY_IMMUTABILITY_VIOLATION");
} else {
  const packedHistory = gzipSync(Buffer.from(historyRaw), { level: 9 });
  await b2.put(historyKey, packedHistory);
  const historyReadback = await b2.get(historyKey);
  if (gunzipSync(historyReadback).toString("utf8") !== historyRaw) {
    throw new Error("B2_RISK_INDICES_HISTORY_READBACK_INVALID");
  }
}

const generatedAt = new Date().toISOString();
const liveValue = {
  schema: "geomacro.public-risk-indices-live.v1",
  generated_at: generatedAt,
  source_project: PROJECT_REF,
  history_key: historyKey,
  data: indices,
};
const packedLive = gzipSync(Buffer.from(JSON.stringify(liveValue)), { level: 9 });
const liveDigest = sha256(packedLive);
await b2.put(LIVE_KEY, packedLive);
const liveReadback = await b2.get(LIVE_KEY);
if (liveReadback.length !== packedLive.length || sha256(liveReadback) !== liveDigest) {
  throw new Error("B2_RISK_INDICES_LIVE_HASH_INVALID");
}
let restoredLive;
try {
  restoredLive = JSON.parse(gunzipSync(liveReadback).toString("utf8"));
} catch {
  throw new Error("B2_RISK_INDICES_LIVE_RESTORE_INVALID");
}
assertIndices(restoredLive?.data);
if (
  restoredLive?.schema !== liveValue.schema ||
  restoredLive?.generated_at !== generatedAt ||
  restoredLive?.history_key !== historyKey ||
  restoredLive?.data?.snapshotId !== indices.snapshotId
) throw new Error("B2_RISK_INDICES_LIVE_BINDING_INVALID");

const proof = Buffer.from(JSON.stringify({
  schema: "geomacro.public-risk-indices-live-proof.v1",
  generated_at: generatedAt,
  source_project: PROJECT_REF,
  live_key: LIVE_KEY,
  history_key: historyKey,
  contract_version: indices.contractVersion,
  parent_methodology_version: indices.parentMethodologyVersion,
  snapshot_id: indices.snapshotId,
  snapshot_as_of: indices.snapshotAsOf,
  verified_snapshot_rows: snapshots.length,
  compressed_sha256: liveDigest,
  compressed_bytes: packedLive.length,
  full_b2_readback_verified: true,
  exact_gzip_restore_verified: true,
}));
await b2.put(LIVE_PROOF_KEY, proof);
const proofReadback = await b2.get(LIVE_PROOF_KEY);
if (sha256(proofReadback) !== sha256(proof)) throw new Error("B2_RISK_INDICES_PROOF_READBACK_INVALID");
const hotSnapshot = await publishB2VerifiedHotSnapshot({
  product: "risk-indices",
  value: liveValue,
  proof: JSON.parse(proof.toString("utf8")),
});

const publishedLiveArtifactPath = String(
  process.env.RISK_INDICES_PUBLISHED_LIVE_ARTIFACT_PATH ?? "",
).trim();
if (publishedLiveArtifactPath) {
  mkdirSync(dirname(publishedLiveArtifactPath), { recursive: true });
  writeFileSync(
    publishedLiveArtifactPath,
    JSON.stringify(restoredLive, null, 2) + "\n",
    "utf8",
  );
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.public-risk-indices-direct-postgres-publish.v1",
  authority_read: "direct-postgres-read-only",
  authority_serve: "backblaze-b2-risk-indices-edge",
  source_discovery_owner: "auto-ingest-news",
  history_projection_anchor: "snapshot-as-of",
  contract_version: indices.contractVersion,
  parent_methodology_version: indices.parentMethodologyVersion,
  snapshot_id: indices.snapshotId,
  snapshot_as_of: indices.snapshotAsOf,
  verified_snapshot_rows_read: snapshots.length,
  history_key: historyKey,
  history_existing: Boolean(existingHistory),
  live_key: LIVE_KEY,
  proof_key: LIVE_PROOF_KEY,
  live_sha256: liveDigest,
  destructive_change: false,
  synthetic_history: false,
  synthetic_current_score: false,
  b2_readback_verified: true,
  d1_hot_snapshot_published: true,
  d1_payload_sha256: hotSnapshot.payload_sha256,
  d1_expires_at: hotSnapshot.expires_at,
}));
