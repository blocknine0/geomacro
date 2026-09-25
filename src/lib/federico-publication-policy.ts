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
  if (reasons.size) {
    throw new Error(`FEDERICO_STRICT publication blocked before signing/persistence: ${[...reasons].sort().join(", ")}`);
  }
}
