#!/usr/bin/env bun
/**
 * Manual-only production promotion of *current*, independently reviewed
 * canonical GRI v1.2 over verified B2 historical continuity.
 * Zero Supabase traffic. No private proof, source URL or raw article reaches
 * public B2, D1, stdout or GitHub artifacts. Never catches a cap error to
 * advance a timestamp or bypass mandatory independent B2 readback.
 */
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createB2Client } from "./b2-s3-client.mjs";
import { verifyThreeDomainReviewerHandoff } from "../lib/three-domain-reviewed-handoff.mjs";
import { publishB2VerifiedHotSnapshot } from "./publish-b2-verified-hot-snapshot.mjs";
import { approvedIndependentReviewerFromEnv } from "../../src/lib/independent-reviewer-authority.server.ts";
import {
  computeReviewedCurrentGlobalRisk, preflightReviewedCurrentGlobalRisk,
} from "../lib/supabase-free-gri-v12-current.mjs";

const CONTROL = "https://geomacro-control-plane.daspallab202391.workers.dev";
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const LIVE_KEY = "geomacro-evidence/v1/live/global-risk/latest.json.gz";
const PROOF_KEY = "geomacro-evidence/v1/live/global-risk/latest-proof.json";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const assert = (ok, code) => { if (!ok) throw Error("GRI_SUPABASE_FREE_" + code); };

function config() {
  assert(process.argv.length === 3 && process.argv[2] === "--verified-current",
    "EXPLICIT_MODE_REQUIRED");
  for (const k of ["SUPABASE_DB_URL", "SUPABASE_URL", "APP_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY", "APP_SUPABASE_SERVICE_ROLE_KEY",
    "COINBASE_API_KEY", "COINBASE_COMMERCE_API_KEY"]) {
    assert(!process.env[k], "SUPABASE_OR_PAYMENT_CREDENTIAL_FORBIDDEN");
  }
  assert(process.env.B2_ACCOUNT_QUOTA_REQUIRED === "1" &&
    /^[a-z][a-z0-9_-]{1,47}$/u.test(process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID ?? "") &&
    process.env.D1_DATABASE_ID &&
    process.env.CLOUDFLARE_ACCOUNT_ID &&
    process.env.CLOUDFLARE_API_TOKEN &&
    Number.isInteger(Number(process.env.B2_REQUEST_BUDGET)) &&
    Number(process.env.B2_REQUEST_BUDGET) >= 7 &&
    Number(process.env.B2_REQUEST_BUDGET) <= 12 &&
    process.env.B2_KEY_ID && process.env.B2_APPLICATION_KEY &&
    (process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").length >= 32 &&
    /^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID ?? ""),
  "GOVERNED_PRODUCTION_CONFIG_REQUIRED");
  const trustedReviewerPublicKeyPem = approvedIndependentReviewerFromEnv();
  assert(trustedReviewerPublicKeyPem, "PINNED_INDEPENDENT_REVIEWER_REQUIRED");
  const path = process.env.GEOMACRO_GRI_REVIEWED_INPUT;
  const pin = String(process.env.GEOMACRO_GRI_REVIEWED_INPUT_SHA256 ?? "");
  assert(path && /^[a-f0-9]{64}$/u.test(pin) &&
    statSync(path).size > 100 && statSync(path).size <= 1024 * 1024,
  "EXTERNAL_INPUT_AND_SHA_REQUIRED");
  const raw = readFileSync(path);
  assert(sha(raw) === pin, "EXTERNAL_INPUT_HASH_MISMATCH");
  let reviewed;
  try { reviewed = JSON.parse(raw.toString("utf8")); }
  catch { throw Error("GRI_SUPABASE_FREE_REVIEWED_JSON_INVALID"); }
  const certFile=process.env.GEOMACRO_GRI_SIGNED_COUNTRY_CERTIFICATES;
  const certHash=String(process.env.GEOMACRO_GRI_SIGNED_COUNTRY_CERTIFICATES_SHA256??"");
  assert(typeof certFile==="string"&&certFile.length>0&&
    /^[a-f0-9]{64}$/u.test(certHash)&&
    statSync(certFile).size>=100&&statSync(certFile).size<=512*1024,
  "INDEPENDENT_COUNTRY_CERTIFICATE_PIN_REQUIRED");
  const certBytes=readFileSync(certFile);
  assert(sha(certBytes)===certHash,"COUNTRY_CERTIFICATES_EXACT_SHA_MISMATCH");
  let countryCategoryCertificates;
  try{countryCategoryCertificates=JSON.parse(certBytes.toString("utf8"))}
  catch{throw Error("GRI_SUPABASE_FREE_COUNTRY_CERTIFICATES_JSON_INVALID")}
  assert(Array.isArray(countryCategoryCertificates)&&
    countryCategoryCertificates.length>=3&&
    countryCategoryCertificates.length<=80,
  "COUNTRY_CERTIFICATION_ARRAY_REQUIRED");
  return { reviewed, trustedReviewerPublicKeyPem, countryCategoryCertificates };
}

function parseVerifiedB2History(bytes, expectedSha) {
  const compressed = Buffer.from(bytes);
  assert(compressed.length <= 2 * 1024 * 1024 &&
    sha(compressed) === expectedSha, "HISTORY_READBACK_SHA_INVALID");
  let history;
  try {
    const restored = gunzipSync(compressed, { maxOutputLength: 12 * 1024 * 1024 });
    history = JSON.parse(restored.toString("utf8"));
  } catch {
    throw Error("GRI_SUPABASE_FREE_HISTORY_EXACT_GZIP_RESTORE_INVALID");
  }
  return history;
}

async function putAndRestore(b2, key, packed, expectedRaw) {
  const bytes = Buffer.from(packed);
  await b2.put(key, bytes);
  const read = Buffer.from(await b2.get(key));
  assert(read.length === bytes.length && sha(read) === sha(bytes) &&
    read.equals(bytes), "B2_EXACT_COMPRESSED_READBACK_MISMATCH");
  const unpacked = gunzipSync(read, { maxOutputLength: 12 * 1024 * 1024 });
  assert(unpacked.equals(Buffer.from(expectedRaw)), "B2_EXACT_GZIP_RESTORE_MISMATCH");
}

async function main() {
  const { reviewed, trustedReviewerPublicKeyPem, countryCategoryCertificates } = config();
  // NO B2 reads, writes, HTTP or D1 state mutations on invalid signed input,
  // private-only source, stale original publication or unqualified review.
  const admissible = preflightReviewedCurrentGlobalRisk({
    reviewed, trustedReviewerPublicKeyPem,
  });
  const b2 = createB2Client({
    endpointUrl: B2_ENDPOINT, bucket: B2_BUCKET,
    accessKey: process.env.B2_KEY_ID,
    secretKey: process.env.B2_APPLICATION_KEY,
  });
  // Existing shared D1 ticket governor in b2-s3-client accounts for each GET.
  const archived = await b2.get(admissible.history_b2_key);
  const history = parseVerifiedB2History(archived, admissible.history_b2_sha256);
  // PR #2250 independently signed country/domain CERTIFIED proofs are
  // mandatory, *not* optional. A GRI reviewer signature alone cannot
  // certify country-specific original evidence or commercial source rights.
  // This pure verifier runs BEFORE B2 PUT, live archive or public D1.
  const handoff=verifyThreeDomainReviewerHandoff({
    intelligence:{
      rows:reviewed.signed_input.customerRows,
      eventPackages:reviewed.signed_input.eventPackages,
    },
    reviewedGri:reviewed,
    countryCategoryCertificates,
    historicalB2Bytes:Buffer.from(archived),
    trustedReviewerPublicKeyPem,
  });
  assert(handoff.receipt?.independently_reviewer_signed===true&&
    handoff.receipt.current_three_domain_originals_verified===true&&
    handoff.receipt.historical_b2_sha256===admissible.history_b2_sha256&&
    handoff.receipt.gri_input_sha256===sha(Buffer.from(JSON.stringify(reviewed)))&&
    handoff.receipt.qualified_event_count===reviewed.signed_input.events.length,
  "REVIEWED_COUNTRY_CATEGORY_HANDOFF_NOT_VERIFIED");
  const produced = computeReviewedCurrentGlobalRisk({
    reviewed, history, verifiedHistoryB2Sha256: sha(Buffer.from(archived)),
    trustedReviewerPublicKeyPem,
  });
  assert(produced.reviewProof.reviewed_input_sha256 === admissible.reviewed_input_sha256 &&
    produced.reviewProof.reviewer_spki_sha256 === admissible.reviewer_spki_sha256 &&
    produced.reviewProof.independent_original_receipt_sha256 ===
      admissible.qualified_receipt_sha256,
  "REVIEWER_OR_ORIGINAL_RECEIPT_CHANGED");

  const historyRaw = Buffer.from(JSON.stringify(produced.historyValue));
  const historyPacked = gzipSync(historyRaw, { level: 9 });
  const historyKey = produced.liveValue.history_key;
  // Never silently overwrite an immutable source archive.
  const existing = await b2.getOptional(historyKey);
  if (existing) {
    assert(Buffer.from(existing).equals(historyPacked), "IMMUTABLE_HISTORY_COLLISION");
  } else {
    await putAndRestore(b2, historyKey, historyPacked, historyRaw);
  }

  const liveRaw = Buffer.from(JSON.stringify(produced.liveValue));
  const livePacked = gzipSync(liveRaw, { level: 9 });
  const liveSha = sha(livePacked);
  await putAndRestore(b2, LIVE_KEY, livePacked, liveRaw);
  const proof = {
    schema: "geomacro.public-global-risk-live-proof.v1",
    generated_at: produced.liveValue.generated_at,
    source_project: produced.liveValue.source_project,
    live_key: LIVE_KEY, history_key: historyKey,
    methodology_version: produced.liveValue.data.methodologyVersion,
    snapshot_id: produced.liveValue.data.snapshotId,
    snapshot_as_of: produced.liveValue.data.snapshotAsOf,
    verified_snapshot_rows: produced.historyValue.verified_snapshot_rows.length,
    compressed_sha256: liveSha, compressed_bytes: livePacked.length,
    full_b2_readback_verified: true, exact_gzip_restore_verified: true,
    // Hash-only independent signed source audit; private packages and review
    // signatures never enter public B2 or D1 customer payload.
    reviewer_spki_sha256: produced.reviewProof.reviewer_spki_sha256,
    reviewed_input_sha256: produced.reviewProof.reviewed_input_sha256,
    review_signature_sha256: produced.reviewProof.review_signature_sha256,
    independent_original_receipt_sha256:
      produced.reviewProof.independent_original_receipt_sha256,
    portable_proof_hash: produced.reviewProof.portable_proof_hash,
    historical_b2_sha256: produced.reviewProof.historical_b2_sha256,
  };
  const proofBytes = Buffer.from(JSON.stringify(proof));
  await b2.put(PROOF_KEY, proofBytes);
  assert(Buffer.from(await b2.get(PROOF_KEY)).equals(proofBytes),
    "PUBLIC_PROOF_READBACK_MISMATCH");
  const confirmed = await publishB2VerifiedHotSnapshot({
    product: "global-risk", value: produced.liveValue, proof,
  });
  assert(confirmed?.ok === true &&
    confirmed.b2_sha256 === liveSha &&
    confirmed.payload_sha256 === sha(liveRaw) &&
    confirmed.current_b2_readback_verified === true,
  "D1_HOT_PUBLISH_ACK_INVALID");

  // Independent public D1 readback: proving only the authenticated PUT
  // response is not enough to claim the site is now serving these bytes.
  const response = await fetch(CONTROL + "/v1/public/hot-snapshot/global-risk", {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(15_000),
  });
  assert(response.ok, "D1_PUBLIC_READBACK_HTTP_INVALID");
  const live = await response.json();
  assert(live.ok === true && live.product === "global-risk" &&
    live.proof_schema === proof.schema &&
    live.b2_sha256 === liveSha &&
    live.payload_sha256 === sha(liveRaw) &&
    live.payload_json === liveRaw.toString("utf8") &&
    live.source_as_of === produced.liveValue.data.snapshotAsOf &&
    Date.parse(live.expires_at) > Date.now(),
  "D1_PUBLIC_READBACK_BINDING_INVALID");
  return {
    ok: true, schema: "geomacro.supabase-free-current-gri-v12-publish.v1",
    authority_read: "independently-reviewed-current-originals-plus-verified-b2-history",
    authority_serve: "backblaze-b2-cloudflare-d1",
    snapshot_as_of: live.source_as_of,
    snapshot_id: produced.liveValue.data.snapshotId,
    b2_sha256: liveSha, payload_sha256: sha(liveRaw),
    direct_b2_readback_verified: true, exact_gzip_restore_verified: true,
    d1_public_readback_verified: true,
    original_event_reviewed: true,
    historical_b2_lineage_sha_linked: produced.reviewProof.history_append_only_b2_lineage_verified,
    history_total_verified_snapshots: produced.historyValue.lineage.total_verified_snapshots,
    history_hot_projection_rows: produced.historyValue.lineage.retained_snapshot_rows,
    history_prior_immutable_b2_snapshots:
      produced.historyValue.lineage.older_snapshots_in_pinned_b2_history,
    private_proof_published: false, private_only_promoted: false,
    supabase_reads: 0, supabase_writes: 0,
    funds_spent_usdc: 0, x402_activation_performed: false,
  };
}
try { console.log(JSON.stringify(await main())); }
catch (error) {
  const safeCode = /^GRI_SUPABASE_FREE_[A-Z0-9_]+$/u.test(error?.message ?? "")
    ? error.message : "GRI_SUPABASE_FREE_PUBLICATION_FAILED_CLOSED";
  console.error(safeCode);
  process.exitCode = 1;
}
