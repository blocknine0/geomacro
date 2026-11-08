/**
 * Owner UTC D1 admission envelope. One SELECT can read many physical rows;
 * neither db.batch nor KV read-modify-write can enforce a billed-row cap.
 * Provider daily sums are delayed, not atomic reservations. This protects
 * shared-plan consumers and canary preflights, never claims global coverage.
 */
const DAY_MS=86_400_000;
export function evaluateOwnerD1DailyEnvelope({
 observedRowsRead,observedRowsWritten,now=new Date(),policy
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
   !Number.isSafeInteger(observedRowsRead)||observedRowsRead<0||
   !Number.isSafeInteger(observedRowsWritten)||observedRowsWritten<0||
   policy?.max_daily_reads!==140000||policy?.max_daily_writes!==140000||
   policy?.enforce_circuit_breaker!==true||
   policy?.burn_rate_alert_per_hour!==5000||
   policy?.normal_daily_reads!==120000||
   policy?.normal_daily_writes!==120000||
   policy?.emergency_read_reserve_rows!==20000||
   policy?.emergency_write_reserve_rows!==20000||
   policy.normal_daily_reads+policy.emergency_read_reserve_rows!==policy.max_daily_reads||
   policy.normal_daily_writes+policy.emergency_write_reserve_rows!==policy.max_daily_writes||
   policy?.opening_burst_rows_read!==4000||
   policy?.opening_burst_rows_written!==2000||
   policy?.provider_telemetry_is_delayed!==true||
   policy?.account_wide_atomic_hard_cap_guaranteed!==false||
   policy?.emergency_writes_auto_eligible!==false)
  return Object.freeze({held:true,reason:"OWNER_D1_POLICY_OR_PROVIDER_COUNTER_UNVERIFIED",
   admission_is_global_atomic:false});
 const utcDay=now.toISOString().slice(0,10);
 const elapsed=Math.min(DAY_MS,Math.max(0,now.getTime()-Date.parse(utcDay+"T00:00:00.000Z")));
 const rate=policy.burn_rate_alert_per_hour;
 const readCap=Math.min(policy.normal_daily_reads-4000,
  Math.floor(rate*elapsed/3_600_000+policy.opening_burst_rows_read));
 const writeCap=Math.min(policy.normal_daily_writes-2000,
  Math.floor(rate*elapsed/3_600_000+policy.opening_burst_rows_written));
 const dailyHeld=observedRowsRead+4000>=policy.normal_daily_reads||
  observedRowsWritten+2000>=policy.normal_daily_writes;
 const burnHeld=observedRowsRead>=readCap||observedRowsWritten>=writeCap;
 return Object.freeze({
  schema:"geomacro.owner-d1-140k-utc-envelope.v1",
  day_utc:utcDay,
  held:dailyHeld||burnHeld,
  reason:dailyHeld?"OWNER_D1_120K_NORMAL_CEILING_HELD":
   burnHeld?"OWNER_D1_HOURLY_BURN_RATE_HELD":"OWNER_D1_PACED_ADMISSION_READY",
  observed_rows_read:observedRowsRead,
  observed_rows_written:observedRowsWritten,
  paced_rows_read_ceiling:readCap,
  paced_rows_written_ceiling:writeCap,
  normal_daily_rows_read_ceiling:policy.normal_daily_reads,
  normal_daily_rows_written_ceiling:policy.normal_daily_writes,
  total_rows_read_ceiling:policy.max_daily_reads,
  total_rows_written_ceiling:policy.max_daily_writes,
  emergency_rows_read_reserve:policy.emergency_read_reserve_rows,
  emergency_rows_written_reserve:policy.emergency_write_reserve_rows,
  emergency_reserve_automatic_access:false,
  normal_rows_read_remaining:Math.max(0,readCap-observedRowsRead),
  normal_rows_written_remaining:Math.max(0,writeCap-observedRowsWritten),
  emergency_writes_admitted:false,
  admission_is_global_atomic:false,
  quota_is_provider_observed_not_reserved:true,
 });
}
