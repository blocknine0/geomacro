import {
  buildObservation,
  countryIso3FromName,
  createDb,
  loadCountryRegistry,
  normalizeIso3,
  parseCsv,
  upsertObservations,
} from "./lib-live-source-utils.mjs"

// Current UCDP Candidate data for the main product database.
// Finalized 2020+ history stays in geomacro-historical-data.
//
// The official download transport is deliberately used for the bulk monthly
// sync so the authenticated API's 5,000-request daily allowance is preserved
// for validation and targeted queries. UCDP documents both transports as the
// same dataset family.

const SOURCE_ID = "ucdp_candidate"
const VERSION = (process.env.UCDP_CANDIDATE_VERSION ?? "26.0.7").trim()
const MAX_UNMAPPED_ROWS = Number(process.env.UCDP_MAX_UNMAPPED_ROWS ?? "0")
const WRITE = process.argv.includes("--write")

// UCDP uses Gleditsch-Ward country identifiers. Keep source-specific aliases
// explicit and narrow instead of weakening the shared country-name resolver.
// These mappings are used only when the resulting ISO3 exists in the enabled
// live country registry.
const UCDP_GW_COUNTRY_ID_TO_ISO3 = Object.freeze({
  "490": "COD", // DR Congo (Zaire)
  "640": "TUR", // Turkey
  "775": "MMR", // Myanmar (Burma)
})

if (!/^\d{2}\.0\.\d{1,2}$/.test(VERSION)) {
  throw new Error("UCDP_CANDIDATE_VERSION must look like 26.0.7")
}
if (!Number.isInteger(MAX_UNMAPPED_ROWS) || MAX_UNMAPPED_ROWS < 0) {
  throw new Error("UCDP_MAX_UNMAPPED_ROWS must be non-negative")
}

const [releaseYearShort, , releaseMonthRaw] = VERSION.split(".")
const releaseYear = 2000 + Number(releaseYearShort)
const releaseMonth = Number(releaseMonthRaw)
if (releaseMonth < 1 || releaseMonth > 12) {
  throw new Error(`Invalid UCDP Candidate release month: ${VERSION}`)
}

const releaseRank = releaseYear * 100 + releaseMonth
const versionPath = VERSION.replaceAll(".", "_")
const sourceUrl =
  `https://ucdp.uu.se/downloads/candidateged/GEDEvent_v${versionPath}.csv`
const retrievedAt = new Date().toISOString()

const db = createDb()
const registry = await loadCountryRegistry(db)

function parseDeathField(value) {
  const text = String(value ?? "").trim()
  if (!text) return { value: null, invalid: false }
  const numeric = Number(text)
  const invalid = !Number.isFinite(numeric) || numeric < 0 || !Number.isInteger(numeric)
  return { value: invalid ? null : numeric, invalid }
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function isoDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function ucdpOfficialCountryIso3(value) {
  const official = String(value ?? "").replace(/\s+/g, " ").trim()
  if (!official) return null

  const exact = countryIso3FromName(official, registry)
  if (exact) return exact

  // UCDP retains historical/legacy labels in trailing parentheses, for example
  // "Myanmar (Burma)" and "Yemen (North Yemen)". Mirror the governed historical
  // importer: retry only the same official location label with that trailing
  // qualifier removed. Actor names are never used for country inference.
  const withoutTrailingParenthetical = official.replace(/\s*\([^)]*\)\s*$/, "").trim()
  if (!withoutTrailingParenthetical || withoutTrailingParenthetical === official) {
    return null
  }

  return countryIso3FromName(withoutTrailingParenthetical, registry)
}

function eventIso3(row) {
  for (const value of [row?.country_iso3, row?.isocc, row?.iso3]) {
    const direct = normalizeIso3(value)
    if (direct && registry.byIso3.has(direct)) return direct
  }

  const countryId = String(row?.country_id ?? "").trim()
  const mappedFromCountryId = UCDP_GW_COUNTRY_ID_TO_ISO3[countryId] ?? null
  if (mappedFromCountryId && registry.byIso3.has(mappedFromCountryId)) {
    return mappedFromCountryId
  }

  return ucdpOfficialCountryIso3(row?.country)
}

console.log("===== UCDP CANDIDATE CURRENT EVIDENCE INGESTION =====")
console.log({
  source_id: SOURCE_ID,
  dataset_version: VERSION,
  release_rank: releaseRank,
  transport: "OFFICIAL_DOWNLOAD_CSV",
  mode: WRITE ? "WRITE" : "DRY_RUN",
})

const response = await fetch(sourceUrl, {
  headers: {
    Accept: "text/csv,text/plain,*/*",
    "User-Agent": "Geomacro/1.0 (+https://geomacro.live)",
  },
})

if (!response.ok) {
  throw new Error(`UCDP Candidate download failed: ${response.status}`)
}

const rows = parseCsv(await response.text())
if (!rows.length) {
  throw new Error("UCDP Candidate download returned zero rows")
}

const observations = []
const rejected = []
const seenIds = new Set()
const intervalAnomalyRows = []
const componentSumAnomalyRows = []

for (const row of rows) {
  const eventId = String(row?.id ?? "").trim()
  const countryIso3 = eventIso3(row)
  const observedAt = isoDate(row?.date_end)
  const startAt = isoDate(row?.date_start)

  if (!eventId) {
    rejected.push({ reason: "missing_source_record_id" })
    continue
  }
  if (seenIds.has(eventId)) {
    rejected.push({ reason: "duplicate_event_id_in_release", source_record_id: eventId })
    continue
  }
  seenIds.add(eventId)

  if (!countryIso3) {
    rejected.push({
      reason: "country_unmapped_or_invalid",
      source_record_id: eventId,
      country: row?.country ?? null,
      country_id: row?.country_id ?? null,
    })
    continue
  }

  if (!observedAt || !startAt || new Date(startAt) > new Date(observedAt)) {
    rejected.push({ reason: "invalid_event_date", source_record_id: eventId })
    continue
  }

  const deathFields = {
    best: parseDeathField(row?.best),
    low: parseDeathField(row?.low),
    high: parseDeathField(row?.high),
    deaths_a: parseDeathField(row?.deaths_a),
    deaths_b: parseDeathField(row?.deaths_b),
    deaths_civilians: parseDeathField(row?.deaths_civilians),
    deaths_unknown: parseDeathField(row?.deaths_unknown),
  }

  const invalidDeathField = Object.entries(deathFields).find(([, parsed]) => parsed.invalid)
  if (invalidDeathField) {
    rejected.push({
      reason: "invalid_fatality_value",
      source_record_id: eventId,
      field: invalidDeathField[0],
    })
    continue
  }

  const best = deathFields.best.value
  const low = deathFields.low.value
  const high = deathFields.high.value
  if (best === null) {
    rejected.push({ reason: "missing_or_invalid_best_deaths", source_record_id: eventId })
    continue
  }

  // Candidate is intentionally provisional. UCDP documents low, best and high
  // as separate source-derived estimates and flags uncertain death coding via
  // code_status. Do not rewrite or discard an official best estimate merely
  // because the current monthly low/best/high ordering is temporarily
  // inconsistent. Preserve the raw bounds, downgrade the row to PARTIAL, and
  // keep it outside VERIFIED-only risk consumers until UCDP revises it.
  const fatalityIntervalConsistent =
    (low === null || low <= best) &&
    (high === null || best <= high) &&
    (low === null || high === null || low <= high)

  const components = [
    deathFields.deaths_a.value,
    deathFields.deaths_b.value,
    deathFields.deaths_civilians.value,
    deathFields.deaths_unknown.value,
  ]
  const allComponentsPresent = components.every((value) => value !== null)
  const bestComponentSumConsistent = allComponentsPresent
    ? components.reduce((sum, value) => sum + value, 0) === best
    : null

  const codeStatus = String(row?.code_status ?? "").trim()
  const candidateQualityReasons = []
  if (codeStatus.toLowerCase() !== "clear") {
    candidateQualityReasons.push("CODE_STATUS_NOT_CLEAR")
  }
  if (!fatalityIntervalConsistent) {
    candidateQualityReasons.push("FATALITY_INTERVAL_NOT_ORDERED")
    intervalAnomalyRows.push({
      source_record_id: eventId,
      code_status: codeStatus || null,
      low,
      best,
      high,
    })
  }
  if (bestComponentSumConsistent === false) {
    candidateQualityReasons.push("BEST_COMPONENT_SUM_MISMATCH")
    componentSumAnomalyRows.push({
      source_record_id: eventId,
      code_status: codeStatus || null,
      best,
      component_sum: components.reduce((sum, value) => sum + value, 0),
    })
  }

  const qualityStatus = candidateQualityReasons.length === 0 ? "VERIFIED" : "PARTIAL"
  const commercialEligibilityStatus =
    qualityStatus === "VERIFIED" ? "VERIFIED" : "UNVERIFIED"

  observations.push(
    buildObservation({
      sourceId: SOURCE_ID,
      sourceRecordId: eventId,
      category: "GEOPOLITICS",
      countryIso3,
      observedAt,
      publishedAt: null,
      metric: "conflict_event_best_estimate_deaths",
      valueNumeric: best,
      unit: "deaths",
      eventType: "organized_violence_candidate_event",
      signalType: "conflict_exposure",
      sourceUrl,
      provenance: {
        dataset: "UCDP Candidate Events Dataset",
        dataset_version: VERSION,
        release_year: releaseYear,
        release_month: releaseMonth,
        release_rank: releaseRank,
        transport: "OFFICIAL_DOWNLOAD_CSV",
        licence: "CC BY 4.0",
        retrieved_at: retrievedAt,
        ucdp_event_id: eventId,
        conflict_id: row?.conflict_new_id || null,
        dyad_id: row?.dyad_new_id || null,
        type_of_violence: row?.type_of_violence || null,
        code_status: codeStatus || null,
        date_start: startAt,
        date_end: observedAt,
        deaths_best: best,
        deaths_low: low,
        deaths_high: high,
        deaths_a: deathFields.deaths_a.value,
        deaths_b: deathFields.deaths_b.value,
        deaths_civilians: deathFields.deaths_civilians.value,
        deaths_unknown: deathFields.deaths_unknown.value,
        fatality_interval_consistent: fatalityIntervalConsistent,
        best_component_sum_consistent: bestComponentSumConsistent,
        candidate_quality_reasons: candidateQualityReasons,
        latitude: numberOrNull(row?.latitude),
        longitude: numberOrNull(row?.longitude),
        country_id_gw: row?.country_id || null,
        official_country: row?.country || null,
        methodology_status: "EVIDENCE_ONLY_NOT_IN_GRO_V02",
        candidate_status: "PROVISIONAL_UNTIL_FINAL_ANNUAL_GED",
      },
      rawPayload: row,
      qualityStatus,
      commercialEligibilityStatus,
    }),
  )
}

const unmapped = rejected.filter((item) => item.reason === "country_unmapped_or_invalid")
const otherRejected = rejected.length - unmapped.length

if (unmapped.length > MAX_UNMAPPED_ROWS) {
  console.error("UNMAPPED SAMPLE", unmapped.slice(0, 25))
  throw new Error(
    `Country mapping rejected ${unmapped.length} rows, above allowance ${MAX_UNMAPPED_ROWS}; no database write performed`,
  )
}

if (otherRejected > 0) {
  console.error("REJECTED SAMPLE", rejected.slice(0, 25))
  throw new Error(`${otherRejected} UCDP rows failed structural validation; no database write performed`)
}

if (intervalAnomalyRows.length) {
  console.warn("UCDP PROVISIONAL FATALITY INTERVAL SAMPLE", intervalAnomalyRows.slice(0, 25))
}
if (componentSumAnomalyRows.length) {
  console.warn("UCDP PROVISIONAL COMPONENT SUM SAMPLE", componentSumAnomalyRows.slice(0, 25))
}

const attempted = WRITE ? await upsertObservations(db, observations) : 0

console.log({
  source_id: SOURCE_ID,
  dataset_version: VERSION,
  download_rows: rows.length,
  normalized_observations: observations.length,
  verified_quality_rows: observations.filter((row) => row.quality_status === "VERIFIED").length,
  partial_quality_rows: observations.filter((row) => row.quality_status === "PARTIAL").length,
  interval_anomaly_rows: intervalAnomalyRows.length,
  component_sum_anomaly_rows: componentSumAnomalyRows.length,
  rejected_rows: rejected.length,
  observations_attempted: attempted,
  write_enabled: WRITE,
})

console.log(
  WRITE
    ? "PASS: UCDP CANDIDATE CURRENT EVIDENCE INGESTION CLEAN"
    : "PASS: UCDP CANDIDATE DRY RUN CLEAN; DATABASE UNCHANGED",
)
