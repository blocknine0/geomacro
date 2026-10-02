#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const LIVE_PROOF_KEY = "geomacro-evidence/v1/live/live-snapshot-proof.json";
const GOVERNED_SNAPSHOT_KEY = "geomacro-evidence/v1/live/agent-governed-modules/latest.json.gz";
const GOVERNED_PROOF_KEY = "geomacro-evidence/v1/live/agent-governed-modules/latest-proof.json";
const WGI_SOURCE = "world_bank_wgi_political_stability";
const WDI_SOURCE = "world_bank_indicators";
const GOVERNED_READ_FAILURE = /B2_AGENT_MODULE_(?:SOURCE_RIGHTS|WGI|WDI_LATEST|WDI_RAW)_READ_FAILED/;

const LIVE_REQUIRED = new Map([
  ["geomacro-evidence/v1/live/public-intelligence/latest.json.gz", "geomacro.public-intelligence-live.v1"],
  ["geomacro-evidence/v1/live/risk-indices/latest.json.gz", "geomacro.public-risk-live.v1"],
  ["geomacro-evidence/v1/live/source-network-status/latest.json.gz", "geomacro.source-network-live.v1"],
  ["geomacro-evidence/v1/live/commercial-source-rights/latest.json.gz", "geomacro.commercial-source-rights-live.v1"],
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const isHex64 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const isIsoDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const asRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;

function quotaRestricted(output) {
  const text = String(output ?? "");
  return /exceed_egress_quota/i.test(text)
    && /service for this project is restricted|project owner must upgrade|remove spend caps/i.test(text);
}

async function confirmGovernedQuotaRestriction(output) {
  if (!GOVERNED_READ_FAILURE.test(String(output ?? ""))) return false;
  if (
    process.env.APP_SUPABASE_URL !== PROJECT_URL ||
    !process.env.APP_SUPABASE_SERVICE_ROLE_KEY
  ) return false;

  const db = createClient(
    PROJECT_URL,
    process.env.APP_SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } },
  );
  const { error } = await db
    .from("live_external_sources")
    .select("source_id")
    .limit(1);
  if (!error) return false;
  return quotaRestricted([
    error.message,
    error.details,
    error.hint,
    error.code,
  ].filter(Boolean).join(" "));
}

function assertB2Config() {
  if (
    String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim() !== B2_ENDPOINT ||
    !process.env.B2_KEY_ID ||
    !process.env.B2_APPLICATION_KEY
  ) {
    throw new Error("B2_PRESERVATION_CONFIG_REQUIRED");
  }
}

function b2Client() {
  assertB2Config();
  return createB2Client({
    endpointUrl: B2_ENDPOINT,
    accessKey: process.env.B2_KEY_ID,
    secretKey: process.env.B2_APPLICATION_KEY,
    bucket: B2_BUCKET,
  });
}

async function readJsonObject(b2, key) {
  const bytes = await b2.get(key);
  let json;
  try {
    json = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`B2_PRESERVED_JSON_INVALID_${key}`);
  }
  return { bytes, json };
}

function snapshotAgeSeconds(generatedAt) {
  const ms = Date.now() - Date.parse(generatedAt);
  if (!Number.isFinite(ms) || ms < 0) throw new Error("B2_PRESERVED_GENERATED_AT_INVALID");
  return Math.floor(ms / 1000);
}

async function verifyLivePublicPreservation() {
  const b2 = b2Client();
  const { json: proof } = await readJsonObject(b2, LIVE_PROOF_KEY);
  const record = asRecord(proof);
  if (
    !record ||
    record.schema !== "geomacro.live-snapshot-proof.v1" ||
    record.source_project !== PROJECT_REF ||
    !isIsoDate(record.generated_at) ||
    !Array.isArray(record.entries)
  ) throw new Error("B2_PRESERVED_LIVE_PROOF_INVALID");

  const byKey = new Map();
  for (const rawEntry of record.entries) {
    const entry = asRecord(rawEntry);
    if (!entry || typeof entry.key !== "string" || byKey.has(entry.key)) {
      throw new Error("B2_PRESERVED_LIVE_PROOF_ENTRY_INVALID");
    }
    byKey.set(entry.key, entry);
  }

  for (const [key, schema] of LIVE_REQUIRED) {
    const entry = byKey.get(key);
    if (
      !entry ||
      entry.schema !== schema ||
      !isHex64(entry.sha256) ||
      !Number.isInteger(entry.bytes) ||
      entry.bytes <= 0
    ) throw new Error(`B2_PRESERVED_LIVE_PROOF_MISSING_${schema}`);

    const packed = await b2.get(key);
    if (packed.length !== entry.bytes || sha256(packed) !== String(entry.sha256).toLowerCase()) {
      throw new Error(`B2_PRESERVED_LIVE_HASH_INVALID_${schema}`);
    }

    let restored;
    try {
      restored = JSON.parse(gunzipSync(packed).toString("utf8"));
    } catch {
      throw new Error(`B2_PRESERVED_LIVE_RESTORE_INVALID_${schema}`);
    }
    if (
      restored?.schema !== schema ||
      restored?.generated_at !== record.generated_at ||
      restored?.source_project !== PROJECT_REF
    ) throw new Error(`B2_PRESERVED_LIVE_BINDING_INVALID_${schema}`);

    if (schema === "geomacro.public-intelligence-live.v1") {
      if (!Array.isArray(restored.rows) || restored.rows.length < 3 || restored.rows.length > 300) {
        throw new Error("B2_PRESERVED_LIVE_INTELLIGENCE_ROWS_INVALID");
      }
      const categories = new Set(restored.rows.map((row) => String(row?.category ?? "").toLowerCase()));
      for (const category of ["geopolitics", "macro", "rare_earth"]) {
        if (!categories.has(category)) throw new Error(`B2_PRESERVED_LIVE_CATEGORY_MISSING_${category}`);
      }
    }
    if (schema === "geomacro.public-risk-live.v1") {
      if (
        restored?.data?.verificationStatus !== "verified" ||
        !isHex64(restored?.data?.proofHash) ||
        !isHex64(restored?.data?.calculationHash)
      ) throw new Error("B2_PRESERVED_LIVE_RISK_PROOF_INVALID");
    }
    if (schema === "geomacro.source-network-live.v1") {
      for (const field of ["source_network_100_complete", "gdelt_gal_freshness_complete", "source_network_launch_complete"]) {
        if (typeof restored?.data?.[field] !== "boolean") throw new Error("B2_PRESERVED_LIVE_SOURCE_NETWORK_INVALID");
      }
    }
    if (schema === "geomacro.commercial-source-rights-live.v1") {
      if (!Array.isArray(restored.rows) || restored.rows.length === 0) {
        throw new Error("B2_PRESERVED_LIVE_SOURCE_RIGHTS_INVALID");
      }
    }
  }

  return {
    schema: "geomacro.b2-live-preservation.v1",
    generated_at: record.generated_at,
    snapshot_age_seconds: snapshotAgeSeconds(record.generated_at),
    required_objects_verified: LIVE_REQUIRED.size,
    proof_key: LIVE_PROOF_KEY,
  };
}

async function verifyGovernedPreservation() {
  const b2 = b2Client();
  const { json: proof } = await readJsonObject(b2, GOVERNED_PROOF_KEY);
  const record = asRecord(proof);
  if (
    !record ||
    record.schema !== "geomacro.agent-governed-modules-proof.v1" ||
    record.source_project !== PROJECT_REF ||
    record.snapshot_key !== GOVERNED_SNAPSHOT_KEY ||
    !isIsoDate(record.generated_at) ||
    !isHex64(record.compressed_sha256) ||
    !Number.isInteger(record.compressed_bytes) ||
    record.compressed_bytes <= 0 ||
    !Number.isInteger(record.entries) ||
    record.entries <= 0 ||
    record.full_b2_readback_verified !== true ||
    record.exact_gzip_restore_verified !== true ||
    record.raw_source_material_in_snapshot !== false ||
    !Array.isArray(record.included_source_ids) ||
    !record.included_source_ids.includes(WGI_SOURCE) ||
    !record.included_source_ids.includes(WDI_SOURCE)
  ) throw new Error("B2_PRESERVED_GOVERNED_PROOF_INVALID");

  const packed = await b2.get(GOVERNED_SNAPSHOT_KEY);
  if (
    packed.length !== record.compressed_bytes ||
    sha256(packed) !== String(record.compressed_sha256).toLowerCase()
  ) throw new Error("B2_PRESERVED_GOVERNED_HASH_INVALID");

  let restored;
  try {
    restored = JSON.parse(gunzipSync(packed).toString("utf8"));
  } catch {
    throw new Error("B2_PRESERVED_GOVERNED_RESTORE_INVALID");
  }
  if (
    restored?.schema !== "geomacro.agent-governed-modules-live.v1" ||
    restored?.generated_at !== record.generated_at ||
    restored?.source_project !== PROJECT_REF ||
    restored?.delivery_boundary !== "DERIVED_STATE_ONLY_NO_RAW_SOURCE_MATERIAL" ||
    !Array.isArray(restored?.entries) ||
    restored.entries.length !== record.entries
  ) throw new Error("B2_PRESERVED_GOVERNED_BINDING_INVALID");

  const seen = new Set();
  for (const rawEntry of restored.entries) {
    const entry = asRecord(rawEntry);
    const country = String(entry?.country_iso3 ?? "");
    const module = String(entry?.module ?? "");
    const sourceId = String(entry?.source_id ?? "");
    const normalized = entry?.source_normalized_hashes;
    const state = asRecord(entry?.state);
    const key = `${country}:${module}`;
    if (
      !entry ||
      !/^[A-Z]{3}$/.test(country) ||
      !["political_governance", "macro_monetary", "sovereign_fiscal", "external_fx"].includes(module) ||
      ![WGI_SOURCE, WDI_SOURCE].includes(sourceId) ||
      !isIsoDate(entry.source_observed_at) ||
      !Array.isArray(normalized) ||
      normalized.length === 0 ||
      normalized.some((value) => !isHex64(value)) ||
      !state ||
      state.commercial_eligibility_status !== "VERIFIED" ||
      seen.has(key)
    ) throw new Error("B2_PRESERVED_GOVERNED_ENTRY_INVALID");
    seen.add(key);
  }

  return {
    schema: "geomacro.b2-governed-preservation.v1",
    generated_at: record.generated_at,
    snapshot_age_seconds: snapshotAgeSeconds(record.generated_at),
    entries_verified: restored.entries.length,
    proof_key: GOVERNED_PROOF_KEY,
    snapshot_key: GOVERNED_SNAPSHOT_KEY,
  };
}

const mode = process.argv[2];
const target = mode === "live-public"
  ? "scripts/ops/publish-b2-live-snapshots.ts"
  : mode === "governed-modules"
    ? "scripts/ops/publish-b2-agent-governed-modules.ts"
    : null;
if (!target) throw new Error("B2_MAINTENANCE_MODE_INVALID");

const child = spawnSync(process.execPath, [target], {
  env: process.env,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
if (child.error) throw child.error;
if (child.status === 0) process.exit(0);

const combined = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
let restrictionConfirmation = quotaRestricted(combined) ? "child_output" : null;
if (!restrictionConfirmation && mode === "governed-modules") {
  restrictionConfirmation = await confirmGovernedQuotaRestriction(combined) ? "direct_probe" : null;
}
if (!restrictionConfirmation) {
  process.exit(typeof child.status === "number" && child.status > 0 ? child.status : 1);
}

const preserved = mode === "live-public"
  ? await verifyLivePublicPreservation()
  : await verifyGovernedPreservation();

console.log(JSON.stringify({
  ok: true,
  maintenance_mode: "verified_preserved_snapshot_noop",
  reason: "supabase_exceed_egress_quota",
  restriction_confirmation: restrictionConfirmation,
  wrote_new_snapshot: false,
  freshness_advanced: false,
  ...preserved,
}));
