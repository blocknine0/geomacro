#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import {
  encodePrivateStageCompanionB2Bundle, verifyPrivateStageCompanionB2Bundle,
  PRIVATE_COMBINED_ARCHIVE_SCHEMA,
} from "../lib/private-stage-companion-b2-bundle.mjs";
import { createB2Client } from "./b2-s3-client.mjs";
import { createD1ControlPlaneStateClient } from "../lib/d1-control-plane-state.mjs";
import { verifyPrivateScoringD1Checkpoint } from "../lib/private-scoring-d1-checkpoint-proof.mjs";
import {
  makePrivateGriCompanionBundle,
  validatePrivateGriCompanionBundle,
} from "../lib/private-gri-original-publisher-companion.mjs";
import {
  STAGE_DOMAINS,
  CANONICAL_CLASSIFIER_VERSION,
  makePrivateStageBundle,
  validatePrivateStageBundle,
} from "../lib/restricted-private-scored-stage.mjs";

const ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET = "geomacro-private-archive";
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
    !process.env.D1_DATABASE_ID ||
    process.env.B2_ACCOUNT_QUOTA_REQUIRED !== "1" ||
    process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID !== "restricted_private_scoring"
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

function loadPrivateSourceCandidates() {
  const collected=[];
  for(const category of STAGE_DOMAINS) {
    const bytes=readFileSync(`${ARTIFACT_DIR}/${category}-source.json`);
    if(bytes.length > MAX_INPUT_BYTES)
      throw new Error("PRIVATE_GRI_COMPANION_INPUT_TOO_LARGE");
    let parsed;
    try { parsed=JSON.parse(bytes.toString("utf8")); }
    catch { throw new Error("PRIVATE_GRI_COMPANION_INPUT_INVALID"); }
    if(parsed?.schema!=="geomacro.private-gri-source-candidates.v1" ||
      parsed.category!==category ||
      parsed.private_only!==true ||
      parsed.public_published!==false ||
      parsed.commercial_eligible!==false ||
      !Array.isArray(parsed.records) ||
      parsed.records.length>2 ||
      parsed.records.some(row=>row?.category!==category)) {
      throw new Error("PRIVATE_GRI_COMPANION_INPUT_CONTRACT_INVALID");
    }
    collected.push(...parsed.records);
  }
  return collected;
}

ensureConfig();
const stage = makePrivateStageBundle(loadCandidates());
validatePrivateStageBundle(stage);
const sourceCompanion = makePrivateGriCompanionBundle(
  stage, loadPrivateSourceCandidates(),
);
validatePrivateGriCompanionBundle(sourceCompanion, stage);
// The canonical stage and its sensitive first-party source companion share
// ONE content-addressed B2 gzip. The bundle preserves separate logical hashes
// and validates both members against the exact signed GET byte readback.
const bundle=encodePrivateStageCompanionB2Bundle(stage,sourceCompanion);
const raw=bundle.stageBytes;
const sourceCompanionRaw=bundle.companionBytes;
const packed=bundle.bytes;
const digest=bundle.digest;
const key=bundle.key;
const sourceCompanionKey=key; // same fetched B2 object, not a second upload
const sourceCompanionDigest=digest;
const b2=createB2Client({
  endpointUrl:ENDPOINT,
  accessKey:process.env.B2_KEY_ID,
  secretKey:process.env.B2_APPLICATION_KEY,
  bucket:BUCKET,
});

let restored=false;
const b2Receipt=await b2.putWithMetadataVerification(key,packed,{
  verifyRestored(readback) {
    verifyPrivateStageCompanionB2Bundle(readback,bundle);
    restored=true;
  },
});
if(b2Receipt.sha256!==digest ||
   b2Receipt.full_body_readback_verified!==true ||
   !restored || b2.usage().requests_started>MAX_B2_REQUESTS) {
  throw new Error("PRIVATE_SCORING_BUNDLED_B2_READBACK_PROOF_INVALID");
}
// Both original members are restored from the SAME verified gzip. Source
// text stays private and is never copied into public D1 or Actions artifacts.
const sourceCompanionRestored=true;
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
    archive_format: PRIVATE_COMBINED_ARCHIVE_SCHEMA,
    stage_logical_sha256:bundle.stageSha256,
    source_companion_logical_sha256:bundle.companionSha256,
    source_companion_key: sourceCompanionKey,
    source_companion_sha256: sourceCompanionDigest,
    source_companion_stage_sha256: sourceCompanion.stage_bundle_sha256,
    source_companion_full_readback_verified: true,
    source_companion_exact_gzip_restore_verified: true,
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
  sourceCompanion: {
    key: sourceCompanionKey, compressedSha256: sourceCompanionDigest,
    stageSha256: sourceCompanion.stage_bundle_sha256,
    logicalSha256: bundle.companionSha256,
    stageLogicalSha256: bundle.stageSha256,
  },
});

const receipt = {
  ok: true,
  schema: "geomacro.restricted-private-scoring-archive-proof.v1",
  role: "private_stage_only",
  archive_format: PRIVATE_COMBINED_ARCHIVE_SCHEMA,
  stage_uncompressed_sha256:bundle.stageSha256,
  companion_uncompressed_sha256:bundle.companionSha256,
  content_addressed_b2_key: key,
  compressed_sha256: digest,
  compressed_bytes: packed.length,
  canonical_classifier_version: CANONICAL_CLASSIFIER_VERSION,
  counts: stage.counts,
  b2_full_readback_sha256_verified: true,
  b2_exact_gzip_restore_verified: true,
  private_original_source_companion_b2_key: sourceCompanionKey,
  private_original_source_companion_sha256: sourceCompanionDigest,
  private_original_source_companion_restored: true,
  private_original_source_companion_d1_bound: true,
  original_headlines_public_published: false,
  source_authenticity_independently_verified: false,
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
mkdirSync(ARTIFACT_DIR, { recursive: true, mode: 0o700 });
// Never upload these files as Actions artifacts. They are exact local
// members independently SHA-checked inside ONE full B2 readback, then bound
// by a compact D1 checkpoint. The optional private GRI producer uses them.
writeFileSync(`${ARTIFACT_DIR}/verified-stage.json`,
  raw, { mode: 0o600, flag: "wx" });
writeFileSync(`${ARTIFACT_DIR}/verified-source-companion.json`,
  sourceCompanionRaw, { mode: 0o600, flag: "wx" });
writeFileSync(`${ARTIFACT_DIR}/archive-proof.json`,
  JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(receipt));
