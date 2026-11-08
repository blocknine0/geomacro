/**
 * Owner Workers Paid UTC D1 envelope, independently checking rows read and
 * written. Monthly 30% reserve is enforced by the paid monthly governor;
 * this is only the daily/pacing gate for account-wide provider observations.
 * Provider analytics lag; admission is never a physical atomic hard cap.
 */
const DAY_MS = 86_400_000;
const safe = n => Number.isSafeInteger(n) && n >= 0;
export function evaluateOwnerD1DailyEnvelope({
  observedRowsRead, observedRowsWritten, now=new Date(), policy
}={}) {
  const valid = now instanceof Date && Number.isFinite(now.getTime()) &&
    safe(observedRowsRead) && safe(observedRowsWritten) &&
    policy?.max_daily_reads===580_000_000 &&
    policy?.max_daily_writes===1_100_000 &&
    policy?.normal_daily_reads===580_000_000 &&
    policy?.normal_daily_writes===1_100_000 &&
    policy?.emergency_read_reserve_rows===0 &&
    policy?.emergency_write_reserve_rows===0 &&
    policy?.burn_rate_alert_per_hour_read===24_000_000 &&
    policy?.burn_rate_alert_per_hour_write===45_000 &&
    policy?.opening_burst_rows_read===4000 &&
    policy?.opening_burst_rows_written===2000 &&
    policy?.enforce_circuit_breaker===true &&
    policy?.provider_telemetry_is_delayed===true &&
    policy?.account_wide_atomic_hard_cap_guaranteed===false &&
    policy?.emergency_writes_auto_eligible===false;
  if (!valid) return Object.freeze({
    held:true,reason:"OWNER_D1_POLICY_OR_PROVIDER_COUNTER_UNVERIFIED",
    admission_is_global_atomic:false,
  });
  const day=now.toISOString().slice(0,10);
  const elapsed=Math.min(DAY_MS,Math.max(0,now.getTime()-Date.parse(day+"T00:00:00Z")));
  const pacedRead=Math.min(policy.normal_daily_reads,
    Math.floor(policy.burn_rate_alert_per_hour_read*elapsed/3_600_000+
       policy.opening_burst_rows_read));
  const pacedWrite=Math.min(policy.normal_daily_writes,
    Math.floor(policy.burn_rate_alert_per_hour_write*elapsed/3_600_000+
       policy.opening_burst_rows_written));
  const dailyHeld=observedRowsRead>=policy.normal_daily_reads ||
    observedRowsWritten>=policy.normal_daily_writes;
  const pacedHeld=observedRowsRead>=pacedRead || observedRowsWritten>=pacedWrite;
  return Object.freeze({
    schema:"geomacro.owner-d1-paid-utc-envelope.v2",day_utc:day,
    held:dailyHeld||pacedHeld,reason:dailyHeld?"OWNER_D1_PAID_DAILY_CEILING_HELD":
      pacedHeld?"OWNER_D1_PAID_HOURLY_PACING_HELD":"OWNER_D1_PAID_PACED_ADMISSION_READY",
    observed_rows_read:observedRowsRead,observed_rows_written:observedRowsWritten,
    paced_rows_read_ceiling:pacedRead,paced_rows_written_ceiling:pacedWrite,
    normal_daily_rows_read_ceiling:policy.normal_daily_reads,
    normal_daily_rows_written_ceiling:policy.normal_daily_writes,
    total_rows_read_ceiling:policy.max_daily_reads,
    total_rows_written_ceiling:policy.max_daily_writes,
    emergency_rows_read_reserve:0,emergency_rows_written_reserve:0,
    monthly_emergency_reserve_pct:30,
    emergency_reserve_automatic_access:false,emergency_writes_admitted:false,
    normal_rows_read_remaining:Math.max(0,pacedRead-observedRowsRead),
    normal_rows_written_remaining:Math.max(0,pacedWrite-observedRowsWritten),
    admission_is_global_atomic:false,quota_is_provider_observed_not_reserved:true,
  });
}
