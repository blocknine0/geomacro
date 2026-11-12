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
