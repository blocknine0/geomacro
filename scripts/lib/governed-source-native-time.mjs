/**
 * Governed statistical observations are source-native MEASUREMENTS.
 * They are not original published news, GROs, licensed commercial signals,
 * or observations of current 3-domain geopolitical/minerals risk.
 *
 * Only SOURCE-NATIVE timestamps enter observation data. The retrieval/run
 * clock may determine a bounded provider query window but cannot overwrite
 * the dataset's native measurement date.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
export const NOAA_END_LAG_DAYS = 2;
export const NOAA_LOOKBACK_DAYS = 14;

function requireValid(condition, reason) {
  if (!condition) throw new Error(reason);
}

export function noaaRollingNativeWindow({ now = new Date() } = {}) {
  const timestamp = now instanceof Date ? now.getTime() : Number.NaN;
  requireValid(Number.isFinite(timestamp),
    "GOVERNED_NOAA_WINDOW_CLOCK_INVALID");
  const midnightUTC = Date.UTC(now.getUTCFullYear(),
    now.getUTCMonth(), now.getUTCDate());
  const endMs = midnightUTC - NOAA_END_LAG_DAYS * DAY_MS;
  const startMs = endMs - NOAA_LOOKBACK_DAYS * DAY_MS;
  const day = value => new Date(value).toISOString().slice(0, 10);
  return {
    startdate: day(startMs),
    enddate: day(endMs),
    latest_source_native_date_is_not_published_at: true,
    lookback_days: NOAA_LOOKBACK_DAYS,
    availability_lag_days: NOAA_END_LAG_DAYS,
  };
}

export function sourceNativeMeasurementTime(value, sourceId, {
  now = new Date(),
} = {}) {
  const text = String(value ?? "").trim();
  requireValid(text.length > 0 &&
    /^\d{4}-\d{2}-\d{2}(?:T.*)?$/u.test(text),
    `GOVERNED_SOURCE_NATIVE_TIMESTAMP_INVALID:${sourceId}`);
  const observed = Date.parse(text);
  const clock = now instanceof Date ? now.getTime() : Number.NaN;
  requireValid(Number.isFinite(observed) && Number.isFinite(clock) &&
    observed <= clock + FUTURE_SKEW_MS,
    `GOVERNED_SOURCE_NATIVE_TIMESTAMP_INVALID:${sourceId}`);
  return new Date(observed).toISOString();
}

export function governedMetricCategory(sourceId, metric) {
  if (sourceId === "eia_api_v2" && metric === "electricity_retail_price") {
    // Colorado retail electricity price is an energy/economic statistic,
    // NOT a critical-minerals extraction, reserve, supply or trade event.
    return "MACRO";
  }
  if (sourceId === "noaa_ncei_cdo_api" &&
    /^noaa_[a-z0-9_]+$/u.test(metric)) {
    // A NOAA weather measurement is cross-domain CONTEXT, not a
    // geopolitical, FX, or mineral-risk event by itself.
    return "MULTI_DOMAIN";
  }
  throw new Error(`GOVERNED_SOURCE_DATASET_CATEGORY_NOT_CERTIFIED:${sourceId}:${metric}`);
}

export function governedSourceNativeSpan(rows, {
  sourceId, now = new Date(),
} = {}) {
  const clock = now instanceof Date ? now.getTime() : Number.NaN;
  requireValid(Number.isFinite(clock) && Array.isArray(rows) &&
    rows.length > 0 && rows.every(row =>
      row?.source_id === sourceId &&
      row.published_at === null &&
      row.commercial_eligibility_status === "UNVERIFIED" &&
      row.signal_type === "EXTERNAL_STATISTIC" &&
      row.category === governedMetricCategory(sourceId, row.metric)),
    "GOVERNED_SOURCE_MEASUREMENT_SPAN_INVALID");
  const times = rows.map(row =>
    Date.parse(sourceNativeMeasurementTime(row.observed_at, sourceId, {now})));
  const earliest = Math.min(...times);
  const latest = Math.max(...times);
  return {
    earliest_source_observed_at: new Date(earliest).toISOString(),
    latest_source_observed_at: new Date(latest).toISOString(),
    latest_native_observation_lag_days: Math.floor(Math.max(0,clock-latest)/DAY_MS),
    data_categories: [...new Set(rows.map(row => row.category))].sort(),
    publisher_article_published_at_verified: false,
    current_intelligence_available: false,
    current_commercial_signal_eligible: false,
    source_data_role: "historical_or_latest_native_statistical_measurements_only",
    // Recording an ingestion attempt does not refresh the measurement time.
    checked_at_is_not_source_observed_at: true,
  };
}
