import {
  buildObservation,
  createDb,
  loadCountryRegistry,
  sha256,
  upsertObservations,
} from "./lib-live-source-utils.mjs"

const SOURCE_ID = "eurostat_government_finance"
const DATASET = "gov_10q_ggdebt"
const API_BASE = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${DATASET}`
const WRITE = process.argv.includes("--write")
const MAX_AGE_DAYS = Number(process.env.EUROSTAT_FISCAL_MAX_AGE_DAYS ?? 550)
const AS_OF = new Date(process.env.EUROSTAT_FISCAL_AS_OF ?? Date.now())

const REQUIRED = Object.freeze({
  unit: "PC_GDP",
  sector: "S13",
  na_item: "GD",
})

const EUROSTAT_GEO_OVERRIDES = Object.freeze({
  EL: "GRC",
})

function orderedCategoryCodes(category) {
  const index = category?.index ?? {}
  if (Array.isArray(index)) return [...index]
  return Object.entries(index)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map(([key]) => key)
}

function periodEnd(period) {
  const match = /^(\d{4})-Q([1-4])$/.exec(String(period ?? ""))
  if (!match) return null
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) * 3, 0, 23, 59, 59, 999))
}

function daysBetween(a, b) {
  return Math.max(0, (a.getTime() - b.getTime()) / 86_400_000)
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Geomacro-Eurostat-Ingest/1.0 (+https://geomacro.live)",
    },
  })
  if (!response.ok) throw new Error(`Eurostat HTTP ${response.status}`)
  const payload = await response.json()
  if (payload?.error) throw new Error(`Eurostat API error: ${JSON.stringify(payload.error)}`)
  return payload
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
      `Eurostat write blocked: commercial_usage_status=${source.commercial_usage_status}`,
    )
  }
  if (source.enabled_for_ingestion !== true) {
    throw new Error("Eurostat write blocked: enabled_for_ingestion is not true")
  }
  if (source.enabled_for_commercial_signals !== false) {
    throw new Error(
      "Eurostat write blocked: commercial signals must remain disabled until harmonisation and census proof pass",
    )
  }
}

function decodeLatestByGeo(dataset) {
  const ids = dataset?.id
  const sizes = dataset?.size
  if (!Array.isArray(ids) || !Array.isArray(sizes) || ids.length !== sizes.length) {
    throw new Error("Eurostat JSON-stat response has invalid id/size arrays")
  }

  const geoDim = ids.indexOf("geo")
  const timeDim = ids.indexOf("time")
  if (geoDim < 0 || timeDim < 0) throw new Error("Eurostat response missing geo/time dimensions")

  const geoCodes = orderedCategoryCodes(dataset.dimension?.geo?.category)
  const timeCodes = orderedCategoryCodes(dataset.dimension?.time?.category)
  if (geoCodes.length !== sizes[geoDim] || timeCodes.length !== sizes[timeDim]) {
    throw new Error("Eurostat category dimensions do not match response sizes")
  }

  const strides = new Array(sizes.length).fill(1)
  for (let i = sizes.length - 2; i >= 0; i--) strides[i] = strides[i + 1] * sizes[i + 1]

  const latest = new Map()
  for (const [flatRaw, rawValue] of Object.entries(dataset.value ?? {})) {
    const value = Number(rawValue)
    const flat = Number(flatRaw)
    if (!Number.isFinite(value) || !Number.isInteger(flat) || flat < 0) continue

    const geoIndex = Math.floor(flat / strides[geoDim]) % sizes[geoDim]
    const timeIndex = Math.floor(flat / strides[timeDim]) % sizes[timeDim]
    const geo = geoCodes[geoIndex]
    const period = timeCodes[timeIndex]
    if (!geo || !period) continue

    const current = latest.get(geo)
    if (!current || period > current.period) latest.set(geo, { geo, period, value })
  }

  return [...latest.values()]
}

if (Number.isNaN(AS_OF.getTime())) throw new Error("Invalid EUROSTAT_FISCAL_AS_OF")
if (!Number.isFinite(MAX_AGE_DAYS) || MAX_AGE_DAYS <= 0) {
  throw new Error("EUROSTAT_FISCAL_MAX_AGE_DAYS must be positive")
}

const db = createDb()
const registry = await loadCountryRegistry(db)
const sourceRegistration = await loadSourceRegistration(db)
if (WRITE) assertWriteGovernance(sourceRegistration)

const params = new URLSearchParams({
  format: "JSON",
  lang: "en",
  unit: REQUIRED.unit,
  sector: REQUIRED.sector,
  na_item: REQUIRED.na_item,
  sinceTimePeriod: "2024-Q1",
})
const sourceUrl = `${API_BASE}?${params.toString()}`
const payload = await fetchJson(sourceUrl)
const latest = decodeLatestByGeo(payload)

const rowsDownloaded = latest.length
const observations = []
const unmapped = []
const stale = []

for (const row of latest) {
  if (!/^[A-Z]{2}$/.test(row.geo)) continue

  const iso3 = EUROSTAT_GEO_OVERRIDES[row.geo] ?? registry.byIso2.get(row.geo) ?? null
  if (!iso3 || !registry.byIso3.has(iso3)) {
    unmapped.push(row.geo)
    continue
  }

  const observed = periodEnd(row.period)
  if (!observed) {
    unmapped.push(row.geo)
    continue
  }

  const ageDays = daysBetween(AS_OF, observed)
  if (ageDays > MAX_AGE_DAYS) {
    stale.push({ geo: row.geo, iso3, period: row.period, age_days: Number(ageDays.toFixed(2)) })
    continue
  }

  observations.push(
    buildObservation({
      sourceId: SOURCE_ID,
      sourceRecordId: `${DATASET}:${row.geo}:${row.period}:${REQUIRED.unit}:${REQUIRED.sector}:${REQUIRED.na_item}`,
      category: "MACRO",
      countryIso3: iso3,
      observedAt: observed.toISOString(),
      publishedAt: null,
      metric: "general_government_gross_debt_pct_gdp",
      valueNumeric: row.value,
      unit: "percent_of_gdp",
      signalType: "official_quarterly_fiscal_stock",
      sourceUrl,
      provenance: {
        provider: "Eurostat",
        dataset_code: DATASET,
        geo_code: row.geo,
        time_period: row.period,
        unit_code: REQUIRED.unit,
        sector_code: REQUIRED.sector,
        national_accounts_item: REQUIRED.na_item,
        frequency: "quarterly_by_dataset_definition",
        source_contract: SOURCE_ID,
        rights_boundary: "European Commission reuse policy / Eurostat copyright notice; item-specific exceptions remain binding",
        raw_redistribution: false,
        methodology_boundary: "SOURCE_OBSERVATION_ONLY_NOT_YET_HARMONISED_WITH_WDI_CENTRAL_GOVERNMENT_DEBT",
      },
      rawPayload: {
        geo: row.geo,
        period: row.period,
        value: row.value,
        unit: REQUIRED.unit,
        sector: REQUIRED.sector,
        na_item: REQUIRED.na_item,
      },
      qualityStatus: "VERIFIED",
      commercialEligibilityStatus: "VERIFIED",
    }),
  )
}

if (observations.length === 0) throw new Error("Eurostat produced zero governed current observations")

const duplicateIso3 = observations
  .map((row) => row.country_iso3)
  .filter((iso3, index, all) => all.indexOf(iso3) !== index)
if (duplicateIso3.length) {
  throw new Error(`Eurostat produced duplicate country observations: ${[...new Set(duplicateIso3)].join(",")}`)
}

const observedTimes = observations.map((row) => new Date(row.observed_at).getTime())
const coverageStart = new Date(Math.min(...observedTimes)).toISOString()
const coverageEnd = new Date(Math.max(...observedTimes)).toISOString()
const periods = [...new Set(observations.map((row) => row.provenance.time_period))].sort()
const latestPeriod = periods.at(-1)
const retrievedAt = new Date().toISOString()

const manifestCore = {
  source_id: SOURCE_ID,
  release_id: `${DATASET}:${latestPeriod}`,
  dataset_version: `${DATASET}:${latestPeriod}`,
  retrieved_at: retrievedAt,
  coverage_start: coverageStart,
  coverage_end: coverageEnd,
  rows_downloaded: rowsDownloaded,
  rows_normalized: observations.length,
  verified_rows: observations.length,
  partial_rows: 0,
  rejected_rows: stale.length,
  unmapped_rows: unmapped.length,
  write_completed: WRITE,
  metadata: {
    dataset_code: DATASET,
    metric: "general_government_gross_debt_pct_gdp",
    current_observation_count: observations.length,
    source_geo_rows: rowsDownloaded,
    unmapped_geo_codes: [...new Set(unmapped)].sort(),
    stale_rows: stale,
    period_distribution: Object.fromEntries(
      periods.map((period) => [period, observations.filter((row) => row.provenance.time_period === period).length]),
    ),
    max_age_days: MAX_AGE_DAYS,
    direct_merge_with_world_bank_central_government_debt_allowed: false,
    risk_gate_signal_activation: false,
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
  metric: "general_government_gross_debt_pct_gdp",
  current_country_observations: observations.length,
  stale_rows: stale.length,
  unmapped_geo_codes: [...new Set(unmapped)].sort(),
  periods,
  observations_attempted: attempted,
  source_registry: {
    commercial_usage_status: sourceRegistration.commercial_usage_status,
    enabled_for_ingestion: sourceRegistration.enabled_for_ingestion,
    enabled_for_commercial_signals: sourceRegistration.enabled_for_commercial_signals,
  },
  direct_merge_with_world_bank_central_government_debt_allowed: false,
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
    ? "PASS: EUROSTAT GOVERNMENT DEBT GOVERNED OBSERVATIONS + RELEASE MANIFEST WRITTEN"
    : "PASS: EUROSTAT GOVERNMENT DEBT DRY RUN CLEAN; DATABASE UNCHANGED",
)
