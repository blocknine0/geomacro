import {
  buildObservation,
  createDb,
  sha256,
  upsertObservations,
} from "./lib-live-source-utils.mjs"

const SOURCE_ID = "usgs_earthquake_hazards"
const FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
const WRITE = process.argv.includes("--write")
const MAX_FEED_AGE_MINUTES = Number(process.env.USGS_MAX_FEED_AGE_MINUTES ?? 20)
const MAX_EVENT_AGE_HOURS = Number(process.env.USGS_MAX_EVENT_AGE_HOURS ?? 30)
const NOW = new Date(process.env.USGS_AS_OF ?? Date.now())

function isoFromEpochMs(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  const date = new Date(numeric)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function ageMinutes(older, newer) {
  return Math.max(0, (newer.getTime() - older.getTime()) / 60_000)
}

async function fetchWithRetry(url) {
  let lastError = null
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/geo+json, application/json",
          "user-agent": "Geomacro-USGS-Hazard-Ingest/1.0 (+https://geomacro.live)",
        },
      })
      if (response.ok) return response
      lastError = new Error(`USGS HTTP ${response.status}`)
      if (response.status < 500 && response.status !== 429) throw lastError
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt === 4) throw lastError
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)))
  }
  throw lastError ?? new Error("USGS request failed")
}

async function loadSourceRegistration(db) {
  const result = await db
    .from("live_external_sources")
    .select("source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,licence_name")
    .eq("source_id", SOURCE_ID)
    .maybeSingle()

  if (result.error) throw result.error
  if (!result.data) throw new Error(`Source registration not found: ${SOURCE_ID}`)
  return result.data
}

function assertWriteGovernance(source) {
  if (source.commercial_usage_status !== "COMMERCIAL_OK") {
    throw new Error(
      `USGS write blocked: commercial_usage_status=${source.commercial_usage_status}`,
    )
  }
  if (source.enabled_for_ingestion !== true) {
    throw new Error("USGS write blocked: enabled_for_ingestion is not true")
  }
  if (source.enabled_for_commercial_signals !== false) {
    throw new Error(
      "USGS write blocked: commercial signals must remain disabled until country mapping and hazard methodology pass",
    )
  }
}

if (Number.isNaN(NOW.getTime())) throw new Error("Invalid USGS_AS_OF")
if (!Number.isFinite(MAX_FEED_AGE_MINUTES) || MAX_FEED_AGE_MINUTES <= 0) {
  throw new Error("USGS_MAX_FEED_AGE_MINUTES must be positive")
}
if (!Number.isFinite(MAX_EVENT_AGE_HOURS) || MAX_EVENT_AGE_HOURS <= 0) {
  throw new Error("USGS_MAX_EVENT_AGE_HOURS must be positive")
}

const db = createDb()
const sourceRegistration = await loadSourceRegistration(db)
if (WRITE) assertWriteGovernance(sourceRegistration)

const response = await fetchWithRetry(FEED_URL)
const payload = await response.json()
if (payload?.type !== "FeatureCollection" || !Array.isArray(payload?.features)) {
  throw new Error("USGS GeoJSON feed is not a FeatureCollection")
}

const generatedIso = isoFromEpochMs(payload?.metadata?.generated)
if (!generatedIso) throw new Error("USGS feed metadata.generated is missing or invalid")
const generatedAt = new Date(generatedIso)
const feedAgeMinutes = ageMinutes(generatedAt, NOW)
if (feedAgeMinutes > MAX_FEED_AGE_MINUTES) {
  throw new Error(
    `USGS feed is stale: generated ${feedAgeMinutes.toFixed(2)} minutes ago`,
  )
}

const observations = []
const rejected = []
let nonEarthquakeRows = 0

for (const feature of payload.features) {
  const properties = feature?.properties ?? {}
  if (properties.type !== "earthquake") {
    nonEarthquakeRows++
    continue
  }

  const id = String(feature?.id ?? "").trim()
  const coordinates = feature?.geometry?.coordinates
  const longitude = Number(coordinates?.[0])
  const latitude = Number(coordinates?.[1])
  const depthKm = Number(coordinates?.[2])
  const magnitude = Number(properties.mag)
  const observedAt = isoFromEpochMs(properties.time)
  const updatedAt = isoFromEpochMs(properties.updated)

  if (
    !id ||
    feature?.geometry?.type !== "Point" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(depthKm) ||
    !Number.isFinite(magnitude) ||
    !observedAt ||
    !updatedAt
  ) {
    rejected.push({ id: id || null, reason: "INVALID_CORE_FIELDS" })
    continue
  }

  const eventAgeHours = ageMinutes(new Date(observedAt), NOW) / 60
  if (eventAgeHours > MAX_EVENT_AGE_HOURS) {
    rejected.push({ id, reason: "EVENT_OUTSIDE_CURRENT_WINDOW", age_hours: Number(eventAgeHours.toFixed(2)) })
    continue
  }

  observations.push(
    buildObservation({
      sourceId: SOURCE_ID,
      sourceRecordId: id,
      category: "MULTI_DOMAIN",
      countryIso3: null,
      observedAt,
      publishedAt: updatedAt,
      metric: "earthquake_magnitude",
      valueNumeric: magnitude,
      valueText: properties.place ? String(properties.place) : null,
      unit: String(properties.magType ?? "magnitude_scale"),
      eventType: "earthquake",
      signalType: "real_time_hazard_observation",
      sourceUrl: properties.url ? String(properties.url) : FEED_URL,
      provenance: {
        provider: "USGS Earthquake Hazards Program",
        feed: "all_day.geojson",
        feed_generated_at: generatedIso,
        longitude,
        latitude,
        depth_km: depthKm,
        significance: Number.isFinite(Number(properties.sig)) ? Number(properties.sig) : null,
        tsunami_flag: Number(properties.tsunami) === 1,
        alert_level: properties.alert ?? null,
        event_status: properties.status ?? null,
        network: properties.net ?? null,
        location_source: properties.locationSource ?? null,
        magnitude_source: properties.magSource ?? null,
        country_attribution_status: "NOT_ASSIGNED_COORDINATE_ONLY",
        country_mapping_boundary: "No ISO3 is assigned until a governed point-in-country method and boundary dataset are versioned and proven.",
        risk_gate_signal_activation: false,
        raw_redistribution: false,
      },
      rawPayload: {
        id,
        properties: {
          mag: magnitude,
          magType: properties.magType ?? null,
          place: properties.place ?? null,
          time: properties.time,
          updated: properties.updated,
          alert: properties.alert ?? null,
          tsunami: properties.tsunami ?? null,
          sig: properties.sig ?? null,
          status: properties.status ?? null,
          type: properties.type,
          net: properties.net ?? null,
          locationSource: properties.locationSource ?? null,
          magSource: properties.magSource ?? null,
        },
        geometry: {
          type: "Point",
          coordinates: [longitude, latitude, depthKm],
        },
      },
      qualityStatus: "VERIFIED",
      commercialEligibilityStatus: "VERIFIED",
    }),
  )
}

if (observations.length === 0) {
  throw new Error("USGS current feed produced zero governed earthquake observations")
}

const eventIds = observations.map((row) => row.source_record_id)
const duplicateIds = eventIds.filter((id, index, all) => all.indexOf(id) !== index)
if (duplicateIds.length) {
  throw new Error(`USGS feed contains duplicate earthquake ids: ${[...new Set(duplicateIds)].join(",")}`)
}

const observedTimes = observations.map((row) => new Date(row.observed_at).getTime())
const coverageStart = new Date(Math.min(...observedTimes)).toISOString()
const coverageEnd = new Date(Math.max(...observedTimes)).toISOString()
const releaseId = `usgs-all-day:${String(payload.metadata.generated)}`
const retrievedAt = new Date().toISOString()

const manifestCore = {
  source_id: SOURCE_ID,
  release_id: releaseId,
  dataset_version: "USGS_GEOJSON_SUMMARY_ALL_DAY_V1",
  retrieved_at: retrievedAt,
  coverage_start: coverageStart,
  coverage_end: coverageEnd,
  rows_downloaded: payload.features.length,
  rows_normalized: observations.length,
  verified_rows: observations.length,
  partial_rows: 0,
  rejected_rows: rejected.length + nonEarthquakeRows,
  unmapped_rows: observations.length,
  write_completed: WRITE,
  metadata: {
    feed_url: FEED_URL,
    feed_generated_at: generatedIso,
    feed_age_minutes: Number(feedAgeMinutes.toFixed(2)),
    feature_count: payload.features.length,
    earthquake_observation_count: observations.length,
    non_earthquake_rows: nonEarthquakeRows,
    invalid_or_stale_rows: rejected,
    country_mapped_rows: 0,
    country_unmapped_rows: observations.length,
    country_attribution_status: "COORDINATE_ONLY_NOT_COUNTRY_MAPPED",
    scoring_activation: false,
    methodology_status: "RAW_GOVERNED_HAZARD_OBSERVATIONS_ONLY",
    raw_redistribution: false,
    source_registry: {
      commercial_usage_status: sourceRegistration.commercial_usage_status,
      enabled_for_ingestion: sourceRegistration.enabled_for_ingestion,
      enabled_for_commercial_signals: sourceRegistration.enabled_for_commercial_signals,
    },
  },
}
const manifest = { ...manifestCore, manifest_hash: sha256(manifestCore) }

let attempted = 0
if (WRITE) {
  attempted = await upsertObservations(db, observations)
  const result = await db
    .from("live_source_release_manifests")
    .upsert(manifest, { onConflict: "source_id,release_id" })
  if (result.error) throw result.error
}

console.log(JSON.stringify({
  source_id: SOURCE_ID,
  mode: WRITE ? "WRITE" : "DRY_RUN",
  feed_generated_at: generatedIso,
  feed_age_minutes: Number(feedAgeMinutes.toFixed(2)),
  source_feature_count: payload.features.length,
  earthquake_observations: observations.length,
  country_mapped_rows: 0,
  country_unmapped_rows: observations.length,
  rejected_rows: rejected.length + nonEarthquakeRows,
  observations_attempted: attempted,
  source_registry: {
    commercial_usage_status: sourceRegistration.commercial_usage_status,
    enabled_for_ingestion: sourceRegistration.enabled_for_ingestion,
    enabled_for_commercial_signals: sourceRegistration.enabled_for_commercial_signals,
  },
  risk_gate_signal_activation: false,
  manifest: {
    release_id: manifest.release_id,
    coverage_start: manifest.coverage_start,
    coverage_end: manifest.coverage_end,
    manifest_hash: manifest.manifest_hash,
    write_completed: WRITE,
  },
}, null, 2))

console.log(
  WRITE
    ? "PASS: USGS EARTHQUAKE GOVERNED OBSERVATIONS + RELEASE MANIFEST WRITTEN"
    : "PASS: USGS EARTHQUAKE DRY RUN CLEAN; DATABASE UNCHANGED",
)
