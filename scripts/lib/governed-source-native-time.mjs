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
/**
 * NOAA CDO /data defaults to the first 25 returned records, which sampled
 * only the OLDEST 2026-09-24 measurements in a Sep 24-Oct 8 window.
 * Query exactly one native DATE at a time, newest-first; 4 bounded attempts
 * at most and ZERO B2 requests until both EIA+NOAA batches qualify.
 * Dates are provider measurement days, never original article published_at.
 */
export const NOAA_NATIVE_DAY_SAMPLE_OFFSETS = Object.freeze([2, 5, 9, 14]);


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

export function noaaLatestNativeDayCandidates({now=new Date()}={}) {
  const window=noaaRollingNativeWindow({now});
  const midnight=Date.UTC(now.getUTCFullYear(),
    now.getUTCMonth(),now.getUTCDate());
  const dates=NOAA_NATIVE_DAY_SAMPLE_OFFSETS.map(offset=>
    new Date(midnight-offset*DAY_MS).toISOString().slice(0,10));
  requireValid(dates.length===4 &&
    new Set(dates).size===dates.length &&
    dates.every((date,i)=>
      date>=window.startdate && date<=window.enddate &&
      (i===0 || date<dates[i-1])),
    "GOVERNED_NOAA_BOUNDED_DAY_SELECTION_INVALID");
  return dates;
}

/** Require the provider to return only records for the exact requested date.
 * An empty day means not yet available, NOT a new signal or a zero reading. */
export function validateNoaaNativeDailyRows(rows,day) {
  requireValid(typeof day==="string" &&
    /^\d{4}-\d{2}-\d{2}$/u.test(day) &&
    Number.isFinite(Date.parse(day)) &&
    Array.isArray(rows) && rows.length<=25,
    "GOVERNED_NOAA_DAY_RESPONSE_INVALID");
  if(!rows.length)return [];
  requireValid(rows.every(row=>
    row && typeof row==="object" &&
    typeof row.date==="string" &&
    row.date.slice(0,10)===day &&
    Number.isFinite(Date.parse(row.date)) &&
    new Date(Date.parse(row.date)).toISOString().slice(0,10)===day &&
    typeof row.station==="string" &&
    row.station.length>=4 && row.station.length<=128 &&
    typeof row.datatype==="string" &&
    /^[A-Z0-9]{2,12}$/u.test(row.datatype) &&
    row.value!==null && row.value!==undefined &&
    (typeof row.value==="number" || typeof row.value==="string") &&
    String(row.value).trim()!=="" &&
    Number.isFinite(Number(row.value))),
    "GOVERNED_NOAA_NATIVE_DAY_PROVENANCE_INVALID");
  return rows;
}

/**
 * Pure-provider adapter (explicit injectable fetch): never a B2 operation.
 * Exactly one native observation-day per NOAA CDO query. Stop at the most
 * recent available day; if no day is reported, fail closed BEFORE B2 PUT.
 * HTTP 401/403/429/5xx and wrong MIME/data contracts are not retried into
 * a misleading "current" statistical measurement.
 */
export async function fetchNoaaLatestNativeDayRows({
  now=new Date(),
  token,
  fetchImpl=fetch,
}={}) {
  requireValid(typeof token==="string" && token.trim().length>0 &&
    typeof fetchImpl==="function",
    "GOVERNED_NOAA_CREDENTIAL_OR_FETCH_INVALID");
  const dates=noaaLatestNativeDayCandidates({now});
  let attempts=0;
  for(const day of dates) {
    attempts+=1;
    const params=new URLSearchParams({
      datasetid:"GHCND",locationid:"FIPS:US",
      startdate:day,enddate:day,limit:"25",
    });
    const url=`https://www.ncei.noaa.gov/cdo-web/api/v2/data?${params}`;
    const response=await fetchImpl(url,{
      headers:{token},signal:AbortSignal.timeout(30_000),
    });
    if(!response?.ok) {
      const status=Number(response?.status);
      throw new Error(
        Number.isInteger(status) && status>=100 && status<=599
          ? `NOAA_NCEI_HTTP_${status}` : "NOAA_NCEI_TRANSPORT_INVALID");
    }
    let body;
    try {body=await response.json();}
    catch {throw new Error("GOVERNED_NOAA_PROVIDER_JSON_INVALID");}
    requireValid(body && typeof body==="object" &&
      !Array.isArray(body) &&
      (body.results===undefined || Array.isArray(body.results)),
      "GOVERNED_NOAA_PROVIDER_ROWS_INVALID");
    const rows=validateNoaaNativeDailyRows(body.results??[],day);
    if(rows.length) {
      return {rows,source_native_day:day,provider_http_requests:attempts,
        publisher_article_published_at_verified:false,
        current_intelligence_available:false,
        commercial_eligible:false};
    }
  }
  throw new Error("NOAA_NCEI_NO_RECENT_NATIVE_DAY_ROWS");
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
    // Date.parse may silently normalize February 30 -> March 2. That is
    // not a valid native provider measurement day and must never be accepted.
    new Date(observed).toISOString().slice(0,10) === text.slice(0,10) &&
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
