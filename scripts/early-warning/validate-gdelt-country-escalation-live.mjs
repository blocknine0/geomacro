import { createClient } from "@supabase/supabase-js";

import { buildGdeltCountryEscalationFeatures } from "./gdelt-country-escalation-core.mjs";

const SOURCE_ID = "gdelt_v2_events";
const PAGE_SIZE = 1000;
const MAX_ROWS = Number(process.env.GDELT_CALIBRATION_MAX_ROWS ?? 20_000);
const MAX_FRESHNESS_MINUTES = Number(
  process.env.GDELT_CALIBRATION_MAX_FRESHNESS_MINUTES ?? 90,
);

function requireEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function requirePositiveNumber(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive`);
  }
  return value;
}

requirePositiveInteger(MAX_ROWS, "GDELT_CALIBRATION_MAX_ROWS");
requirePositiveNumber(MAX_FRESHNESS_MINUTES, "GDELT_CALIBRATION_MAX_FRESHNESS_MINUTES");

const asOf = new Date(process.env.GDELT_CALIBRATION_AS_OF ?? Date.now());
if (!Number.isFinite(asOf.getTime())) throw new Error("GDELT_CALIBRATION_AS_OF is invalid");
const start = new Date(asOf.getTime() - 2 * 60 * 60 * 1000);

const db = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sourceResult = await db
  .from("live_external_sources")
  .select("source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals")
  .eq("source_id", SOURCE_ID)
  .maybeSingle();

if (sourceResult.error) throw sourceResult.error;
if (!sourceResult.data) throw new Error(`Missing source registry row: ${SOURCE_ID}`);
if (sourceResult.data.commercial_usage_status !== "COMMERCIAL_OK") {
  throw new Error(`Unexpected GDELT commercial status: ${sourceResult.data.commercial_usage_status}`);
}
if (sourceResult.data.enabled_for_ingestion !== true) {
  throw new Error("GDELT governed ingestion is not enabled");
}
if (sourceResult.data.enabled_for_commercial_signals !== false) {
  throw new Error("GDELT commercial-signal activation must remain false during calibration");
}

const latestResult = await db
  .from("live_external_observations")
  .select("observed_at,source_record_id")
  .eq("source_id", SOURCE_ID)
  .eq("quality_status", "VERIFIED")
  .eq("commercial_eligibility_status", "VERIFIED")
  .not("observed_at", "is", null)
  .order("observed_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (latestResult.error) throw latestResult.error;
if (!latestResult.data?.observed_at) {
  throw new Error("No verified GDELT observations exist in production");
}

const latestAvailableMs = new Date(latestResult.data.observed_at).getTime();
if (!Number.isFinite(latestAvailableMs)) {
  throw new Error(`Latest GDELT observed_at is invalid: ${latestResult.data.observed_at}`);
}
const latestAvailableFreshnessMinutes = Math.max(
  0,
  (asOf.getTime() - latestAvailableMs) / 60_000,
);

if (latestAvailableFreshnessMinutes > MAX_FRESHNESS_MINUTES) {
  throw new Error(
    `GDELT production ingestion is stale: latest verified observation ${new Date(latestAvailableMs).toISOString()} is ${latestAvailableFreshnessMinutes.toFixed(2)} minutes old (limit ${MAX_FRESHNESS_MINUTES})`,
  );
}

const observations = [];
for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
  const result = await db
    .from("live_external_observations")
    .select("source_record_id,country_iso3,observed_at,value_numeric,provenance,quality_status,commercial_eligibility_status")
    .eq("source_id", SOURCE_ID)
    .gte("observed_at", start.toISOString())
    .lte("observed_at", asOf.toISOString())
    .eq("quality_status", "VERIFIED")
    .eq("commercial_eligibility_status", "VERIFIED")
    .order("observed_at", { ascending: true })
    .range(offset, Math.min(offset + PAGE_SIZE - 1, MAX_ROWS - 1));

  if (result.error) throw result.error;
  const rows = result.data ?? [];
  observations.push(...rows);
  if (rows.length < PAGE_SIZE) break;
  if (observations.length >= MAX_ROWS) {
    throw new Error(
      `GDELT calibration window reached safety cap (${MAX_ROWS}); increase cap deliberately after reviewing volume`,
    );
  }
}

if (observations.length === 0) {
  throw new Error(
    `No verified GDELT observations found between ${start.toISOString()} and ${asOf.toISOString()} despite latest verified row at ${new Date(latestAvailableMs).toISOString()}`,
  );
}

const latestWindowMs = Math.max(
  ...observations.map((row) => new Date(row.observed_at).getTime()).filter(Number.isFinite),
);
if (!Number.isFinite(latestWindowMs)) throw new Error("GDELT observations have no valid timestamps");
const freshnessMinutes = Math.max(0, (asOf.getTime() - latestWindowMs) / 60_000);
if (freshnessMinutes > MAX_FRESHNESS_MINUTES) {
  throw new Error(
    `GDELT calibration window is stale: ${freshnessMinutes.toFixed(2)} minutes old`,
  );
}

const features = buildGdeltCountryEscalationFeatures({
  as_of_utc: asOf.toISOString(),
  observations,
});
if (features.length === 0) throw new Error("GDELT feature extractor returned no country features");
if (
  features.some(
    (row) =>
      row.research_only !== true ||
      row.commercial_signal_activation !== false ||
      row.public_alert_activation !== false ||
      "cews_score" in row ||
      "status" in row,
  )
) {
  throw new Error("GDELT calibration output crossed the research-only product boundary");
}

const top = features.slice(0, 20).map((row) => ({
  country_iso3: row.country_iso3,
  current_15m_events: row.windows.current_15m.event_count,
  current_60m_events: row.windows.current_60m.event_count,
  prior_60m_events: row.windows.prior_60m.event_count,
  event_count_delta_60m: row.deltas.event_count_delta_60m,
  negative_intensity_delta_60m: row.deltas.negative_intensity_delta_60m,
  freshness_seconds: row.freshness_seconds,
}));

console.log(
  JSON.stringify(
    {
      source_id: SOURCE_ID,
      mode: "READ_ONLY_RESEARCH_CALIBRATION",
      as_of_utc: asOf.toISOString(),
      window_start_utc: start.toISOString(),
      source_registry: {
        commercial_usage_status: sourceResult.data.commercial_usage_status,
        enabled_for_ingestion: sourceResult.data.enabled_for_ingestion,
        enabled_for_commercial_signals: sourceResult.data.enabled_for_commercial_signals,
      },
      latest_verified_observation_utc: new Date(latestAvailableMs).toISOString(),
      verified_observations_read: observations.length,
      countries_with_features: features.length,
      latest_observation_freshness_minutes: Number(freshnessMinutes.toFixed(2)),
      research_only: true,
      commercial_signal_activation: false,
      public_alert_activation: false,
      database_write: false,
      top_escalation_features: top,
    },
    null,
    2,
  ),
);

console.log("PASS: GDELT COUNTRY ESCALATION LIVE READ-ONLY CALIBRATION; NO ALERT OR COMMERCIAL ACTIVATION");
