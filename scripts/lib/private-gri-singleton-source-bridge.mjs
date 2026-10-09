/**
 * #1827 stage -> private GRI v1.2 source bridge for a strictly limited
 * 3-domain singleton bootstrap: exactly ONE independently original-publisher-
 * timestamped canonical scored event per domain in the supplied PRIVATE
 * bundle. Any same-category second story or cross-run continuity needs the
 * full canonical model/ledger matcher; never infer distinct stories.
 *
 * In this bounded *private* scope only, the unchanged GRI v1.2 canonical
 * bootstrap rule is deterministic. This does not independently verify source
 * authenticity, publishing rights, same-story independence versus prior
 * archives, or eligibility for public/purchase.
 */
import { sha256, STAGE_DOMAINS, validatePrivateStageBundle } from
  "./restricted-private-scored-stage.mjs";
import { validatePrivateGriCompanionBundle } from
  "./private-gri-original-publisher-companion.mjs";
import {
  canonicalJson,
  GRI_STORY_CORRELATION_VERSION,
  GRI_STORY_CORRELATION_PROMPT_VERSION,
} from "./gri-engine-v12.js";
import {
  GRI_PRIVATE_OFFLINE_ADMISSION_SCHEMA,
  griPrivateSha256,
  buildPrivateSupabaseFreeGriProof,
} from "./gri-v12-private-offline-admission.mjs";

const MAX_AGE_MS=90*60_000;
const MAX_FUTURE_MS=5*60_000;
const RATIONALE="Private input contains one article in this domain; no in-scope comparator is present. Historical cross-run story continuity, rights and corroboration are NOT verified.";
function invariant(p,code) { if(!p) throw new Error(code); }

export function buildPrivateGriSingletonSourceBridge({
  stage,
  sourceCompanion,
  now=new Date(),
}={}) {
  const nowMs=now instanceof Date?now.getTime():NaN;
  invariant(Number.isFinite(nowMs),"GRI_PRIVATE_BRIDGE_CLOCK_INVALID");
  validatePrivateStageBundle(stage,{now});
  validatePrivateGriCompanionBundle(sourceCompanion,stage,{now});
  invariant(stage.rows.length===STAGE_DOMAINS.length &&
    sourceCompanion.rows.length===STAGE_DOMAINS.length &&
    STAGE_DOMAINS.every(c=>stage.counts[c]===1),
    "GRI_PRIVATE_BRIDGE_SINGLETON_REQUIRED");
  const sourcesById=new Map(sourceCompanion.rows.map(r=>[r.event_id,r]));
  const events=[];
  for(const category of STAGE_DOMAINS) {
    const staged=stage.rows.find(r=>r.category===category);
    const source=sourcesById.get(staged?.id);
    invariant(source?.category===category &&
      source.original_publisher_native_timestamp_hint===true &&
      source.source_authenticity_independently_verified===false &&
      source.rights_verified===false &&
      source.independently_corroborated===false &&
      source.public_eligible===false,
      "GRI_PRIVATE_BRIDGE_ORIGINAL_PUBLISHER_NOT_ADMITTED:"+category);
    const publishedAt=Date.parse(source.original_published_at);
    const observedAt=Date.parse(source.first_observed_at);
    const classifiedAt=Date.parse(source.classification_scored_at);
    invariant([publishedAt,observedAt,classifiedAt].every(Number.isFinite) &&
      publishedAt<=observedAt && classifiedAt===observedAt &&
      observedAt<=nowMs+MAX_FUTURE_MS &&
      publishedAt<=nowMs+MAX_FUTURE_MS &&
      nowMs-publishedAt<=MAX_AGE_MS &&
      nowMs-observedAt<=MAX_AGE_MS,
      "GRI_PRIVATE_BRIDGE_SOURCE_STALE_OR_FUTURE:"+category);
    // Exact canonical first-cluster input as used by legacy
    // cluster-gri-stories-v12.js (no DB writes, no title invention).
    const correlationInput=canonicalJson({
      category,
      eventId:staged.id,
      sourceTitle:source.private_source_title,
      publishedAt:source.original_published_at,
      sourceDomain:source.private_source_domain,
      decision:"bootstrap-new-story",
    });
    const clusterId="private-singleton:"+sha256(
      [category,staged.id,correlationInput].join("\n"));
    events.push({
      id:staged.id,
      category,
      severity:staged.severity,
      confidence:staged.confidence,
      created_at:source.first_observed_at,
      published_at:source.original_published_at,
      source_name:source.private_source_domain,
      source_domain:source.private_source_domain,
      source_url:source.private_source_url,
      source_title:source.private_source_title,
      summary:staged.summary,
      classification_provider:source.classifier_provider,
      classification_model:source.classifier_model,
      classification_version:source.classifier_version,
      classification_prompt_version:source.classifier_prompt_version,
      classification_scored_at:source.classification_scored_at,
      classification_input_hash:source.classifier_input_sha256,
      story_cluster_id:clusterId,
      story_canonical_label:source.private_source_title,
      story_assignment_decision:"anchor",
      story_match_confidence:100,
      story_decision_rationale:RATIONALE,
      story_clustering_provider:"deterministic",
      story_clustering_model:"singleton-bootstrap-v1",
      story_clustering_version:GRI_STORY_CORRELATION_VERSION,
      story_clustering_prompt_version:GRI_STORY_CORRELATION_PROMPT_VERSION,
      story_clustering_scored_at:now.toISOString(),
      story_clustering_input_hash:sha256(correlationInput),
    });
  }
  const admission={
    schema:GRI_PRIVATE_OFFLINE_ADMISSION_SCHEMA,
    as_of:now.toISOString(),
    private_only:true,
    commercial_eligible:false,
    public_published:false,
    rights_verification_pending:true,
    independent_corroboration_pending:true,
    events,
  };
  const hash=griPrivateSha256(canonicalJson(admission));
  const proof=buildPrivateSupabaseFreeGriProof({
    admission,expectedInputSha256:hash,now,
  });
  invariant(proof.current_coverage===1 &&
    proof.event_count===STAGE_DOMAINS.length &&
    proof.commercial_eligible===false &&
    proof.public_published===false,
    "GRI_PRIVATE_BRIDGE_PROOF_NOT_ACCEPTED");
  return {admission,expected_input_sha256:hash,private_proof:proof};
}
