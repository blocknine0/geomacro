/**
 * #1827 durable, PRIVATE v1.2 proof path without a single Supabase write.
 *
 * Source provenance and the full portable proof remain solely in a B2
 * content-addressed private gzip. D1 stores tiny source-free metadata only.
 * D1 must never advance until an independent Backblaze GET verified every
 * compressed byte and the exact gzip/JSON payload was restored.
 *
 * No public/GRO/x402 route reads this private checkpoint.
 */
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { GRI_METHOD_VERSION, GRI_CATEGORIES } from "./gri-engine-v12.js";
import { verifyPortableGriProofBundle } from "./gri-portable-proof-v12.js";
import { GRI_PRIVATE_OFFLINE_PROOF_SCHEMA } from "./gri-v12-private-offline-admission.mjs";

export const GRI_PRIVATE_B2_PREFIX = "geomacro-evidence/v1/private/gri-v12-portable-proof/";
export const GRI_PRIVATE_D1_PIPELINE = "gri_private_v12";
export const GRI_PRIVATE_D1_SCOPE = "portable_proof";
export const MAX_GRI_PRIVATE_ARCHIVE_BYTES = 2 * 1024 * 1024;
export const MAX_GRI_PRIVATE_B2_ATTEMPTS = 6;
const SHA = /^[a-f0-9]{64}$/u;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

function invariant(yes, code) {
  if (!yes) throw new Error(code);
}

export function validatePrivatePortableProofForArchive(
  value, { expectedInputHash, now = new Date() } = {},
) {
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  invariant(Number.isFinite(nowMs), "GRI_PRIVATE_ARCHIVE_CLOCK_INVALID");
  invariant(SHA.test(String(expectedInputHash ?? "")),
    "GRI_PRIVATE_ARCHIVE_PINNED_INPUT_REQUIRED");
  invariant(value && typeof value === "object" && !Array.isArray(value) &&
    value.schema === GRI_PRIVATE_OFFLINE_PROOF_SCHEMA &&
    value.private_only === true &&
    value.public_published === false &&
    value.commercial_eligible === false &&
    value.rights_verification_pending === true &&
    value.independent_corroboration_pending === true &&
    value.input_authenticity_independently_verified === false &&
    value.verified_methodology === GRI_METHOD_VERSION &&
    value.original_input_sha256 === expectedInputHash &&
    SHA.test(String(value.portable_bundle_hash ?? "")) &&
    SHA.test(String(value.portable_proof_hash ?? "")) &&
    value.current_coverage === 1 &&
    Array.isArray(value.current_categories) &&
    JSON.stringify(value.current_categories) === JSON.stringify(GRI_CATEGORIES) &&
    Number.isInteger(value.event_count) &&
    value.event_count >= 3 && value.event_count <= 180,
    "GRI_PRIVATE_ARCHIVE_PROOF_CONTRACT_INVALID");
  const asOfMs = Date.parse(String(value.original_source_as_of ?? ""));
  invariant(Number.isFinite(asOfMs) &&
    new Date(asOfMs).toISOString() === value.original_source_as_of &&
    asOfMs <= nowMs + 5 * 60_000 &&
    nowMs - asOfMs <= 90 * 60_000,
    "GRI_PRIVATE_ARCHIVE_ORIGINAL_AS_OF_STALE");
  const portable=value.portable_proof;
  invariant(portable && typeof portable === "object" &&
    portable.bundleHash === value.portable_bundle_hash &&
    portable.proof?.proofHash === value.portable_proof_hash &&
    portable.methodologyVersion === GRI_METHOD_VERSION &&
    portable.asOf === value.original_source_as_of &&
    portable.current?.reproduction?.asOf === value.original_source_as_of &&
    portable.current?.reproduction?.eventCount === value.event_count &&
    portable.current?.reproduction?.coverage === 1 &&
    portable.previous === null && portable.attribution === null,
    "GRI_PRIVATE_ARCHIVE_PORTABLE_LINEAGE_INVALID");
  const report=verifyPortableGriProofBundle(portable,{
    expectedProofHash:value.portable_proof_hash,
  });
  invariant(report.valid === true &&
    report.internallyReproducible === true &&
    report.authenticAgainstExpectedHash === true &&
    report.recomputed.bundleHash === value.portable_bundle_hash,
    "GRI_PRIVATE_ARCHIVE_PORTABLE_REPLAY_INVALID");
  const raw=Buffer.from(JSON.stringify(value),"utf8");
  invariant(raw.length > 0 && raw.length <= MAX_GRI_PRIVATE_ARCHIVE_BYTES,
    "GRI_PRIVATE_ARCHIVE_PAYLOAD_TOO_LARGE");
  return {raw,asOf:value.original_source_as_of,inputHash:expectedInputHash,
    portableProofHash:value.portable_proof_hash,
    portableBundleHash:value.portable_bundle_hash,
    eventCount:value.event_count};
}

export function verifyPrivateGriD1Checkpoint(checkpoint, {
  key, digest, inputHash, proofHash, bundleHash, eventCount, sourceAsOf, lastSuccessAt,
}={}) {
  const cursor=checkpoint?.payload?.cursor;
  invariant(checkpoint?.source_id === "orchestrator:"+GRI_PRIVATE_D1_SCOPE &&
    checkpoint?.payload?.source === "geomacro_intelligence_orchestrator" &&
    checkpoint?.payload?.task === GRI_PRIVATE_D1_SCOPE &&
    cursor?.status === "verified_private_gri_proof" &&
    cursor?.publication_authorized === false &&
    cursor?.commercial_eligible === false &&
    cursor?.rights_verified === false &&
    cursor?.independently_corroborated === false &&
    cursor?.b2_full_readback_verified === true &&
    cursor?.gzip_exact_restore_verified === true &&
    cursor?.b2_key === key &&
    key === GRI_PRIVATE_B2_PREFIX+digest+".json.gz" &&
    cursor?.sha256 === digest && SHA.test(String(digest ?? "")) &&
    cursor?.original_input_sha256 === inputHash &&
    cursor?.portable_proof_hash === proofHash &&
    cursor?.portable_bundle_hash === bundleHash &&
    cursor?.source_as_of === sourceAsOf &&
    cursor?.methodology_version === GRI_METHOD_VERSION &&
    cursor?.event_count === eventCount &&
    checkpoint?.last_success_at === lastSuccessAt &&
    Number.isFinite(Date.parse(String(lastSuccessAt ?? ""))),
    "GRI_PRIVATE_D1_CHECKPOINT_READBACK_INVALID");
  return true;
}

export async function archivePrivatePortableGriProof({
  value, expectedInputHash, b2, control, now = new Date(),
}={}) {
  const valid=validatePrivatePortableProofForArchive(value,{
    expectedInputHash,now,
  });
  invariant(b2 && typeof b2.putWithMetadataVerification === "function" &&
    typeof b2.usage === "function" &&
    control && typeof control.loadRows === "function" &&
    typeof control.persist === "function",
    "GRI_PRIVATE_ARCHIVE_STORAGE_ADAPTER_INVALID");
  const before=b2.usage();
  invariant(before.global_account_quota_guard_enabled === true &&
    Number.isSafeInteger(before.request_budget) &&
    before.request_budget >= 2 &&
    before.request_budget <= MAX_GRI_PRIVATE_B2_ATTEMPTS,
    "GRI_PRIVATE_SHARED_B2_ACCOUNT_QUOTA_REQUIRED");
  const previous=(await control.loadRows()).get(GRI_PRIVATE_D1_SCOPE);
  const earlier=previous?.payload?.cursor;
  if (earlier) {
    const oldTime=Date.parse(String(earlier.source_as_of ?? ""));
    invariant(Number.isFinite(oldTime) &&
      (oldTime < Date.parse(valid.asOf) ||
      (oldTime === Date.parse(valid.asOf) &&
       earlier.portable_bundle_hash === valid.portableBundleHash)),
      "GRI_PRIVATE_ARCHIVE_MONOTONIC_SOURCE_AS_OF_REQUIRED");
  }

  const packed=gzipSync(valid.raw,{level:9});
  const digest=sha256(packed);
  const key=GRI_PRIVATE_B2_PREFIX+digest+".json.gz";
  let restored=false;
  const receipt=await b2.putWithMetadataVerification(key,packed,{
    verifyRestored(readback) {
      let parsed;
      try {
        parsed=JSON.parse(gunzipSync(readback).toString("utf8"));
      } catch {
        throw new Error("GRI_PRIVATE_B2_GZIP_RESTORE_INVALID");
      }
      const replay=validatePrivatePortableProofForArchive(parsed,{
        expectedInputHash,now,
      });
      invariant(replay.raw.equals(valid.raw) &&
        replay.portableBundleHash === valid.portableBundleHash,
        "GRI_PRIVATE_B2_EXACT_JSON_RESTORE_INVALID");
      restored=true;
    },
  });
  invariant(receipt?.full_body_readback_verified === true &&
    receipt?.sha256 === digest && restored &&
    b2.usage().requests_started <= MAX_GRI_PRIVATE_B2_ATTEMPTS,
    "GRI_PRIVATE_B2_FULL_READBACK_UNVERIFIED");

  // The persistent checkpoint contains NO full proof, event descriptions,
  // source URLs, raw input or commercial eligibility claim.
  const stamp=now.toISOString();
  await control.persist(GRI_PRIVATE_D1_SCOPE,{
    cursor:{
      status:"verified_private_gri_proof",
      b2_key:key,
      sha256:digest,
      original_input_sha256:valid.inputHash,
      portable_proof_hash:valid.portableProofHash,
      portable_bundle_hash:valid.portableBundleHash,
      source_as_of:valid.asOf,
      methodology_version:GRI_METHOD_VERSION,
      event_count:valid.eventCount,
      b2_full_readback_verified:true,
      gzip_exact_restore_verified:true,
      rights_verified:false,
      independently_corroborated:false,
      publication_authorized:false,
      commercial_eligible:false,
    },
  },{last_attempt_at:stamp,last_success_at:stamp});
  const checkpoint=(await control.loadRows()).get(GRI_PRIVATE_D1_SCOPE);
  verifyPrivateGriD1Checkpoint(checkpoint,{
    key,digest,inputHash:valid.inputHash,proofHash:valid.portableProofHash,
    bundleHash:valid.portableBundleHash,eventCount:valid.eventCount,
    sourceAsOf:valid.asOf,lastSuccessAt:stamp,
  });

  return {
    ok:true,
    schema:"geomacro.private-gri-v12-b2-d1-archive-proof.v1",
    source_as_of:valid.asOf,
    private_only:true,
    public_published:false,
    commercial_eligible:false,
    content_addressed_b2_key:key,
    compressed_sha256:digest,
    compressed_bytes:packed.length,
    original_input_sha256:valid.inputHash,
    portable_proof_hash:valid.portableProofHash,
    portable_bundle_hash:valid.portableBundleHash,
    b2_full_readback_verified:true,
    b2_exact_gzip_restore_verified:true,
    d1_checkpoint_readback_verified:true,
    d1_metadata_private_only:true,
    supabase_writes:0,
    usdc_spent:0,
    source_authenticity_independently_verified:false,
    source_rights_verified:false,
    independent_corroboration_verified:false,
  };
}
