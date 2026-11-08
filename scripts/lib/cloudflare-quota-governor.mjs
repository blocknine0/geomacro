/**
 * GeoMacro account-wide multi-resource Workers Paid quota policy.
 *
 * Accounting units matter:
 * - D1: PHYSICAL rows read/written, never SQL-call counts.
 * - R2: Class A / B operations, not records in a 50-record batch.
 * - Workers KV: charged keys, not bulk API request counts.
 *
 * This module makes deterministic admission decisions from verified usage.
 * A delayed provider snapshot alone is NOT an atomic account-wide spending
 * ceiling. Production callers must serially reserve their upper-bound costs
 * in the shared Durable Object BEFORE provider work, then reconcile actual
 * provider telemetry. Unknown or stale telemetry is never treated as zero.
 */
export const EMERGENCY_RESERVE_PERCENT = 30;

export const RESOURCE_LIMITS = Object.freeze({
  d1_rows_written: Object.freeze({
    included_monthly: 50_000_000, operational_monthly: 35_000_000,
    emergency_monthly: 15_000_000, daily: 1_100_000, hourly: 45_000,
    provider: "CLOUDFLARE_D1_GRAPHQL",
  }),
  d1_rows_read: Object.freeze({
    included_monthly: 25_000_000_000, operational_monthly: 17_500_000_000,
    emergency_monthly: 7_500_000_000, daily: 580_000_000, hourly: 24_000_000,
    provider: "CLOUDFLARE_D1_GRAPHQL",
  }),
  r2_class_a: Object.freeze({
    included_monthly: 1_000_000, operational_monthly: 700_000,
    emergency_monthly: 300_000, daily: 25_000, hourly: 1_000,
    provider: "CLOUDFLARE_R2_ACCOUNT_ANALYTICS",
  }),
  r2_class_b: Object.freeze({
    included_monthly: 10_000_000, operational_monthly: 7_000_000,
    emergency_monthly: 3_000_000, daily: 250_000, hourly: 10_000,
    provider: "CLOUDFLARE_R2_ACCOUNT_ANALYTICS",
  }),
  kv_writes: Object.freeze({
    included_monthly: 1_000_000, operational_monthly: 700_000,
    emergency_monthly: 300_000, daily: 25_000, hourly: 1_000,
    provider: "CLOUDFLARE_KV_ACCOUNT_ANALYTICS",
  }),
  kv_reads: Object.freeze({
    included_monthly: 10_000_000, operational_monthly: 7_000_000,
    emergency_monthly: 3_000_000, daily: 250_000, hourly: 10_000,
    provider: "CLOUDFLARE_KV_ACCOUNT_ANALYTICS",
  }),
});

export const QUOTA_WARN_PERCENT = 70;
export const QUOTA_THROTTLE_PERCENT = 85;
export const QUOTA_FREEZE_PERCENT = 100;
const MAX_AGE_MS = 120_000;
const VALID_LANES = new Set(["background", "migration", "shadow", "hot50", "customer_api"]);
const ESSENTIAL_LANES = new Set(["hot50", "customer_api"]);
const safe = value => Number.isSafeInteger(value) && value >= 0;
const percentage = (used, ceiling) => 100 * used / ceiling;
const fail = code => { throw Error("CLOUDFLARE_QUOTA_" + code); };
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** Exact included allocations, never silently lower/raise a user's ceiling. */
export function verifyQuotaPolicy(limits = RESOURCE_LIMITS) {
  const expected = {
    d1_rows_written: [50_000_000, 1_100_000, 45_000],
    d1_rows_read: [25_000_000_000, 580_000_000, 24_000_000],
    r2_class_a: [1_000_000, 25_000, 1_000],
    r2_class_b: [10_000_000, 250_000, 10_000],
    kv_writes: [1_000_000, 25_000, 1_000],
    kv_reads: [10_000_000, 250_000, 10_000],
  };
  if (Object.keys(limits ?? {}).length !== Object.keys(expected).length)
    fail("RESOURCE_KEYS_INVALID");
  for (const [name, [included, daily, hourly]] of Object.entries(expected)) {
    const r = limits[name];
    if (!r || r.included_monthly !== included ||
        r.operational_monthly !== Math.floor(included * 0.7) ||
        r.emergency_monthly !== included - Math.floor(included * 0.7) ||
        r.daily !== daily || r.hourly !== hourly)
      fail("POLICY_INVALID_" + name.toUpperCase());
  }
  return true;
}

/**
 * Usage input must be a genuinely provider-verified, account-wide snapshot:
 * {
 *  account_id, observed_at, day_utc, hour_utc, billing_cycle_id,
 *  provider_verified:true, metrics:{
 *    d1_rows_written:{month:n,day:n,hour:n,source:"CLOUDFLARE_D1_GRAPHQL"},
 *    ...all six metrics...
 *  }
 * }
 * If provider reporting cannot return complete hourly/cycle aggregates, HOLD
 * fee-bearing jobs. Never fabricate an hourly counter from daily totals.
 */
export function verifyQuotaSnapshot(snapshot, now = new Date()) {
  verifyQuotaPolicy();
  const moment = now instanceof Date ? now.getTime() : NaN;
  const observed = Date.parse(snapshot?.observed_at ?? "");
  const day = now instanceof Date && Number.isFinite(moment) ?
    now.toISOString().slice(0, 10) : "";
  const hour = now instanceof Date && Number.isFinite(moment) ?
    now.toISOString().slice(0, 13) : "";
  if (!Number.isFinite(moment) ||
      !/^[a-f0-9]{32}$/i.test(snapshot?.account_id ?? "") ||
      snapshot?.provider_verified !== true ||
      snapshot?.day_utc !== day || snapshot?.hour_utc !== hour ||
      typeof snapshot?.billing_cycle_id !== "string" ||
      !/^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/.test(snapshot.billing_cycle_id) ||
      !Number.isFinite(observed) || observed > moment ||
      moment - observed > MAX_AGE_MS ||
      !snapshot.metrics || typeof snapshot.metrics !== "object")
    fail("ACCOUNT_PROVIDER_SNAPSHOT_STALE_OR_UNVERIFIED");
  for (const [name, limit] of Object.entries(RESOURCE_LIMITS)) {
    if (!hasOwn(snapshot.metrics, name)) fail("RESOURCE_TELEMETRY_MISSING");
    const r = snapshot.metrics[name];
    if (!r || r.source !== limit.provider ||
        !safe(r.month) || !safe(r.day) || !safe(r.hour) ||
        r.hour > r.day || r.day > r.month)
      fail("PROVIDER_RESOURCE_COUNTER_INVALID_" + name.toUpperCase());
  }
  return snapshot;
}

/** Cost is a *reserved upper bound* on all six metrics, not a best guess. */
export function assessCloudflareQuota({snapshot, costs, lane, now = new Date(),
  approvedEmergency = false} = {}) {
  if (!VALID_LANES.has(lane)) fail("LANE_INVALID");
  verifyQuotaSnapshot(snapshot, now);
  if (!costs || typeof costs !== "object" ||
      Object.keys(costs).some(name => !hasOwn(RESOURCE_LIMITS, name)) ||
      Object.entries(RESOURCE_LIMITS).some(([name]) =>
        !hasOwn(costs, name) || !safe(costs[name])))
    fail("RESERVATION_COSTS_MISSING");
  const rows = {};
  let peak = 0, projectedPeak = 0, overOperational = false;
  let overIncluded = false, noHeadroom = false;
  for (const [name, limit] of Object.entries(RESOURCE_LIMITS)) {
    const measured = snapshot.metrics[name], cost = costs[name];
    const observed = {
      monthly: percentage(measured.month, limit.operational_monthly),
      daily: percentage(measured.day, limit.daily),
      hourly: percentage(measured.hour, limit.hourly),
    };
    const projected = {
      monthly: percentage(measured.month + cost, limit.operational_monthly),
      daily: percentage(measured.day + cost, limit.daily),
      hourly: percentage(measured.hour + cost, limit.hourly),
    };
    peak = Math.max(peak, ...Object.values(observed));
    projectedPeak = Math.max(projectedPeak, ...Object.values(projected));
    overOperational ||= Object.values(projected).some(p => p > 100) ||
      Object.values(observed).some(p => p >= 100 && cost > 0);
    overIncluded ||= measured.month + cost > limit.included_monthly;
    noHeadroom ||= measured.day + cost > limit.daily ||
      measured.hour + cost > limit.hourly;
    rows[name] = {
      observed: {...measured},
      requested: cost, operational_monthly: limit.operational_monthly,
      emergency_monthly: limit.emergency_monthly,
      daily: limit.daily, hourly: limit.hourly,
      pressure_pct: Math.max(...Object.values(observed)),
      projected_pressure_pct: Math.max(...Object.values(projected)),
    };
  }
  const isEssential = ESSENTIAL_LANES.has(lane);
  const emergencyEligible = isEssential && approvedEmergency === true;
  // The emergency reserve cannot override the owner-set daily or hourly cap.
  // Only an explicitly authorized essential lane may draw on the monthly
  // reserved 30%, and never above Cloudflare's included monthly allowance.
  const admitted = !overIncluded && !noHeadroom &&
    (emergencyEligible || !overOperational) &&
    (isEssential || peak < QUOTA_THROTTLE_PERCENT) &&
    (isEssential || projectedPeak < QUOTA_THROTTLE_PERCENT);
  let state = "NORMAL";
  if (peak >= QUOTA_FREEZE_PERCENT) state = "OPERATIONAL_FREEZE";
  else if (peak >= QUOTA_THROTTLE_PERCENT) state = "BACKGROUND_THROTTLE";
  else if (peak >= QUOTA_WARN_PERCENT) state = "PROACTIVE_WARNING";
  return Object.freeze({
    schema: "geomacro.cloudflare-paid-quota-governor.v1",
    status: admitted ? "ADMIT" : "HOLD",
    reason: admitted ? "ACCOUNT_WIDE_UPPER_BOUND_ADMITTED" :
      overIncluded ? "MONTHLY_INCLUDED_ALLOWANCE_EXHAUSTED" :
      noHeadroom ? "DAILY_OR_HOURLY_CAP_EXCEEDED" :
      overOperational && !emergencyEligible ? "OPERATIONAL_RESERVE_PROTECTED" :
      "BACKGROUND_THROTTLED",
    state, lane, alert_webhook_required: peak >= QUOTA_WARN_PERCENT,
    throttle_background: peak >= QUOTA_THROTTLE_PERCENT,
    freeze_nonessential: peak >= QUOTA_FREEZE_PERCENT,
    peak_observed_percent: peak, peak_projected_percent: projectedPeak,
    emergency_reserve_percent: EMERGENCY_RESERVE_PERCENT,
    reserved_emergency_spend_approved: emergencyEligible,
    account_wide_atomic_hard_cap_guaranteed: false,
    provider_analytics_delayed: true,
    require_serialized_shared_reservation_before_work: true,
    do_not_pause_existing_customer_or_hot50_service: true,
    metrics: rows,
  });
}

/**
 * Notification is deliberately best-effort; failure must not grant admission.
 * Never include bearer tokens, secrets, identities or raw provider responses.
 */
export async function sendQuotaWarning(decision, {webhookUrl, fetchImpl = fetch} = {}) {
  if (!decision?.alert_webhook_required) return {attempted: false};
  if (typeof webhookUrl !== "string" || !/^https:\/\//.test(webhookUrl))
    return {attempted: false, reason: "WARNING_WEBHOOK_NOT_CONFIGURED"};
  try {
    const response = await fetchImpl(webhookUrl, {
      method: "POST", redirect: "error", cache: "no-store",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({schema: decision.schema,
        state: decision.state, peak_observed_percent: decision.peak_observed_percent,
        throttle_background: decision.throttle_background,
        freeze_nonessential: decision.freeze_nonessential}),
      signal: AbortSignal.timeout(10_000),
    });
    return {attempted: true, delivered: response.status >= 200 &&
      response.status < 300 && !response.redirected};
  } catch {
    return {attempted: true, delivered: false};
  }
}
