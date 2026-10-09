#!/usr/bin/env node
/**
 * Manual-only private 3-domain GRI source bridge. Consume exact prior
 * B2-readback/D1-checkpoint-verified local stage+companion; independently
 * replay local source hashes, and compute same canonical GRI v1.2 proof.
 * No further network, B2, D1, Supabase, source fetch or x402.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPrivateGriSingletonSourceBridge } from
  "../lib/private-gri-singleton-source-bridge.mjs";
import { validatePrivateStageBundle } from
  "../lib/restricted-private-scored-stage.mjs";
import { validatePrivateGriCompanionBundle } from
  "../lib/private-gri-original-publisher-companion.mjs";

const ROOT=resolve("artifacts/restricted-current-scoring");
const OUTPUT=resolve("artifacts/private-gri-v12");
const SHA=/^[a-f0-9]{64}$/u;
const sourceFiles=[
  "verified-stage.json",
  "verified-source-companion.json",
  "archive-proof.json",
];
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
function required(ok,code) { if(!ok) throw new Error(code); }
function load(file,max) {
  const raw=readFileSync(join(ROOT,file));
  required(raw.length>=40 && raw.length<=max,"GRI_PRIVATE_BRIDGE_INPUT_BYTES_INVALID");
  let parsed;
  try {parsed=JSON.parse(raw.toString("utf8"));}
  catch {throw new Error("GRI_PRIVATE_BRIDGE_JSON_INVALID");}
  return {raw,parsed};
}
function archiveKey(prefix,digest) {
  return "geomacro-evidence/v1/private/"+prefix+"/"+digest+".json.gz";
}

export function compileVerifiedPrivateSingletonProof({
  stage,sourceCompanion,receipt,
  stageBytes,companionBytes,
  now=new Date(),
}={}) {
  validatePrivateStageBundle(stage,{now});
  validatePrivateGriCompanionBundle(sourceCompanion,stage,{now});
  required(Buffer.from(JSON.stringify(stage)).equals(stageBytes) &&
    Buffer.from(JSON.stringify(sourceCompanion)).equals(companionBytes),
    "GRI_PRIVATE_BRIDGE_LOCAL_BYTES_MUTATED");
  const stageDigest=sha256(gzipSync(stageBytes,{level:9}));
  const sourceDigest=sha256(gzipSync(companionBytes,{level:9}));
  const stageHash=sha256(stageBytes);
  const stageKey=archiveKey("restricted-current-scoring",stageDigest);
  const companionKey=archiveKey("gri-original-source-companions",sourceDigest);
  required(receipt?.ok===true &&
    receipt?.role==="private_stage_only" &&
    receipt?.b2_full_readback_sha256_verified===true &&
    receipt?.b2_exact_gzip_restore_verified===true &&
    receipt?.d1_checkpoint_readback_verified===true &&
    receipt?.d1_compact_checkpoint_persisted===true &&
    receipt?.private_original_source_companion_restored===true &&
    receipt?.private_original_source_companion_d1_bound===true &&
    receipt?.original_headlines_public_published===false &&
    receipt?.source_authenticity_independently_verified===false &&
    receipt?.public_published===false &&
    receipt?.commercial_eligible===false &&
    receipt?.content_addressed_b2_key===stageKey &&
    receipt?.compressed_sha256===stageDigest &&
    receipt?.private_original_source_companion_b2_key===companionKey &&
    receipt?.private_original_source_companion_sha256===sourceDigest &&
    sourceCompanion.stage_bundle_sha256===stageHash &&
    SHA.test(stageDigest) && SHA.test(sourceDigest),
    "GRI_PRIVATE_BRIDGE_VERIFIED_ARCHIVE_LINEAGE_INVALID");
  const result=buildPrivateGriSingletonSourceBridge({
    stage,sourceCompanion,now,
  });
  return {
    ...result,
    prior_archive_readback_receipt_consistent:true,
    archive_readback_independently_rechecked:false,
    source_authenticity_independently_verified:false,
    independent_history_story_continuity_verified:false,
    source_rights_verified:false,
    public_published:false,
    commercial_eligible:false,
    payment_executed:false,
    supabase_writes:0,
    b2_requests:0,
    d1_writes:0,
  };
}

function main() {
  required(process.argv.length===3 &&
    process.argv[2]==="--private-singleton-only",
    "GRI_PRIVATE_BRIDGE_EXPLICIT_MODE_REQUIRED");
  // Private local computations must not accidentally inherit privileged
  // production or payment credentials; the caller can unset them for this
  // zero-network subprocess.
  required(![
    "SUPABASE_DB_URL","SUPABASE_SERVICE_ROLE_KEY",
    "APP_SUPABASE_SERVICE_ROLE_KEY",
    "B2_KEY_ID","B2_APPLICATION_KEY",
    "GEOMACRO_COMMERCE_LEDGER_TOKEN",
    "CLOUDFLARE_API_TOKEN",
  ].some(k=>Boolean(process.env[k])),
    "GRI_PRIVATE_BRIDGE_NETWORK_CREDENTIALS_FORBIDDEN");
  const [stage,companion,receipt]=[
    load(sourceFiles[0],128*1024),
    load(sourceFiles[1],128*1024),
    load(sourceFiles[2],24*1024),
  ];
  const result=compileVerifiedPrivateSingletonProof({
    stage:stage.parsed,sourceCompanion:companion.parsed,
    receipt:receipt.parsed,stageBytes:stage.raw,
    companionBytes:companion.raw,
  });
  mkdirSync(OUTPUT,{recursive:true,mode:0o700});
  // Full headlines/proof are PRIVATE, never uploaded as GH artifact or
  // public source. Explicit no-overwrite for every content-addressed run.
  const proofPath=join(OUTPUT,result.private_proof.portable_bundle_hash+".json");
  writeFileSync(proofPath,JSON.stringify(result.private_proof)+"\n",{
    mode:0o600,flag:"wx",
  });
  const admissionPath=join(OUTPUT,"admission-"+result.expected_input_sha256+".json");
  writeFileSync(admissionPath,JSON.stringify(result.admission)+"\n",{
    mode:0o600,flag:"wx",
  });
  return {
    ok:true,
    schema:"geomacro.private-gri-v12-source-bridge-proof.v1",
    private_only:true,public_published:false,commercial_eligible:false,
    current_coverage:result.private_proof.current_coverage,
    current_categories:result.private_proof.current_categories,
    event_count:result.private_proof.event_count,
    original_input_sha256:result.expected_input_sha256,
    portable_bundle_hash:result.private_proof.portable_bundle_hash,
    portable_proof_hash:result.private_proof.portable_proof_hash,
    prior_archive_readback_receipt_consistent:true,
    archive_readback_independently_rechecked:false,
    source_authenticity_independently_verified:false,
    independent_history_story_continuity_verified:false,
    source_rights_verified:false,
    supabase_writes:0,b2_requests:0,d1_writes:0,usdc_spent:0,
  };
}
// Safe to import the deterministic validator in Vitest: no CLI side effects.
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(main()));}
  catch(error) {
    const value=error instanceof Error?error.message:"";
    const code=/^GRI_PRIVATE_[A-Z0-9_:]+$/u.test(value)
      ?value:"GRI_PRIVATE_BRIDGE_FAILED_CLOSED";
    console.error(JSON.stringify({ok:false,error:code,public_published:false,
      commercial_eligible:false,supabase_writes:0,b2_requests:0,
      d1_writes:0,usdc_spent:0}));
    process.exitCode=1;
  }
}
