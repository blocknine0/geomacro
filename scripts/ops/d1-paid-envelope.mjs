/**
 * Account-wide D1 Paid *internal* budget assessment. This is a READ-ONLY,
 * non-atomic decision, NOT a provider-imposed daily limit or a write permit.
 * Every producer must additionally use a shared atomic admission lease.
 */
export const PAID_D1_INTERNAL = Object.freeze({
  reads:120_000, writes:180_000,
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
  const elapsedMs=now.getTime()-Date.parse(snapshot.day_utc+"T00:00:00.000Z");
  const fraction=Math.min(1,Math.max(0,elapsedMs/86_400_000));
  // These are INTERNAL pacing watermarks, not Cloudflare Paid hard limits.
  const pacedRead=Math.floor(20_000+(p.reads-20_000)*fraction);
  const pacedWrite=Math.floor(40_000+(p.writes-40_000)*fraction);
  const writesLeft=Math.max(0,p.writes-snapshot.observed_rows_written);
  const readsLeft=Math.max(0,p.reads-snapshot.observed_rows_read);
  const readRoom=Math.max(0,pacedRead-snapshot.observed_rows_read);
  const writeRoom=Math.max(0,pacedWrite-snapshot.observed_rows_written);
  const critical=snapshot.observed_rows_read<pacedRead &&
    snapshot.observed_rows_written<pacedWrite;
  // Preserve all remaining producer slots and the existing 23k critical
  // write reserve before granting a single source microbatch.
  const minutesLeft=Math.max(1,1440-(now.getUTCHours()*60+now.getUTCMinutes()));
  const slots=Math.ceil(minutesLeft/15)+Math.ceil(minutesLeft/20);
  const archiveReserve=Math.ceil(minutesLeft/360)*750+150;
  const criticalReadReserve=15_000, criticalWriteReserve=23_000;
  const perSlot=Math.min(p.maxOriginalsPerBatch,
    Math.floor((writesLeft-criticalWriteReserve-slots*40-archiveReserve)/
      (slots*p.worstWritesPerOriginal)),
    Math.floor((readsLeft-criticalReadReserve-slots*300-10_000)/
      (slots*60)));
  const maxOriginals=Math.max(0,perSlot);
  const sourceIntake=critical&&maxOriginals>=3&&
    writeRoom>criticalWriteReserve+maxOriginals*p.worstWritesPerOriginal+40&&
    readRoom>criticalReadReserve+maxOriginals*60+300&&
    readsLeft>criticalReadReserve+slots*300+10_000;
  const archive=sourceIntake&&
    writeRoom>criticalWriteReserve+maxOriginals*p.worstWritesPerOriginal+40+900&&
    writesLeft>criticalWriteReserve+
      slots*(maxOriginals*p.worstWritesPerOriginal+40)+archiveReserve;
  return Object.freeze({
    schema:"geomacro.d1-paid-internal-envelope.v2",day_utc:snapshot.day_utc,
    provider_plan:"workers_paid", provider_monthly_rows_written_included:50_000_000,
    provider_monthly_rows_read_included:25_000_000_000,
    provider_daily_100k_free_limit_applicable:false,
    internal_soft_rows_written:p.writes,internal_soft_rows_read:p.reads,
    paced_soft_rows_written:pacedWrite,paced_soft_rows_read:pacedRead,
    observed_rows_written:snapshot.observed_rows_written,
    observed_rows_read:snapshot.observed_rows_read,
    soft_write_headroom:writesLeft,soft_read_headroom:readsLeft,
    max_originals_per_bounded_batch:sourceIntake?maxOriginals:0,
    critical_eligible:critical,source_intake_eligible:sourceIntake,
    archive_eligible:archive,
    state:critical?"CRITICAL_ONLY":"HELD",
    reason:!writesLeft?"INTERNAL_DAILY_WRITE_BUDGET_EXHAUSTED":
      !readsLeft?"INTERNAL_DAILY_READ_BUDGET_EXHAUSTED":
      critical?"PROVIDER_VERIFIED_WORKERS_PAID_SOFT_BUDGET":
      "WORKERS_PAID_CONSERVATIVE_SOFT_BUDGET_REACHED",
    soft_budget_is_not_provider_limit:true,
    budget_is_nonatomic_provider_snapshot:true,
    atomic_reservation_still_required:true,
  });
}
/** Adapt to GeoMacro's pre-existing admission contract without new privileges. */
export function paidBundleContract(envelope){
 const critical=envelope.critical_eligible===true;
 const source=envelope.source_intake_eligible===true;
 const archive=envelope.archive_eligible===true;
 return Object.freeze({
  schema:"geomacro.d1-free-bundled-work-admission.v1",day_utc:envelope.day_utc,
  state:critical?"CRITICAL_ONLY":"HELD",reason:envelope.reason,
  critical,research:false,maintenance:false,
  source_intake:source,source_intake_interval_minutes:source?20:null,
  source_intake_max_new_rows:source?envelope.max_originals_per_bounded_batch:0,
  registered_private_max_new_rows:0,phase2h_raw_archive:archive,
  phase2h_raw_archive_max_rows_per_slot:300,
  phase2h_raw_archive_requires_atomic_b2_quota:true,
  retention_cleanup:false,retention_cleanup_max_rows:0,
  snapshot_refresh:false,structural_snapshot:false,
  historical_recovery:false,historical_recovery_max_rows:0,
  governed_measurement:false,paid_capacity_verified_by_provider:true,
  free_plan_5m_cap_not_applied_only_with_verified_subscription:true,
  daily_account_soft_limit_read:envelope.paced_soft_rows_read,
  daily_account_soft_limit_write:envelope.paced_soft_rows_written,
  observed_rows_read:envelope.observed_rows_read,
  observed_rows_written:envelope.observed_rows_written,
  soft_write_headroom:envelope.soft_write_headroom,
  predge_account_headroom_guard_enabled:false,
  predge_account_headroom_planning_reserve:{rows_read:5000,rows_written:8000,pilot_request_cap_per_utc_day:500,basis:"CONSERVATIVE_NONATOMIC_ACCOUNT_WIDE_CAPACITY_RESERVE"},
  predge_account_headroom_is_hard_partition:false,
  predge_request_governor_is_separate_and_unchanged:true,
  paid_subscription_change_performed:false,paid_billing_is_operator_controlled:true,
  d1_queries:0,d1_rows_written:0,b2_requests:0,paid_calls:0,
  budget_is_nonatomic_provider_snapshot:true,
  atomic_reservation_still_required:true,
 });
}
