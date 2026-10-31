/**
 * Read-only, explicitly NON-PAYABLE platform baseline profile.
 * Never reuse as legacy signed paid health or proof of a live GRI.
 */
export type VerifiedBaselineHealthInput={
  last_verified_baseline_readable:Record<"intelligence"|"global_risk"|"risk_indices",boolean>;
  current_hot_product_ready:Record<"intelligence"|"global_risk"|"risk_indices",boolean>;
};
export function verifiedBaselineHealth(input:VerifiedBaselineHealthInput){
  const verified=input.last_verified_baseline_readable;
  const live=input.current_hot_product_ready;
  const baselineCount=Object.values(verified).filter(Boolean).length;
  const liveCount=Object.values(live).filter(Boolean).length;
  const baselineAvailable=baselineCount>0;
  return {
    statusCode:baselineAvailable?200:503,
    body:{
      schema:"geomacro.product-scoped-verified-baseline-health.v1",
      ok:baselineAvailable,
      product:"verified-baseline",
      status:!baselineAvailable?"NO_VERIFIED_BASELINE":
        liveCount===3?"BASELINE_VERIFIED_LIVE_CADENCE_READY":
        "BASELINE_VERIFIED_LIVE_CADENCE_IN_REVIEW",
      degraded:liveCount!==3,
      verified_baseline_products:{...verified},
      current_signed_live_products:{...live},
      verified_baseline_product_count:baselineCount,
      current_signed_live_product_count:liveCount,
      signed_gri_and_risk_indices_claim_only_if_individually_verified:true,
      historical_data_is_not_live_source_freshness:true,
      legacy_paid_deep_health_path:"/api/health?deep=1",
      paid_health_overridden:false,
      qualified_for_commercial_delivery:false,
      payment_authorized:false,
      chargeable:false,
    },
  } as const;
}
