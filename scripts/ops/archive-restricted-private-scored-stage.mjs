#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { createB2Client } from "./b2-s3-client.mjs";
import { createD1ControlPlaneStateClient } from "../lib/d1-control-plane-state.mjs";
import { verifyPrivateScoringD1Checkpoint } from "../lib/private-scoring-d1-checkpoint-proof.mjs";
import {
  STAGE_DOMAINS,
  CANONICAL_CLASSIFIER_VERSION,
  makePrivateStageBundle,
  validatePrivateStageBundle,
  sha256,
} from "../lib/restricted-private-scored-stage.mjs";

const ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET = "geomacro-private-archive";
const PRIVATE_PREFIX = "geomacro-evidence/v1/private/restricted-current-scoring/";
const ARTIFACT_DIR = "artifacts/restricted-current-scoring";
const MAX_INPUT_BYTES = 80 * 1024;
const MAX_B2_REQUESTS = 6;
const ALLOWED_MODE = "--private-stage-only";

function ensureConfig() {
  if (!process.argv.includes(ALLOWED_MODE)) {
    throw new Error("PRIVATE_SCORING_MANUAL_STAGE_ONLY");
  }
  if (
    String(process.env.B2_S3_ENDPOINT ?? "").trim() !== ENDPOINT ||
    !process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY ||
    !process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID ||
    !process.env.D1_DATABASE_ID
  ) {
    throw new Error("PRIVATE_SCORING_B2_D1_CONFIG_MISSING");
  }
  const requestBudget = Number(process.env.B2_REQUEST_BUDGET);
  if (!Number.isInteger(requestBudget) || requestBudget < 2 ||
      requestBudget > MAX_B2_REQUESTS) {
    throw new Error("PRIVATE_SCORING_B2_REQUEST_BUDGET_UNSAFE");
  }
  if (process.env.SUPABASE_DB_URL || process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.APP_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("PRIVATE_SCORING_SUPABASE_CREDENTIALS_FORBIDDEN");
  }
}

function loadCandidates() {
  const collected = [];
  for (const category of STAGE_DOMAINS) {
    const filename = `${ARTIFACT_DIR}/${category}.json`;
    const raw = readFileSync(filename);
    if (raw.byteLength > MAX_INPUT_BYTES) {
      throw new Error("PRIVATE_SCORING_CANDIDATES_TOO_LARGE");
    }
    let parsed;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new Error("PRIVATE_SCORING_CANDIDATES_JSON_INVALID");
    }
    if (parsed?.schema !== "geomacro.private-scoring-candidates.v1" ||
        parsed?.category !== category ||
        parsed?.classifier_version !== CANONICAL_CLASSIFIER_VERSION ||
        parsed?.private_only !== true ||
        !Array.isArray(parsed?.records) ||
        parsed.records.length > 2 ||
        parsed.records.some((row) => row?.category !== category)) {
      throw new Error(`PRIVATE_SCORING_CANDIDATES_INVALID:${category}`);
    }
    collected.push(...parsed.records);
  }
  if (!collected.length) throw new Error("PRIVATE_SCORING_NO_CANONICAL_SCORES");
  return collected;
}

ensureConfig();
const stage = makePrivateStageBundle(loadCandidates());
validatePrivateStageBundle(stage);
const raw = Buffer.from(JSON.stringify(stage), "utf8");
if (raw.byteLength > MAX_INPUT_BYTES) {
  throw new Error("PRIVATE_SCORING_STAGE_BUNDLE_TOO_LARGE");
}
const packed = gzipSync(raw, { level: 9 });
const digest = sha256(packed);
const key = `${PRIVATE_PREFIX}${digest}.json.gz`;
const b2 = createB2Client({
  endpointUrl: ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: BUCKET,
});

let restored = false;
const b2Receipt = await b2.putWithMetadataVerification(key, packed, {
  verifyRestored(readback) {
    let parsed;
    try {
      parsed = JSON.parse(gunzipSync(readback).toString("utf8"));
    } catch {
      throw new Error("PRIVATE_SCORING_B2_GZIP_RESTORE_INVALID");
    }
    validatePrivateStageBundle(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(stage)) {
      throw new Error("PRIVATE_SCORING_B2_EXACT_RESTORE_MISMATCH");
    }
    restored = true;
  },
});
if (b2Receipt.sha256 !== digest ||
    b2Receipt.full_body_readback_verified !== true ||
    !restored || b2.usage().requests_started > MAX_B2_REQUESTS) {
  throw new Error("PRIVATE_SCORING_B2_READBACK_PROOF_INVALID");
}

// Durable control-plane metadata is compact, source-free, and written ONLY
// after B2 full byte readback + gzip/JSON/contract exact restore succeeded.
// No public overlay, scored-only projection, or paid API reads this checkpoint.
const control = createD1ControlPlaneStateClient({
  pipeline: "restricted_private_scoring",
});
const now = new Date().toISOString();
await control.persist("private_stage", {
  cursor: {
    status: "verified_private_staging",
    b2_key: key,
    sha256: digest,
    classifier_version: CANONICAL_CLASSIFIER_VERSION,
    counts: stage.counts,
    publication_authorized: false,
  },
}, {
  last_attempt_at: now,
  last_success_at: now,
});

// D1 write acknowledgement is insufficient: fetch the exact original row
// and verify B2 key/sha256 and independent per-domain counts, fail-closed.
const checkpoint = (await control.loadRows()).get("private_stage");
verifyPrivateScoringD1Checkpoint(checkpoint, {
  b2Key: key,
  compressedSha256: digest,
  counts: stage.counts,
  lastSuccessAt: now,
});

const receipt = {
  ok: true,
  schema: "geomacro.restricted-private-scoring-archive-proof.v1",
  role: "private_stage_only",
  content_addressed_b2_key: key,
  compressed_sha256: digest,
  compressed_bytes: packed.length,
  canonical_classifier_version: CANONICAL_CLASSIFIER_VERSION,
  counts: stage.counts,
  b2_full_readback_sha256_verified: true,
  b2_exact_gzip_restore_verified: true,
  b2_requests_started: b2.usage().requests_started,
  b2_request_budget: b2.usage().request_budget,
  d1_compact_checkpoint_persisted: true,
  d1_checkpoint_readback_verified: true,
  supabase_writes: 0,
  public_published: false,
  commercial_eligible: false,
  independent_corroboration_pending: true,
  rights_verification_pending: true,
  verified_at: now,
};
mkdirSync(ARTIFACT_DIR, { recursive: true });
writeFileSync(`${ARTIFACT_DIR}/archive-proof.json`,
  JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(receipt));
