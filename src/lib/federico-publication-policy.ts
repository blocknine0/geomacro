import type { GeomacroRiskObject } from "./risk-object-contract";
import { FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES } from "./public-demo-risk-profile";

/** Apply the acceptance gates before signing or any immutable database write. */
export function assertFedericoPublicationReady(object: GeomacroRiskObject): void {
  const reasons = new Set<string>();
  if (object.schema_version !== "gro-1.1") reasons.add("unsupported_schema");
  if (!["READY", "DEGRADED"].includes(object.decision_readiness?.status ?? "")) {
    reasons.add("decision_unready");
  }
  // The pilot's uncalibrated interval is the only permitted degraded reason.
  for (const reason of object.decision_readiness?.reason_codes ?? []) {
    if (reason !== "uncalibrated_uncertainty_interval") reasons.add(reason);
  }
  if (!object.evidence.length || object.evidence_summary.event_count < 1) reasons.add("no_fresh_evidence");
  if (object.evidence_summary.independent_source_count < FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES) {
    reasons.add("insufficient_independent_source_families");
  }
  if (object.commercial_eligibility.status !== "VERIFIED") {
    reasons.add("commercial_eligibility_unverified");
  }
  if (object.verification.status !== "VERIFIED") reasons.add("verification_incomplete");

  // The receiver independently audits the semantic validity of the signed
  // calculation inputs, not just their SHA and weighted-mean arithmetic.
  // An event whose severity was absent/defaulted to zero must never be
  // presented to Federico as independently verified "zero risk / CALM".
  // Likewise a generic/unknown event type must not be silently scored under
  // the unclassified "other" driver. These failures are not evidence of
  // safety, and cannot be solved by inventing a non-zero severity.
  const manifest = object.provenance?.reproducibility?.calculation_input as
    | { events?: Array<Record<string, unknown>> }
    | undefined;
  const calculationEvents = Array.isArray(manifest?.events)
    ? manifest.events
    : [];
  const evidenceById = new Map(object.evidence.map((item) => [item.event_id, item]));
  if (
    calculationEvents.length === 0 ||
    calculationEvents.length !== object.evidence.length
  ) {
    reasons.add("semantic_calculation_evidence_mismatch");
  }
  for (const event of calculationEvents) {
    const id = String(event.id ?? "");
    const signedEvidence = evidenceById.get(id);
    if (!id || !signedEvidence) {
      reasons.add("semantic_calculation_evidence_mismatch");
      continue;
    }
    const severity = Number(event.severity);
    const confidence = Number(event.confidence);
    const relevanceWeight = Number(event.relevance_weight);
    if (!Number.isFinite(severity) || severity <= 0 || severity > 100) {
      reasons.add("unsupported_zero_or_missing_severity");
    }
    if (!Number.isFinite(confidence) || confidence <= 0 || confidence > 100) {
      reasons.add("unsupported_confidence");
    }
    if (!Number.isFinite(relevanceWeight) ||
      relevanceWeight <= 0 || relevanceWeight > 1) {
      reasons.add("unsupported_relevance_weight");
    }
    if (String(event.driver ?? "") === "other" ||
      !String(event.event_type ?? "").trim()) {
      reasons.add("unclassified_material_risk_driver");
    }
    if (
      signedEvidence.event_type !== event.event_type ||
      signedEvidence.severity !== severity ||
      signedEvidence.confidence !== confidence ||
      signedEvidence.relevance_weight !== relevanceWeight
    ) {
      reasons.add("semantic_calculation_evidence_mismatch");
    }
  }
  if (object.evidence.length > 0 && (!Number.isFinite(object.risk.score) ||
    object.risk.score <= 0)) {
    reasons.add("unsupported_zero_risk_conclusion");
  }
  if (reasons.size) {
    throw new Error(`FEDERICO_STRICT publication blocked before signing/persistence: ${[...reasons].sort().join(", ")}`);
  }
}
