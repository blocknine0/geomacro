import { createHash } from "node:crypto";

import { answerAskQuestion } from "./ask-answer.server";
import {
  runCanonicalTestnetIntelligence as runLegacyCanonicalTestnetIntelligence,
  type TestnetCapabilityDelivery,
} from "./testnet-intelligence-capability.server";
import type { TestnetIntelligenceRequest } from "./testnet-intelligence-contract";

function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Canonical testnet/commercial capability router.
 *
 * Natural-language intelligence_query uses the same verified/B2 -> bounded live
 * -> realtime current-public-evidence answer orchestrator as the human website.
 * Other signed/structural capabilities retain the existing verified delivery
 * implementation unchanged.
 */
export async function runCanonicalTestnetIntelligence(input: {
  request: TestnetIntelligenceRequest;
  max_structural_observations: number;
  max_evidence_references: number;
}): Promise<TestnetCapabilityDelivery> {
  const { request } = input;

  if (request.capability !== "intelligence_query") {
    return runLegacyCanonicalTestnetIntelligence(input);
  }

  const question = request.question ?? "";
  const answer = await answerAskQuestion(question);
  const evidence = answer.evidence
    .slice(0, input.max_evidence_references)
    .map((row) => ({
      event_id: row.eventId,
      title: row.title,
      relevance: row.relevance,
    }));

  return {
    data: {
      summary: answer.summary,
      what_changed: answer.what_changed,
      why_it_matters: answer.why_it_matters,
      geomacro_view: answer.geomacro_view,
      insufficient_evidence: answer.insufficient_evidence,
      mean_relevance: answer.mean_relevance,
      low_confidence: answer.low_confidence,
      gri: answer.gri,
      evidence,
      generated_at: answer.generatedAt,
      data_mode: answer.data_mode,
      cache_status: answer.cache_status,
      provenance: {
        source: "geomacro_hybrid_intelligence",
        internal_intelligence_used: answer.data_mode === "permanent",
        ephemeral_live_retrieval_used: answer.data_mode === "ephemeral_live",
        short_cache_used: answer.data_mode === "short_cache",
        durable_live_storage_write: false,
        upstream_source_identity_exposed: false,
      },
    },
    subject_type: "query",
    subject_key: sha256Json(question).slice(0, 24),
    evidence_reference_count: evidence.length,
    structural_observation_count: 0,
  };
}
