#!/usr/bin/env node
/**
 * Explicit OFFLINE/private GRI v1.2 acceptance. Read a locally staged
 * admission only when its canonical SHA-256 is pinned by the caller. No
 * Supabase, B2, D1, fetch, x402, paid or publication path. This does not
 * independently authenticate publisher rights or corroboration.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  buildPrivateSupabaseFreeGriProof,
  GRI_PRIVATE_OFFLINE_PROOF_SCHEMA,
  griPrivateSha256,
} from "../lib/gri-v12-private-offline-admission.mjs";

const PRIVATE_DIR = resolve("artifacts/private-gri-v12");
const MAX_INPUT_BYTES = 512 * 1024;
const FILE_HASH = /^[a-f0-9]{64}$/u;

function executePrivateAdmission() {
  if (process.argv.length !== 3 || process.argv[2] !== "--private-stage-only") {
    throw new Error("GRI_PRIVATE_EXPLICIT_MODE_REQUIRED");
  }
  const inputPath = String(process.env.GRI_PRIVATE_ADMISSION_INPUT ?? "");
  const pinnedInputSha = String(process.env.GRI_PRIVATE_ADMISSION_SHA256 ?? "");
  if (!inputPath || !FILE_HASH.test(pinnedInputSha)) {
    throw new Error("GRI_PRIVATE_INPUT_AND_HASH_REQUIRED");
  }
  if (process.env.SUPABASE_DB_URL ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.APP_SUPABASE_SERVICE_ROLE_KEY ||
      process.env.B2_KEY_ID || process.env.B2_APPLICATION_KEY ||
      process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN) {
    throw new Error("GRI_PRIVATE_NO_NETWORK_OR_PAYMENT_CREDENTIALS_ALLOWED");
  }
  // Hard limit before JSON parse; no raw content ever printed.
  const bytes=readFileSync(inputPath);
  if (bytes.length < 10 || bytes.length > MAX_INPUT_BYTES) {
    throw new Error("GRI_PRIVATE_INPUT_SIZE_INVALID");
  }
  let admission;
  try { admission=JSON.parse(bytes.toString("utf8")); } catch {
    throw new Error("GRI_PRIVATE_INPUT_JSON_INVALID");
  }
  const result=buildPrivateSupabaseFreeGriProof({
    admission, expectedInputSha256:pinnedInputSha,
  });
  if (result.schema !== GRI_PRIVATE_OFFLINE_PROOF_SCHEMA ||
      result.private_only !== true || result.public_published !== false ||
      result.commercial_eligible !== false) {
    throw new Error("GRI_PRIVATE_PUBLICATION_BOUNDARY_INVALID");
  }
  mkdirSync(PRIVATE_DIR, {recursive:true,mode:0o700});
  // Content-addressed immutable *private* local artifact. Never overwrite an
  // existing hash; that would destroy previous GRI proof/replay history.
  const outputPath=join(PRIVATE_DIR,result.portable_bundle_hash+".json");
  writeFileSync(outputPath,JSON.stringify(result)+"\n", {flag:"wx",mode:0o600});
  return {
    ok:true,
    schema:result.schema,
    role:"private_offline_portable_proof_only",
    methodology:result.verified_methodology,
    source_as_of:result.original_source_as_of,
    current_categories:result.current_categories,
    event_count:result.event_count,
    original_input_sha256:result.original_input_sha256,
    portable_proof_hash:result.portable_proof_hash,
    portable_bundle_hash:result.portable_bundle_hash,
    public_published:false,
    commercial_eligible:false,
    independently_verified_source_rights:false,
    independently_verified_source_corroboration:false,
    supabase_network_attempts:0,
    b2_requests:0,
    d1_writes:0,
    usdc_spent:0,
  };
}

try {
  console.log(JSON.stringify(executePrivateAdmission()));
} catch (error) {
  // Error class/code only, never original source material or content.
  const message=error instanceof Error ? error.message : "";
  const code=/^GRI_PRIVATE_[A-Z0-9_:]+$/u.test(message)
    ? message : "GRI_PRIVATE_PROOF_STAGE_FAILED";
  console.error(JSON.stringify({ok:false,error:code,public_published:false,
    commercial_eligible:false,supabase_network_attempts:0,
    b2_requests:0,d1_writes:0,usdc_spent:0}));
  process.exitCode=1;
}
