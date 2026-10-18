import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {verifyThreeDomainReviewerHandoff} from "./three-domain-reviewed-handoff.mjs";
import {preflightReviewedCurrentGlobalRisk} from "./supabase-free-gri-v12-current.mjs";

const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const PREFIX_REVIEW="geomacro-evidence/v1/private/reviewed-gri-current/";
const PREFIX_COUNTRY="geomacro-evidence/v1/private/reviewed-country-certification/";
const MAX_REVIEW_BYTES=1024*1024;
const MAX_CERT_BYTES=512*1024;
const MAX_HISTORY_BYTES=2*1024*1024;
const fail=code=>{throw Error("GRI_REVIEWED_IMMUTABLE_B2_HANDOFF_"+code)};

/**
 * Real external reviewer signature and country-cell-certificate staging.
 * Authorizes NO new review, copyright permission, scoring or publication.
 * No network, private key, D1, B2 write or x402. No upstream material is
 * returned in the PUBLIC receipt: only private contents in uploadFiles.
 *
 * The exact signed inputs are rechecked by the protected publisher later.
 */
export function prepareImmutableReviewedGriHandoff({
  reviewedGri,countryCategoryCertificates,historicalB2Bytes,
  trustedReviewerPublicKeyPem,now=new Date(),
}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
     !Buffer.isBuffer(historicalB2Bytes)||
     historicalB2Bytes.length<30||historicalB2Bytes.length>MAX_HISTORY_BYTES)
    fail("PINNED_REAL_HISTORICAL_B2_REQUIRED");

  // Preserve the exact reviewed signed-input JSON property order/bytes.
  // New JSON serialization cannot manufacture reviewer Ed25519 approval.
  const reviewedBytes=Buffer.from(JSON.stringify(reviewedGri));
  const certificatesBytes=Buffer.from(JSON.stringify(countryCategoryCertificates));
  if(reviewedBytes.length<100||reviewedBytes.length>MAX_REVIEW_BYTES||
     certificatesBytes.length<100||certificatesBytes.length>MAX_CERT_BYTES)
    fail("SIGNED_INPUT_SIZE_INVALID");

  const preflight=preflightReviewedCurrentGlobalRisk({
    reviewed:reviewedGri,trustedReviewerPublicKeyPem,now,
  });
  const matched=verifyThreeDomainReviewerHandoff({
    intelligence:{
      rows:reviewedGri.signed_input.customerRows,
      eventPackages:reviewedGri.signed_input.eventPackages,
    },
    reviewedGri,countryCategoryCertificates,historicalB2Bytes,
    trustedReviewerPublicKeyPem,now,
  });
  if(matched.receipt.independently_reviewer_signed!==true||
     matched.receipt.current_three_domain_originals_verified!==true||
     matched.receipt.historical_b2_bytes_verified!==true||
     matched.receipt.qualified_event_count!==reviewedGri.signed_input.events.length||
     matched.receipt.historical_b2_sha256!==preflight.history_b2_sha256||
     sha(historicalB2Bytes)!==preflight.history_b2_sha256||
     !Buffer.from(matched.reviewedGriInput).equals(reviewedBytes))
    fail("SIGNED_EVIDENCE_OR_HISTORICAL_LINEAGE_NOT_BOUND");

  const reviewedSha=sha(reviewedBytes),certificateSha=sha(certificatesBytes);
  const until=Math.min(
    Date.parse(reviewedGri.signed_input.as_of)+90*60_000,
    Date.parse(reviewedGri.signed_input.reviewed_at)+90*60_000,
  );
  if(!Number.isFinite(until)||until<=now.getTime())fail("SIGNED_REVIEW_EXPIRED");
  return Object.freeze({
    // KEEP these private byte buffers in memory or 0600 private files ONLY.
    uploadFiles:Object.freeze([
      Object.freeze({key:PREFIX_REVIEW+reviewedSha+".json",
        sha256:reviewedSha,bytes:reviewedBytes}),
      Object.freeze({key:PREFIX_COUNTRY+certificateSha+".json",
        sha256:certificateSha,bytes:certificatesBytes}),
    ]),
    receipt:Object.freeze({
      schema:"geomacro.gri-reviewed-immutable-b2-handoff.v1",
      private_reviewer_signed_input_preflight_verified:true,
      distinct_country_category_certifications_verified:true,
      historical_source_bytes_sha256:preflight.history_b2_sha256,
      historical_source_bytes_verified:true,
      reviewed_b2_key:PREFIX_REVIEW+reviewedSha+".json",
      reviewed_b2_sha256:reviewedSha,
      reviewed_certificates_b2_key:PREFIX_COUNTRY+certificateSha+".json",
      reviewed_certificates_b2_sha256:certificateSha,
      qualified_events:matched.receipt.qualified_event_count,
      certified_country_category_cells:matched.receipt.signed_country_category_cells,
      retained_source_portfolio_review:matched.receipt.retained_source_portfolio_review,
      signed_reviewer_public_key_sha256:preflight.reviewer_spki_sha256,
      publisher_input_expires_at:new Date(until).toISOString(),
      immutable_b2_readback_verified:false,
      real_source_rights_checked_by_this_packager:false,
      canonical_numerical_score_published:false,
      risk_indices_published:false,
      x402_charge_authorized:false,
      b2_writes:0,d1_writes:0,supabase_requests:0,payments:0,
      private_source_bytes_exposed:false,
    }),
  });
}
