import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildObservation,
  countryIso3FromName,
  createDb,
  loadCountryRegistry,
  sha256,
  upsertObservations,
} from "./lib-live-source-utils.mjs"

const SOURCE_ID = "gdelt_v2_events"
const LAST_UPDATE_URL = "https://data.gdeltproject.org/gdeltv2/lastupdate.txt"
const FIPS_LOOKUP_URL = "https://www.gdeltproject.org/data/lookups/FIPS.country.txt"
const WRITE = process.argv.includes("--write")
const MAX_BATCH_AGE_MINUTES = Number(process.env.GDELT_MAX_BATCH_AGE_MINUTES ?? 60)
const NOW = new Date(process.env.GDELT_AS_OF ?? Date.now())
const EXPECTED_COLUMN_COUNT = 61
const FILTER_CONTRACT_VERSION = "gdelt-conflict-root-filter-v1"
const CONFLICT_ROOT_CODES = new Set(["13", "14", "15", "16", "17", "18", "19", "20"])

// GDELT V2 Event export positions from the Event Codebook. Schema guards below
// require the full 61-column export before any row can become an observation.
const FIELD = Object.freeze({
  GLOBAL_EVENT_ID: 0,
  SQLDATE: 1,
  EVENT_CODE: 26,
  EVENT_BASE_CODE: 27,
  EVENT_ROOT_CODE: 28,
  QUAD_CLASS: 29,
  GOLDSTEIN_SCALE: 30,
  NUM_MENTIONS: 31,
  NUM_SOURCES: 32,
  NUM_ARTICLES: 33,
  AVG_TONE: 34,
  ACTION_GEO_TYPE: 51,
  ACTION_GEO_FULL_NAME: 52,
  ACTION_GEO_COUNTRY_CODE: 53,
  ACTION_GEO_ADM1_CODE: 54,
  ACTION_GEO_ADM2_CODE: 55,
  ACTION_GEO_LAT: 56,
  ACTION_GEO_LONG: 57,
  ACTION_GEO_FEATURE_ID: 58,
  DATE_ADDED: 59,
  SOURCE_URL: 60,
})

const FIPS_NAME_ALIASES = Object.freeze({
  "Bahamas, The": ["Bahamas"],
  "Bosnia-Herzegovina": ["Bosnia and Herzegovina"],
  "Cape Verde": ["Cabo Verde"],
  "Congo": ["Republic of the Congo", "Congo"],
  "Democratic Republic of the Congo": ["Democratic Republic of the Congo", "Congo, Dem. Rep."],
  "Cote dIvoire": ["Cote d'Ivoire", "Côte d'Ivoire"],
  "Czech Republic": ["Czechia", "Czech Republic"],
  "East Timor": ["Timor-Leste"],
  "Gambia": ["Gambia", "The Gambia"],
  "Laos": ["Laos", "Lao PDR", "Lao People's Democratic Republic"],
  "Macedonia": ["North Macedonia", "Macedonia"],
  "Micronesia": ["Micronesia", "Micronesia, Fed. Sts."],
  "North Korea": ["North Korea", "Korea, Dem. People's Rep."],
  "South Korea": ["South Korea", "Korea, Rep."],
  "Swaziland": ["Eswatini", "Swaziland"],
  "Turkey": ["Türkiye", "Turkey"],
  "Vatican City": ["Holy See", "Vatican City"],
  "Vietnam, Democratic Republic of": ["Vietnam"],
})

function parseDateAdded(value) {
  const text = String(value ?? "").trim()
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(text)
  if (!match) return null
  const date = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  ))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function ageMinutes(olderIso, newer) {
  return Math.max(0, (newer.getTime() - new Date(olderIso).getTime()) / 60_000)
}

async function fetchWithRetry(url, accept) {
  let lastError = null
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          accept,
          "user-agent": "Geomacro-GDELT-Event-Ingest/1.0 (+https://geomacro.live)",
        },
      })
      if (response.ok) return response
      lastError = new Error(`GDELT HTTP ${response.status} for ${url}`)
      if (response.status < 500 && response.status !== 429) throw lastError
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt === 4) throw lastError
    }
    await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** (attempt - 1)))
  }
  throw lastError ?? new Error("GDELT request failed")
}

function parseLastUpdate(text) {
  const rows = String(text)
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 3)
    .map(([size, md5, url]) => ({ size: Number(size), md5: String(md5).toLowerCase(), url }))

  const exportRow = rows.find((row) => row.url.endsWith(".export.CSV.zip"))
  if (!exportRow) throw new Error("GDELT lastupdate.txt has no Event export ZIP")
  if (!Number.isInteger(exportRow.size) || exportRow.size <= 0) {
    throw new Error("GDELT export size is invalid")
  }
  if (!/^[0-9a-f]{32}$/.test(exportRow.md5)) {
    throw new Error("GDELT export MD5 is invalid")
  }

  const listedUrl = new URL(exportRow.url)
  if (
    !["http:", "https:"].includes(listedUrl.protocol) ||
    listedUrl.hostname !== "data.gdeltproject.org" ||
    !/^\/gdeltv2\/\d{14}\.export\.CSV\.zip$/.test(listedUrl.pathname)
  ) {
    throw new Error(`Unexpected GDELT export URL: ${exportRow.url}`)
  }

  // The official list still emits legacy HTTP URLs. Validate the exact official
  // host/path first, then upgrade the transport rather than following HTTP.
  const secureUrl = `https://data.gdeltproject.org${listedUrl.pathname}`
  const timestamp = /\/(\d{14})\.export\.CSV\.zip$/.exec(listedUrl.pathname)?.[1] ?? null
  const batchIso = timestamp ? parseDateAdded(timestamp) : null
  if (!batchIso) throw new Error("GDELT export filename has invalid batch timestamp")

  return {
    ...exportRow,
    listed_url: exportRow.url,
    url: secureUrl,
    batchIso,
  }
}

function parseFipsLookup(text) {
  const map = new Map()
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue
    const [codeRaw, ...nameParts] = line.split("\t")
    const code = String(codeRaw ?? "").trim().toUpperCase()
    const name = nameParts.join("\t").trim()
    if (!/^[A-Z]{2}$/.test(code) || !name) continue
    map.set(code, name)
  }
  if (map.size < 200) throw new Error(`GDELT FIPS lookup unexpectedly small: ${map.size}`)
  return map
}

function mapFipsToIso3(fipsCode, fipsLookup, registry) {
  const code = String(fipsCode ?? "").trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return { iso3: null, sourceName: null, reason: "MISSING_OR_INVALID_FIPS" }
  const sourceName = fipsLookup.get(code) ?? null
  if (!sourceName) return { iso3: null, sourceName: null, reason: "FIPS_NOT_IN_OFFICIAL_LOOKUP" }

  const candidates = [sourceName, ...(FIPS_NAME_ALIASES[sourceName] ?? [])]
  for (const candidate of candidates) {
    const iso3 = countryIso3FromName(candidate, registry)
    if (iso3 && registry.byIso3.has(iso3)) return { iso3, sourceName, reason: null }
  }
  return { iso3: null, sourceName, reason: "OFFICIAL_FIPS_NAME_NOT_IN_CANONICAL_COUNTRY_REGISTRY" }
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
    throw new Error(`GDELT write blocked: commercial_usage_status=${source.commercial_usage_status}`)
  }
  if (source.enabled_for_ingestion !== true) {
    throw new Error("GDELT write blocked: enabled_for_ingestion is not true")
  }
  if (source.enabled_for_commercial_signals !== false) {
    throw new Error("GDELT write blocked: commercial signals must remain disabled until overlay methodology and census proof pass")
  }
}

function unzipUtf8(zipBuffer) {
  const tempDir = mkdtempSync(join(tmpdir(), "geomacro-gdelt-"))
  const zipPath = join(tempDir, "batch.zip")
  try {
    writeFileSync(zipPath, zipBuffer)
    return execFileSync("unzip", ["-p", zipPath], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    })
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

if (Number.isNaN(NOW.getTime())) throw new Error("Invalid GDELT_AS_OF")
if (!Number.isFinite(MAX_BATCH_AGE_MINUTES) || MAX_BATCH_AGE_MINUTES <= 0) {
  throw new Error("GDELT_MAX_BATCH_AGE_MINUTES must be positive")
}

const db = createDb()
const registry = await loadCountryRegistry(db)
const sourceRegistration = await loadSourceRegistration(db)
if (WRITE) assertWriteGovernance(sourceRegistration)

const lastUpdateResponse = await fetchWithRetry(LAST_UPDATE_URL, "text/plain")
const lastUpdateText = await lastUpdateResponse.text()
const exportMeta = parseLastUpdate(lastUpdateText)
const batchAgeMinutes = ageMinutes(exportMeta.batchIso, NOW)
if (batchAgeMinutes > MAX_BATCH_AGE_MINUTES) {
  throw new Error(`GDELT Event batch is stale: ${batchAgeMinutes.toFixed(2)} minutes old`)
}

const fipsResponse = await fetchWithRetry(FIPS_LOOKUP_URL, "text/plain")
const fipsText = await fipsResponse.text()
const fipsLookup = parseFipsLookup(fipsText)
const fipsLookupHash = createHash("sha256").update(fipsText, "utf8").digest("hex")

const exportResponse = await fetchWithRetry(exportMeta.url, "application/zip, application/octet-stream")
const zipBuffer = Buffer.from(await exportResponse.arrayBuffer())
if (zipBuffer.length !== exportMeta.size) {
  throw new Error(`GDELT export size mismatch: expected ${exportMeta.size}, received ${zipBuffer.length}`)
}
const exportMd5 = createHash("md5").update(zipBuffer).digest("hex")
if (exportMd5 !== exportMeta.md5) {
  throw new Error(`GDELT export MD5 mismatch: expected ${exportMeta.md5}, received ${exportMd5}`)
}

const exportText = unzipUtf8(zipBuffer)
const lines = exportText.split(/\r?\n/).filter((line) => line.length > 0)
if (lines.length === 0) throw new Error("GDELT Event export is empty")

const observations = []
const malformed = []
const unmapped = []
let filteredOut = 0
let relevantRows = 0

for (let rowIndex = 0; rowIndex < lines.length; rowIndex++) {
  const fields = lines[rowIndex].split("\t")
  if (fields.length !== EXPECTED_COLUMN_COUNT) {
    malformed.push({ row_index: rowIndex, reason: "UNEXPECTED_COLUMN_COUNT", column_count: fields.length })
    continue
  }

  const globalEventId = String(fields[FIELD.GLOBAL_EVENT_ID] ?? "").trim()
  const eventRootCode = String(fields[FIELD.EVENT_ROOT_CODE] ?? "").trim()
  const dateAdded = parseDateAdded(fields[FIELD.DATE_ADDED])
  const sourceUrl = String(fields[FIELD.SOURCE_URL] ?? "").trim()

  if (!/^\d+$/.test(globalEventId) || !/^\d{2}$/.test(eventRootCode) || !dateAdded || !/^https?:\/\//i.test(sourceUrl)) {
    malformed.push({ row_index: rowIndex, global_event_id: globalEventId || null, reason: "INVALID_SCHEMA_SENTINELS" })
    continue
  }

  if (!CONFLICT_ROOT_CODES.has(eventRootCode)) {
    filteredOut++
    continue
  }
  relevantRows++

  const goldstein = Number(fields[FIELD.GOLDSTEIN_SCALE])
  const avgTone = Number(fields[FIELD.AVG_TONE])
  const latitude = Number(fields[FIELD.ACTION_GEO_LAT])
  const longitude = Number(fields[FIELD.ACTION_GEO_LONG])
  if (!Number.isFinite(goldstein)) {
    malformed.push({ row_index: rowIndex, global_event_id: globalEventId, reason: "INVALID_GOLDSTEIN_SCALE" })
    continue
  }

  const fipsCode = String(fields[FIELD.ACTION_GEO_COUNTRY_CODE] ?? "").trim().toUpperCase()
  const mapped = mapFipsToIso3(fipsCode, fipsLookup, registry)
  if (!mapped.iso3) {
    unmapped.push({
      global_event_id: globalEventId,
      fips_code: fipsCode || null,
      fips_name: mapped.sourceName,
      reason: mapped.reason,
    })
    continue
  }

  observations.push(
    buildObservation({
      sourceId: SOURCE_ID,
      sourceRecordId: globalEventId,
      category: "GEOPOLITICS",
      countryIso3: mapped.iso3,
      observedAt: dateAdded,
      publishedAt: null,
      metric: "gdelt_event_goldstein_scale",
      valueNumeric: goldstein,
      valueText: String(fields[FIELD.ACTION_GEO_FULL_NAME] ?? "").trim() || null,
      unit: "goldstein_scale",
      eventType: String(fields[FIELD.EVENT_CODE] ?? "").trim() || eventRootCode,
      signalType: "news_derived_conflict_event_metadata",
      sourceUrl,
      provenance: {
        provider: "GDELT Project",
        dataset: "GDELT 2.0 Event Database",
        batch_timestamp: exportMeta.batchIso,
        listed_export_url: exportMeta.listed_url,
        secure_export_url: exportMeta.url,
        transport_upgrade: exportMeta.listed_url !== exportMeta.url,
        filter_contract_version: FILTER_CONTRACT_VERSION,
        included_event_root_codes: [...CONFLICT_ROOT_CODES],
        event_code: String(fields[FIELD.EVENT_CODE] ?? "").trim(),
        event_base_code: String(fields[FIELD.EVENT_BASE_CODE] ?? "").trim(),
        event_root_code: eventRootCode,
        quad_class: Number(fields[FIELD.QUAD_CLASS]),
        goldstein_scale: goldstein,
        avg_tone: Number.isFinite(avgTone) ? avgTone : null,
        num_mentions: Number(fields[FIELD.NUM_MENTIONS]),
        num_sources: Number(fields[FIELD.NUM_SOURCES]),
        num_articles: Number(fields[FIELD.NUM_ARTICLES]),
        action_geo_type: Number(fields[FIELD.ACTION_GEO_TYPE]),
        action_geo_full_name: String(fields[FIELD.ACTION_GEO_FULL_NAME] ?? "").trim() || null,
        action_geo_fips_country_code: fipsCode,
        action_geo_fips_country_name: mapped.sourceName,
        action_geo_adm1_code: String(fields[FIELD.ACTION_GEO_ADM1_CODE] ?? "").trim() || null,
        action_geo_adm2_code: String(fields[FIELD.ACTION_GEO_ADM2_CODE] ?? "").trim() || null,
        action_geo_latitude: Number.isFinite(latitude) ? latitude : null,
        action_geo_longitude: Number.isFinite(longitude) ? longitude : null,
        action_geo_feature_id: String(fields[FIELD.ACTION_GEO_FEATURE_ID] ?? "").trim() || null,
        sqldate: String(fields[FIELD.SQLDATE] ?? "").trim(),
        date_added: String(fields[FIELD.DATE_ADDED] ?? "").trim(),
        country_mapping_method: "OFFICIAL_GDELT_FIPS_LOOKUP_TO_CANONICAL_COUNTRY_REGISTRY",
        fips_lookup_sha256: fipsLookupHash,
        evidence_boundary: "GDELT news-derived event metadata is a freshness/evidence overlay and does not replace authoritative conflict datasets such as UCDP.",
        risk_gate_signal_activation: false,
        raw_publisher_text_stored: false,
      },
      rawPayload: {
        global_event_id: globalEventId,
        sqldate: String(fields[FIELD.SQLDATE] ?? "").trim(),
        event_code: String(fields[FIELD.EVENT_CODE] ?? "").trim(),
        event_base_code: String(fields[FIELD.EVENT_BASE_CODE] ?? "").trim(),
        event_root_code: eventRootCode,
        quad_class: String(fields[FIELD.QUAD_CLASS] ?? "").trim(),
        goldstein_scale: String(fields[FIELD.GOLDSTEIN_SCALE] ?? "").trim(),
        num_mentions: String(fields[FIELD.NUM_MENTIONS] ?? "").trim(),
        num_sources: String(fields[FIELD.NUM_SOURCES] ?? "").trim(),
        num_articles: String(fields[FIELD.NUM_ARTICLES] ?? "").trim(),
        avg_tone: String(fields[FIELD.AVG_TONE] ?? "").trim(),
        action_geo: {
          type: String(fields[FIELD.ACTION_GEO_TYPE] ?? "").trim(),
          full_name: String(fields[FIELD.ACTION_GEO_FULL_NAME] ?? "").trim(),
          country_fips: fipsCode,
          adm1: String(fields[FIELD.ACTION_GEO_ADM1_CODE] ?? "").trim(),
          adm2: String(fields[FIELD.ACTION_GEO_ADM2_CODE] ?? "").trim(),
          latitude: String(fields[FIELD.ACTION_GEO_LAT] ?? "").trim(),
          longitude: String(fields[FIELD.ACTION_GEO_LONG] ?? "").trim(),
          feature_id: String(fields[FIELD.ACTION_GEO_FEATURE_ID] ?? "").trim(),
        },
        date_added: String(fields[FIELD.DATE_ADDED] ?? "").trim(),
        source_url: sourceUrl,
      },
      qualityStatus: "VERIFIED",
      commercialEligibilityStatus: "VERIFIED",
    }),
  )
}

if (malformed.length > Math.max(5, Math.floor(lines.length * 0.01))) {
  throw new Error(`GDELT schema validation rejected too many rows: ${malformed.length}/${lines.length}`)
}

const duplicateIds = observations
  .map((row) => row.source_record_id)
  .filter((id, index, all) => all.indexOf(id) !== index)
if (duplicateIds.length) {
  throw new Error(`GDELT current batch produced duplicate event ids: ${[...new Set(duplicateIds)].slice(0, 20).join(",")}`)
}

const observedTimes = observations
  .map((row) => new Date(row.observed_at).getTime())
  .filter(Number.isFinite)
const coverageStart = observedTimes.length ? new Date(Math.min(...observedTimes)).toISOString() : exportMeta.batchIso
const coverageEnd = observedTimes.length ? new Date(Math.max(...observedTimes)).toISOString() : exportMeta.batchIso
const releaseTimestamp = /\/(\d{14})\.export\.CSV\.zip$/.exec(new URL(exportMeta.url).pathname)?.[1]
const retrievedAt = new Date().toISOString()

const unmappedByCode = {}
for (const item of unmapped) {
  const key = item.fips_code || "<missing>"
  unmappedByCode[key] = (unmappedByCode[key] ?? 0) + 1
}

const manifestCore = {
  source_id: SOURCE_ID,
  release_id: `gdelt-v2-event:${releaseTimestamp}`,
  dataset_version: `GDELT_V2_EVENT:${releaseTimestamp}`,
  retrieved_at: retrievedAt,
  coverage_start: coverageStart,
  coverage_end: coverageEnd,
  rows_downloaded: lines.length,
  rows_normalized: observations.length,
  verified_rows: observations.length,
  partial_rows: unmapped.length,
  rejected_rows: malformed.length,
  unmapped_rows: unmapped.length,
  write_completed: WRITE,
  metadata: {
    last_update_url: LAST_UPDATE_URL,
    listed_export_url: exportMeta.listed_url,
    secure_export_url: exportMeta.url,
    transport_upgrade: exportMeta.listed_url !== exportMeta.url,
    export_size_bytes: exportMeta.size,
    export_md5: exportMeta.md5,
    batch_timestamp: exportMeta.batchIso,
    batch_age_minutes: Number(batchAgeMinutes.toFixed(2)),
    expected_column_count: EXPECTED_COLUMN_COUNT,
    filter_contract_version: FILTER_CONTRACT_VERSION,
    included_event_root_codes: [...CONFLICT_ROOT_CODES],
    source_rows: lines.length,
    filtered_out_non_conflict_rows: filteredOut,
    conflict_filter_rows: relevantRows,
    mapped_conflict_rows: observations.length,
    unmapped_conflict_rows: unmapped.length,
    unmapped_fips_code_counts: unmappedByCode,
    malformed_rows: malformed.slice(0, 50),
    fips_lookup_url: FIPS_LOOKUP_URL,
    fips_lookup_entries: fipsLookup.size,
    fips_lookup_sha256: fipsLookupHash,
    country_mapping_method: "OFFICIAL_GDELT_FIPS_LOOKUP_TO_CANONICAL_COUNTRY_REGISTRY",
    source_role: "NEWS_DERIVED_FRESHNESS_EVIDENCE_OVERLAY_NOT_AUTHORITATIVE_CONFLICT_REPLACEMENT",
    risk_gate_signal_activation: false,
    raw_publisher_text_stored: false,
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
  batch_timestamp: exportMeta.batchIso,
  batch_age_minutes: Number(batchAgeMinutes.toFixed(2)),
  listed_export_url: exportMeta.listed_url,
  secure_export_url: exportMeta.url,
  transport_upgrade: exportMeta.listed_url !== exportMeta.url,
  source_rows: lines.length,
  filtered_out_non_conflict_rows: filteredOut,
  conflict_filter_rows: relevantRows,
  mapped_conflict_observations: observations.length,
  unmapped_conflict_rows: unmapped.length,
  unmapped_fips_code_counts: unmappedByCode,
  malformed_rows: malformed.length,
  fips_lookup_entries: fipsLookup.size,
  fips_lookup_sha256: fipsLookupHash,
  observations_attempted: attempted,
  source_registry: {
    commercial_usage_status: sourceRegistration.commercial_usage_status,
    enabled_for_ingestion: sourceRegistration.enabled_for_ingestion,
    enabled_for_commercial_signals: sourceRegistration.enabled_for_commercial_signals,
  },
  source_role: "NEWS_DERIVED_FRESHNESS_EVIDENCE_OVERLAY_NOT_AUTHORITATIVE_CONFLICT_REPLACEMENT",
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
    ? "PASS: GDELT V2 EVENT GOVERNED OBSERVATIONS + RELEASE MANIFEST WRITTEN"
    : "PASS: GDELT V2 EVENT DRY RUN CLEAN; DATABASE UNCHANGED",
)
