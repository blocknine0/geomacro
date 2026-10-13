import {createHash} from "node:crypto";
import {clusterPrivateIndependentEventCandidates} from "./private-independent-event-review-queue.mjs";

/**
 * No-external-reviewer private machine-evidence handoff.
 *
 * Reuses the existing pinned publisher registry, native-original timestamp,
 * claim-identity, exact-content hash, anti-syndication and retraction guard.
 * This proves ONLY that normalized PRIVATE candidates meet the clustering
 * contract. It does not independently re-fetch article bytes, establish
 * article-by-article commercial rights or provide a reviewer signature.
 *
 * Never expose original sources or confuse this with paid signed intelligence.
 */
export function evaluateGeomacroMachineCorroboration({
  candidates=[],now=new Date(),
}={}){
  const clustered=clusterPrivateIndependentEventCandidates({candidates,now});
  if(clustered.schema!=="geomacro.private-multi-source-review-queue.v1" ||
     clustered.public_published!==false ||
     clustered.paid_data_eligible!==false ||
     clustered.independent_human_or_trusted_review_completed!==false)
    throw Error("GEOMACRO_MACHINE_CANDIDATE_BOUNDARY_INVALID");

  const claims=clustered.review_candidates.map(c=>{
    const multi=c.state==="MULTI_ORIGIN_REVIEW_REQUIRED" &&
      c.confirming_origin_count>=2 &&
      c.independent_origin_count>=2 &&
      c.distinct_article_hash_count>=2 &&
      c.disputing_origin_count===0 && c.retracting_origin_count===0 &&
      c.materially_disputed_or_retracted===false;
    return {
      event_claim_sha256:c.event_claim_sha256,
      category:c.category,
      independent_original_issuer_count:c.independent_origin_count,
      confirming_original_issuer_count:c.confirming_origin_count,
      distinct_original_content_count:c.distinct_article_hash_count,
      original_publication_spread_minutes:c.original_publication_spread_minutes,
      candidate_status:multi
        ?"TWO_ORIGINAL_MACHINE_MATCH_REQUIRES_SOURCE_AUDIT"
        :"NOT_MACHINE_CORROBORATED",
      rejection_code:multi?null:c.state,
      independent_reviewer_attested:false,
      original_artifact_bytes_re_read:false,
      licensed_commercial_use_verified:false,
      derived_score_verified:false,
      signed_gro_verified:false,
      x402_eligible:false,
    };
  });
  const report={
    schema:"geomacro.private-automated-same-event-candidate.v1",
    observed_at:clustered.observed_at,
    candidate_count:clustered.examined_original_candidates,
    original_claim_count:claims.length,
    multiple_original_machine_candidates:claims.filter(x=>
      x.candidate_status==="TWO_ORIGINAL_MACHINE_MATCH_REQUIRES_SOURCE_AUDIT").length,
    verification_authority:"GEOMACRO_INTERNAL_AUTOMATED_OBSERVATION",
    human_or_independent_external_review_required_to_observe:false,
    independent_external_review_completed:false,
    publisher_article_readback_verified:false,
    licensed_commercial_source_rights_verified:false,
    commercial_eligible:false,
    x402_payment_authorized:false,
    public_published:false,
    d1_writes:0,b2_requests:0,supabase_writes:0,payments:0,
    claims,
  };
  return {
    ...report,
    report_sha256:createHash("sha256").update(JSON.stringify(report)).digest("hex"),
  };
}
