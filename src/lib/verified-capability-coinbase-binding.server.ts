import type { AgentQueryPlan } from "./agent-query-plan";
import type { AgentQueryDeliverability } from "./agent-query-deliverability.server";
import type { CoinbaseX402Config } from "./coinbase-x402.server";
import { readQualifiedStructuralEvidence } from "./agent-query-qualified-evidence.server";
import { isStructuralStoreProduct } from "./store-product-selection";
import { assertStoreStructuralEvidence, storeSignedObjectLifecycle } from "./store-product-evidence.server";
import {exactGeomacroUsdcRail} from "./usdc-native-rail-identities";
import {assertHighAuthorityPaidIntelligenceScope} from "./high-authority-paid-intelligence";
import {
  resolveVerifiedPublishedPlanPrice,
  type VerifiedCapabilityPriceProof,
} from "./capability-pricing-verified-plan.server";

/**
 * Derive the ONLY priced Coinbase configuration for the exact eligible
 * published plan. No client-supplied price, signed claim, or product tier may
 * override the canonical capability catalogue. No network or funds used here.
 *
 * A current signed risk product requires the commercial GRO module to have
 * been independently checked by checkAgentQueryExternalModule. A structural
 * country digest is explicitly historical/derived and must NEVER pretend to
 * include a current signed GRO.
 */
export function resolveEligiblePublishedCapabilityPrice(
  plan: AgentQueryPlan,
  availability: AgentQueryDeliverability,
  now: Date = new Date(),
) {
  if (plan.fulfillment_mode !== "published_only" ||
      !availability || availability.deliverable !== true ||
      availability.code !== "AVAILABLE" ||
      availability.query_plan_hash !== plan.query_plan_hash ||
      availability.subjects.length !== plan.subjects.length ||
      availability.subjects.length === 0 ||
      availability.missing_modules.length !== 0 ||
      availability.stale_modules.length !== 0 ||
      availability.ineligible_source_ids.length !== 0) {
    throw Error("CAPABILITY_PRICE_ELIGIBILITY_UNVERIFIED_NO_CHARGE");
  }

  // New, explicitly selected Intelligence Query offers are restricted to the
  // first-launch official, pre-qualified dataset universe. Existing immutable
  // settled replays never call this new-offer price eligibility function.
  if (plan.product?.capability === "intelligence_query")
    assertHighAuthorityPaidIntelligenceScope(availability);

  const structural = plan.delivery_tier === "structural_baseline";
  const signed = plan.required_modules.includes("signed_risk_object");
  if (!structural && !signed) {
    // A generic paid tier may not claim cryptographically signed delivery
    // merely because a few structural modules or discovery feeds exist.
    throw Error("CAPABILITY_PRICE_SIGNED_RISK_PROOF_REQUIRED");
  }
  if (structural && (
    signed || plan.subjects.length !== 1 || (!isStructuralStoreProduct(plan.product) && plan.subjects[0]?.type !== "country") ||
    plan.required_modules.some(name =>
      ["risk_gate", "gri_context", "hot_topics"].includes(name))
  )) throw Error("CAPABILITY_PRICE_STRUCTURAL_SCOPE_UNSUPPORTED");

  const rights = availability.source_contracts;
  if (structural && (
    rights.length === 0 ||
    rights.some(source => !["COMMERCIAL_OK", "DERIVED_ONLY"]
      .includes(source.commercial_usage_status??"") ||
      source.attribution_required !== false)
  )) throw Error("CAPABILITY_PRICE_STRUCTURAL_RIGHTS_UNVERIFIED");

  if (structural && availability.subjects.some(subject => {
    const time = Date.parse(subject.latest_evidence_at ?? "");
    return !Number.isFinite(time) || time > now.getTime() ||
      plan.required_modules.some(module =>
        !subject.available_modules.includes(module));
  })) throw Error("CAPABILITY_PRICE_STRUCTURAL_NATIVE_EVIDENCE_MISSING");

  const needsPrivateEvidence = isStructuralStoreProduct(plan.product) ||
    plan.product?.capability === "signed_risk_object" && plan.product.variant === "newly_qualified_signed";
  const qualified = needsPrivateEvidence ? readQualifiedStructuralEvidence(availability, plan) : null;
  if (isStructuralStoreProduct(plan.product)) {
    if (!qualified) throw Error("CAPABILITY_PRICE_STORE_QUALIFIED_EVIDENCE_REQUIRED");
    assertStoreStructuralEvidence(plan, qualified);
  }
  const proof: VerifiedCapabilityPriceProof = {
    evidence_verified: true,
    rights_verified: true,
    // Existing commercial GRO module was verified during paid-path admission;
    // there is NO implied or synthetic GRO for structural baseline.
    signing_verified: signed,
    deliverable: true,
    signed_object_lifecycle: signed ? storeSignedObjectLifecycle(plan, qualified, now) : "none",
    ...(isStructuralStoreProduct(plan.product) ? { store_structural_scope_verified: true } : {}),
    // External module checker verifies genuine change attribution before
    // returning AVAILABLE for a change_since signed risk object.
    change_attribution_verified: signed && plan.intent === "change_since",
  };
  const price = resolveVerifiedPublishedPlanPrice(plan, proof);
  return price;
}

export function resolveEligibleCoinbaseCapabilityConfig(
  plan: AgentQueryPlan, availability: AgentQueryDeliverability,
  config: CoinbaseX402Config, now = new Date(),
): CoinbaseX402Config {
  if (plan.product && (config.environment !== "production" || config.commercialEnvironment !== "mainnet" ||
      exactGeomacroUsdcRail(config.network, config.asset)?.id !== "base"))
    throw Error("STORE_MAINNET_CONFIGURATION_REQUIRED");
  const price = resolveEligiblePublishedCapabilityPrice(plan, availability, now);
  return { ...config, priceUsdc: price.amount_usdc, amountAtomic: price.amount_atomic };
}
