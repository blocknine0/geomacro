/**
 * Account-wide D1 Paid *internal* budget assessment. This is a READ-ONLY,
 * non-atomic decision, NOT a provider-imposed daily limit or a write permit.
 * Every producer must additionally use a shared atomic admission lease.
 */
export const PAID_D1_INTERNAL = Object.freeze({
  reads:18_000_000, writes:180_000,
  safetyWrites:5_000, protectedPartnerWrites:8_000,
  worstWritesPerOriginal:16, fixedWritesPerBatch:2,
  maxOriginalsPerBatch:50,
});
const integer = n => Number.isSafeInteger(n) && n>=0;
const recent = (p,now) => p?.verified===true &&
  Number.isFinite(Date.parse(p.observed_at)) &&
  Date.parse(p.observed_at)<=now.getTime() &&
  now.getTime()-Date.parse(p.observed_at) <= 300000;
/** Throw on unproved Paid entitlement; caller may select the original Free path. */
export function assessPaidEnvelope(snapshot,{now=new Date(),paidProof,spendGuardProof}={}) {
  if (!(now instanceof Date)||!Number.isFinite(now.getTime()) ||
      snapshot?.schema!=="geomacro.d1-account-daily-quota-readonly.v1" ||
      snapshot.provider_graphql_usage_observed!==true ||
      snapshot.day_utc!==now.toISOString().slice(0,10) ||
      !integer(snapshot.observed_rows_read)||!integer(snapshot.observed_rows_written))
    throw Error("PAID_D1_ACCOUNT_METRICS_UNVERIFIED");
  if (!recent(paidProof,now) ||
      paidProof.schema!=="geomacro.cloudflare-workers-paid-provider-proof.v1" ||
      paidProof.source!=="CLOUDFLARE_ACCOUNT_SUBSCRIPTIONS_BILLING_READ" ||
      paidProof.subscription_changed!==false ||paidProof.billing_action_performed!==false ||
      !recent(spendGuardProof,now) ||
      spendGuardProof.schema!=="geomacro.cloudflare-five-usd-spend-lock.v1" ||
      spendGuardProof.source!=="CLOUDFLARE_ACCOUNT_READONLY_SPEND_POLICIES" ||
      spendGuardProof.usage_block_threshold_cents!==1 ||
      JSON.stringify(spendGuardProof.products)!=='["workers","durable_objects"]')
    throw Error("PAID_D1_PROVIDER_PROOF_UNVERIFIED");

  const p=PAID_D1_INTERNAL;
  const writesLeft=Math.max(0,p.writes-snapshot.observed_rows_written);
  const readsLeft=Math.max(0,p.reads-snapshot.observed_rows_read);
  // Explicit protected partner and delayed-analytics reserves. No Cloudflare
  // Paid daily physical quota; these are GeoMacro's own policy values.
  const spendable=Math.max(0,writesLeft-p.safetyWrites-p.protectedPartnerWrites);
  const perOriginal=p.worstWritesPerOriginal;
  const maxOriginals=Math.max(0,Math.min(p.maxOriginalsPerBatch,
    Math.floor((spendable-p.fixedWritesPerBatch)/perOriginal)));
  const allowed=readsLeft>=3200 && maxOriginals>=1;
  return Object.freeze({
    schema:"geomacro.d1-paid-internal-envelope.v2", day_utc:snapshot.day_utc,
    provider_plan:"workers_paid", provider_monthly_rows_written_included:50_000_000,
    provider_monthly_rows_read_included:25_000_000_000,
    provider_daily_100k_free_limit_applicable:false,
    internal_soft_rows_written:p.writes, internal_soft_rows_read:p.reads,
    observed_rows_written:snapshot.observed_rows_written,
    observed_rows_read:snapshot.observed_rows_read,
    soft_write_headroom:writesLeft, soft_read_headroom:readsLeft,
    max_originals_per_bounded_batch:allowed?maxOriginals:0,
    state:allowed?"SOURCE_BUNDLE_ELIGIBLE_NONATOMIC":"HELD",
    reason:!writesLeft?"INTERNAL_DAILY_WRITE_BUDGET_EXHAUSTED":
      !readsLeft?"INTERNAL_DAILY_READ_BUDGET_EXHAUSTED":
      allowed?"PAID_CAPACITY_VERIFIED_INTERNAL_BUDGET_AVAILABLE":
      "PROTECTED_RESERVES_OR_BATCH_HEADROOM_INSUFFICIENT",
    soft_budget_is_not_provider_limit:true,
    budget_is_nonatomic_provider_snapshot:true,
    atomic_reservation_still_required:true,
  });
}
/** Adapt to GeoMacro's pre-existing admission contract without new privileges. */
export function paidBundleContract(envelope){
 const grant=envelope.state==="SOURCE_BUNDLE_ELIGIBLE_NONATOMIC";
 return Object.freeze({
  schema:"geomacro.d1-free-bundled-work-admission.v1",day_utc:envelope.day_utc,
  state:grant?"CRITICAL_ONLY":"HELD",reason:envelope.reason,
  critical:grant,research:false,maintenance:false,
  source_intake:grant,source_intake_interval_minutes:grant?20:null,
  source_intake_max_new_rows:envelope.max_originals_per_bounded_batch,
  registered_private_max_new_rows:0,phase2h_raw_archive:false,
  retention_cleanup:false,retention_cleanup_max_rows:0,
  snapshot_refresh:grant,structural_snapshot:false,
  historical_recovery:false,historical_recovery_max_rows:0,
  governed_measurement:false,paid_capacity_verified_by_provider:true,
  free_plan_5m_cap_not_applied_only_with_verified_subscription:true,
  daily_account_soft_limit_read:envelope.internal_soft_rows_read,
  daily_account_soft_limit_write:envelope.internal_soft_rows_written,
  observed_rows_read:envelope.observed_rows_read,
  observed_rows_written:envelope.observed_rows_written,
  soft_write_headroom:envelope.soft_write_headroom,
  predge_account_headroom_guard_enabled:true,
  predge_account_headroom_is_hard_partition:false,
  predge_request_governor_is_separate_and_unchanged:true,
  paid_subscription_change_performed:false,paid_billing_is_operator_controlled:true,
  d1_queries:0,d1_rows_written:0,b2_requests:0,paid_calls:0,
  budget_is_nonatomic_provider_snapshot:true,
  atomic_reservation_still_required:true,
 });
}
