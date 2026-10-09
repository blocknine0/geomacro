#!/usr/bin/env node
// Owner-gated PRIVATE verified proof archive. No cron, Supabase, public live
// snapshot, paid API, source rights mutation, or automatic GRO publication.
import { readFileSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { resolve, join, basename, sep } from "node:path";
import { createB2Client } from "./b2-s3-client.mjs";
import { createD1ControlPlaneStateClient } from "../lib/d1-control-plane-state.mjs";
import {
  archivePrivatePortableGriProof,
  validatePrivatePortableProofForArchive,
  GRI_PRIVATE_D1_PIPELINE,
  MAX_GRI_PRIVATE_ARCHIVE_BYTES,
} from "../lib/private-gri-v12-b2-d1-archive.mjs";

const ENDPOINT="https://s3.us-east-005.backblazeb2.com";
const BUCKET="geomacro-private-archive";
const PRIVATE_DIR=resolve("artifacts/private-gri-v12");
const PIN=/^[a-f0-9]{64}$/u;

async function execute() {
  if (process.argv.length !== 3 || process.argv[2] !== "--private-archive-only") {
    throw new Error("GRI_PRIVATE_ARCHIVE_MANUAL_MODE_REQUIRED");
  }
  const inputPath=String(process.env.GRI_PRIVATE_PROOF_INPUT ?? "");
  const inputHash=String(process.env.GRI_PRIVATE_ADMISSION_SHA256 ?? "");
  if (!inputPath || !PIN.test(inputHash) ||
      !inputPath.endsWith(".json")) {
    throw new Error("GRI_PRIVATE_ARCHIVE_PINNED_FILE_REQUIRED");
  }
  if (
    process.env.B2_S3_ENDPOINT !== ENDPOINT ||
    !process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY ||
    !process.env.CLOUDFLARE_ACCOUNT_ID ||
    !process.env.CLOUDFLARE_API_TOKEN || !process.env.D1_DATABASE_ID ||
    process.env.B2_ACCOUNT_QUOTA_REQUIRED !== "1" ||
    process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID !== "gri_private_v12" ||
    !/^[2-6]$/u.test(String(process.env.B2_REQUEST_BUDGET ?? "")) ||
    process.env.SUPABASE_DB_URL ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.APP_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN
  ) throw new Error("GRI_PRIVATE_ARCHIVE_CONFIG_OR_QUOTA_INVALID");

  const actualPath=realpathSync(inputPath);
  const root=realpathSync(PRIVATE_DIR);
  if (!actualPath.startsWith(root+sep)) {
    throw new Error("GRI_PRIVATE_ARCHIVE_PATH_OUTSIDE_PRIVATE_ROOT");
  }
  const bytes=readFileSync(actualPath);
  if (bytes.length < 32 || bytes.length > MAX_GRI_PRIVATE_ARCHIVE_BYTES) {
    throw new Error("GRI_PRIVATE_ARCHIVE_INPUT_SIZE_INVALID");
  }
  let proof;
  try { proof=JSON.parse(bytes.toString("utf8")); } catch {
    throw new Error("GRI_PRIVATE_ARCHIVE_INPUT_JSON_INVALID");
  }
  if (basename(actualPath) !== proof?.portable_bundle_hash+".json") {
    throw new Error("GRI_PRIVATE_ARCHIVE_FILENAME_HASH_MISMATCH");
  }
  // This check happens BEFORE any B2/Cloudflare call and rejects proof replay,
  // stale news, wrong original input SHA and public-promotion attempts.
  validatePrivatePortableProofForArchive(proof,{
    expectedInputHash:inputHash,
  });

  const b2=createB2Client({
    endpointUrl:ENDPOINT,
    accessKey:process.env.B2_KEY_ID,
    secretKey:process.env.B2_APPLICATION_KEY,
    bucket:BUCKET,
  });
  const control=createD1ControlPlaneStateClient({
    pipeline:GRI_PRIVATE_D1_PIPELINE,
  });
  const receipt=await archivePrivatePortableGriProof({
    value:proof,expectedInputHash:inputHash,b2,control,
  });
  mkdirSync(PRIVATE_DIR,{recursive:true,mode:0o700});
  // Tiny source-free proof receipt only; raw GRI bundle stays in private B2.
  writeFileSync(join(PRIVATE_DIR,"archive-proof.json"),
    JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
  return receipt;
}
try {
  const result=await execute();
  console.log(JSON.stringify(result));
} catch(error) {
  const message=error instanceof Error ? error.message : "";
  const code=/^GRI_PRIVATE_[A-Z0-9_:]+$/u.test(message)
    ? message : "GRI_PRIVATE_ARCHIVE_FAILED_CLOSED";
  console.error(JSON.stringify({ok:false,error:code,
    b2_proof_accepted:false,d1_checkpoint_verified:false,
    supabase_writes:0,public_published:false,usdc_spent:0}));
  process.exitCode=1;
}
