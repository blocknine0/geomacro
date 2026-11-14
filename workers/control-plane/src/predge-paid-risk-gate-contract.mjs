/** Paid Predge Risk Gate Addendum v2 terms. Separate from Direct Store/x402 catalog. */
export const PREDGE_PAID_RISK_GATE_V2 = Object.freeze({
  contract_id: "predge-paid-customer-traffic-addendum-v2",
  version: "2026-11-11",
  channel: "predge_b2b",
  settlement_rail: "circle_arc",
  settlement_network: "arc",
  alternate_settlement_network_requires_mutual_email_agreement: true,
  settlement_asset: "USDC",
  usage_report_due_day: 5,
  usage_report_due_month: "FOLLOWING_MONTH",
  usage_report_line_item: "ONE_LINE_PER_DELIVERED_PAID_CHECK_WITH_VERDICT_ID",
  settlement_due_day: 10,
  settlement_due_month: "FOLLOWING_MONTH",
  revenue_collection_basis: "COLLECTED_REVENUE_ONLY",
  prepayments: false,
  minimums: false,
  fixed_monthly_fees: false,
  term: "INDEFINITE_UNTIL_TERMINATED",
  termination_notice_days: 30,
  paid_traffic_default_enabled: false,
  paid_traffic_enablement_requires_go_live_and_72h_crosscheck: true,
  tiers: Object.freeze({
    basic_focused: Object.freeze({
      structure_type: "BASIC_FOCUSED_FACTS_DERIVED_V1",
      customer_price_usdc_cents: 15,
      geomacro_fee_usdc_cents: 10,
      predge_share_usdc_cents: 5,
    }),
    standard: Object.freeze({
      structure_type: "STANDARD_DUAL_ORIGINAL_GRO_V1",
      customer_price_usdc_cents: 20,
      geomacro_fee_usdc_cents: 15,
      predge_share_usdc_cents: 5,
    }),
    complex_full: Object.freeze({
      structure_type: "COMPLEX_7D_CORRIDOR_SYNTHESIS_V1",
      customer_price_usdc_cents: 30,
      geomacro_fee_usdc_cents: 25,
      predge_share_usdc_cents: 5,
    }),
  }),
});

export const PREDGE_SINGLE_END_BUYER_LICENSE = Object.freeze({
  single_end_buyer_only: true,
  max_end_buyers: 1,
  max_uses: 1,
  further_resale_permitted: false,
});

/** Validate the one end-buyer binding before any paid request can claim D1. */
export function predgeSingleEndBuyerBinding(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { ok: false, error: "SINGLE_END_BUYER_ID_REQUIRED" };
  }
  const buyerFields = Object.keys(metadata).filter(key =>
    /^(?:end_)?buyer_?ids?$/iu.test(key));
  if (buyerFields.length > 1 || buyerFields.includes("buyer_ids") ||
      buyerFields.includes("end_buyer_ids")) {
    return { ok: false, error: "MULTIPLE_END_BUYERS_FORBIDDEN" };
  }
  const value = metadata.end_buyer_id;
  if (Array.isArray(value) || typeof value === "string" && /[,;]/u.test(value)) {
    return { ok: false, error: "MULTIPLE_END_BUYERS_FORBIDDEN" };
  }
  if (typeof value !== "string") return { ok: false, error: "SINGLE_END_BUYER_ID_REQUIRED" };
  const endBuyerId = value.trim();
  if (!endBuyerId) return { ok: false, error: "SINGLE_END_BUYER_ID_REQUIRED" };
  if (endBuyerId.length > 256) return { ok: false, error: "SINGLE_END_BUYER_ID_REQUIRED" };
  return { ok: true, end_buyer_id: endBuyerId };
}

/**
 * Return the enabled paid endpoint mode, or null while it must remain closed.
 * A configured trial start holds traffic in no-charge mode until its exact
 * 72-hour window expires; only the completed go-live cross-check can then
 * switch it to paid delivery.
 */
export function predgePaidTrafficMode(env, policy, now = Date.now()) {
  if (policy?.policy_id !== "predge-paid-traffic-addendum-v2" ||
      !Number.isSafeInteger(now) || now < 0) return null;
  const trialStart = String(env?.PREDGE_MUTUAL_TRIAL_STARTED_AT ?? "").trim();
  if (trialStart) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|\+00:00)$/u.test(trialStart)) return null;
    const startedAt = Date.parse(trialStart);
    if (!Number.isFinite(startedAt) || startedAt > now) return null;
    if (now - startedAt < 72 * 3600 * 1000) return "MUTUAL_72H_TRIAL";
  }
  return env?.PREDGE_PAID_TRAFFIC_ENABLED === "YES" &&
    env?.PREDGE_PAID_GO_LIVE_CROSSCHECK === "PASS" ? "PAID_ADDENDUM_V2" : null;
}

export function predgePaidRiskGateTerms(tier) {
  const terms = PREDGE_PAID_RISK_GATE_V2.tiers[tier];
  if (!terms) throw new Error("PREDGE_RISK_GATE_TIER_INVALID");
  return terms;
}

export function usdcFromCents(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error("PREDGE_RISK_GATE_AMOUNT_INVALID");
  }
  return (cents / 100).toFixed(2);
}
