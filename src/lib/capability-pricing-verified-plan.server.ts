import type { AgentQueryPlan } from "./agent-query-plan";
import { resolveGeomacroCapabilityPrice, type CapabilityPrice } from "./capability-pricing-catalog";

/** Server-only evidence, never read from a customer body or model output.
 * Classification is NOT payment authorization or a replacement for final
 * eligibility, immutable-delivery preparation, or x402 ledger acceptance.
 */
export type VerifiedCapabilityPriceProof = Readonly<{
  evidence_verified: true;
  rights_verified: true;
  signing_verified: true;
  deliverable: true;
  signed_object_lifecycle: "existing" | "new" | "none";
  change_attribution_verified: boolean;
}>;

/** Deterministic map from the canonical plan to an approved quote class.
 * Call ONLY after proof qualification; a classifier cannot promote evidence.
 * Unsupported or unprovable products remain no-charge.
 */
export function resolveVerifiedPublishedPlanPrice(
  plan: AgentQueryPlan,
  proof: VerifiedCapabilityPriceProof,
): CapabilityPrice {
  if (!proof || proof.evidence_verified !== true || proof.rights_verified !== true ||
      proof.signing_verified !== true || proof.deliverable !== true) {
    throw new Error("CAPABILITY_PRICE_ELIGIBILITY_UNVERIFIED_NO_CHARGE");
  }
  if (plan.fulfillment_mode !== "published_only" || plan.subjects.length < 1) {
    throw new Error("CAPABILITY_PRICE_PUBLISHED_PROOF_REQUIRED");
  }
  if (proof.signed_object_lifecycle !== "existing" &&
      proof.signed_object_lifecycle !== "new" &&
      proof.signed_object_lifecycle !== "none") {
    throw new Error("CAPABILITY_PRICE_SIGNED_LIFECYCLE_INVALID");
  }

  if (plan.delivery_tier === "structural_baseline") {
    if (plan.subjects.length !== 1 || plan.subjects[0]?.type !== "country" ||
        plan.topics.length !== 1 || plan.intent !== "single_subject") {
      throw new Error("CAPABILITY_PRICE_STRUCTURAL_SCOPE_UNSUPPORTED");
    }
    // The verified existing structural-baseline endpoint is a digest.
    // Profiles and corridor products require their distinct product proofs.
    return resolveGeomacroCapabilityPrice("structural_country_digest", "standard");
  }

  const topics = new Set(plan.topics);
  if (topics.has("risk_gate")) {
    if (plan.subjects.length !== 1 || proof.signed_object_lifecycle === "none") {
      throw new Error("CAPABILITY_PRICE_RISK_GATE_SIGNED_PROOF_REQUIRED");
    }
    const additional = [...topics].filter(t => t !== "risk_gate" && t !== "risk_object");
    const variant = proof.signed_object_lifecycle === "existing" &&
      additional.length === 0 && plan.detail !== "full"
        ? "existing_proof_preflight"
        : additional.length <= 2 && plan.detail !== "full"
          ? "standard" : "complex_multi_source";
    // The signed Risk Object is INCLUDED in this single bundle charge.
    return resolveGeomacroCapabilityPrice("risk_gate_bundle", variant);
  }

  if (topics.size === 1 && topics.has("risk_object")) {
    if (proof.signed_object_lifecycle === "none") {
      throw new Error("CAPABILITY_PRICE_SIGNED_OBJECT_PROOF_REQUIRED");
    }
    return resolveGeomacroCapabilityPrice("signed_risk_object",
      proof.signed_object_lifecycle === "existing" ? "existing_valid_signed" : "newly_qualified_signed");
  }

  if (topics.has("gri_context") &&
      [...topics].every(t => t === "gri_context" || t === "risk_object")) {
    if (plan.intent === "change_since" && !proof.change_attribution_verified) {
      throw new Error("CAPABILITY_PRICE_GRI_ATTRIBUTION_UNVERIFIED");
    }
    return resolveGeomacroCapabilityPrice("gri_read", plan.intent === "change_since"
      ? "verified_change_attribution" : "verified_cached");
  }

  if (plan.delivery_tier !== "signed_risk_intelligence") {
    throw new Error("CAPABILITY_PRICE_DELIVERY_TIER_UNSUPPORTED");
  }
  if (plan.intent === "risk_gate") {
    throw new Error("CAPABILITY_PRICE_RISK_GATE_TOPIC_MISSING");
  }
  const focused = plan.subjects.length === 1 &&
    topics.size === 1 && plan.detail === "compact" &&
    (plan.intent === "single_subject" || plan.intent === "corridor");
  const standard = plan.subjects.length === 1 && topics.size <= 3 &&
    plan.detail !== "full" && plan.intent !== "ranking_filter";
  return resolveGeomacroCapabilityPrice("intelligence_query",
    focused ? "focused" : standard ? "standard" : "complex_multi_source");
}
