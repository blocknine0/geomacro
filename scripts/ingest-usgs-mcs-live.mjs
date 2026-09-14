import { createHash } from "node:crypto"

import {
  buildObservation,
  createDb,
  countryIso3FromName,
  loadCountryRegistry,
  parseCsv,
  sha256,
  upsertObservations,
} from "./lib-live-source-utils.mjs"

const SOURCE_ID = "usgs_mcs"
const RELEASE = "MCS 2026"
const CANONICAL_SCIENCEBASE_ITEM_ID = "69837e43b66b01367d7ec7c7"
const SCIENCEBASE_ITEM_IDS = [
  CANONICAL_SCIENCEBASE_ITEM_ID,
  "696a75d5d4be0228872d3bf8",
]
const SCIENCEBASE_ITEM_URL =
  `https://www.sciencebase.gov/catalog/item/${CANONICAL_SCIENCEBASE_ITEM_ID}`
const EXPECTED_SOURCE_FILE = "MCS2026_Commodities_Data.csv"
const EXPECTED_SOURCE_FILE_SHA256 =
  "582a0aa231aea53d8a97dc8d1cd3dfa5f885cf3760353e3d029d7f0ae4fbaaf5"
const WRITE = !process.argv.includes("--dry-run")

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithRetry(url, options = {}) {
  const attempts = 4
  let lastError = null

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, options)
      if (response.ok) return response

      const retryable = response.status === 429 || response.status >= 500
      lastError = new Error(`${url} returned HTTP ${response.status}`)
      if (!retryable || attempt === attempts) throw lastError
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt === attempts) throw lastError
    }

    await sleep(1000 * 2 ** (attempt - 1))
  }

  throw lastError ?? new Error(`Request failed: ${url}`)
}

async function loadPinnedReleaseBytes() {
  const failures = []

  for (const itemId of SCIENCEBASE_ITEM_IDS) {
    const metadataUrl =
      `https://www.sciencebase.gov/catalog/item/${itemId}?format=json`

    try {
      const metadataResponse = await fetchWithRetry(metadataUrl, {
        headers: { accept: "application/json" },
      })
      const metadata = await metadataResponse.json()
      const csvFile = (metadata?.files ?? []).find(
        (file) => String(file?.name ?? "") === EXPECTED_SOURCE_FILE,
      )
      if (!csvFile) {
        failures.push(`${itemId}: ${EXPECTED_SOURCE_FILE} not present`)
        continue
      }

      const csvUrl = csvFile.url ?? csvFile.downloadUri
      if (!csvUrl) {
        failures.push(`${itemId}: CSV has no download URL`)
        continue
      }

      const response = await fetchWithRetry(csvUrl)
      const bytes = Buffer.from(await response.arrayBuffer())
      const sourceFileSha256 = createHash("sha256").update(bytes).digest("hex")

      if (sourceFileSha256 !== EXPECTED_SOURCE_FILE_SHA256) {
        failures.push(`${itemId}: unexpected source hash ${sourceFileSha256}`)
        continue
      }

      return {
        bytes,
        sourceFileSha256,
        sourceFileName: EXPECTED_SOURCE_FILE,
        retrievalItemId: itemId,
      }
    } catch (error) {
      failures.push(
        `${itemId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  throw new Error(
    `Unable to retrieve pinned USGS MCS release: ${failures.join(" | ")}`,
  )
}

function canonical(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

const db = createDb()
const registry = await loadCountryRegistry(db)

console.log("===== USGS MCS CURRENT CRITICAL-MINERAL INGESTION =====")
console.log({ mode: WRITE ? "WRITE" : "DRY_RUN" })

const release = await loadPinnedReleaseBytes()
const text = new TextDecoder("windows-1252").decode(release.bytes)
const rows = parseCsv(text)
if (!rows.length) throw new Error("USGS CSV parsed zero rows")

const years = rows
  .map((row) => Number(row.Year))
  .filter(
    (year) =>
      Number.isInteger(year) &&
      year >= 1900 &&
      year <= new Date().getUTCFullYear(),
  )
if (!years.length) throw new Error("No valid USGS observation years found")
const latestYear = Math.max(...years)

function slug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160)
}

function isCriticalMineralRow(row) {
  return canonical(row?.["Is critical mineral 2025"]) === "yes"
}

const currentRows = rows.filter(
  (row) => Number(row.Year) === latestYear && isCriticalMineralRow(row),
)

console.log({
  raw_rows: rows.length,
  latest_observation_year: latestYear,
  current_critical_rows: currentRows.length,
  source_file: release.sourceFileName,
  source_file_bytes: release.bytes.length,
  source_file_sha256: release.sourceFileSha256,
  retrieval_item_id: release.retrievalItemId,
  canonical_item_id: CANONICAL_SCIENCEBASE_ITEM_ID,
})

const observations = []
let unmappedCountries = 0
let aggregateOtherCountryRows = 0
let nonNumericRows = 0
let missingCommodityRows = 0

for (const row of currentRows) {
  const countryName = String(row.Country ?? "").trim()
  const isOtherCountriesAggregate = canonical(countryName) === "other countries"
  const iso3 = isOtherCountriesAggregate
    ? null
    : countryIso3FromName(countryName, registry)
  if (!iso3 && !isOtherCountriesAggregate) {
    unmappedCountries++
    continue
  }

  const commodity = String(row.Commodity ?? "").trim()
  if (!commodity) {
    missingCommodityRows++
    continue
  }

  const rawNumeric = String(row.Value ?? "").replace(/,/g, "").trim()
  const numeric = Number(rawNumeric)
  if (!rawNumeric || !Number.isFinite(numeric) || numeric < 0) {
    nonNumericRows++
    continue
  }

  if (isOtherCountriesAggregate) aggregateOtherCountryRows++

  const section = String(row.Section ?? "").trim()
  const statistic = String(row.Statistics ?? "").trim()
  const detail = String(row.Statistics_detail ?? "").trim()
  const unit = String(row.Unit ?? "").trim() || null
  const metric =
    slug([statistic, detail].filter(Boolean).join(" ")) || "mineral_statistic"
  const observedAt = `${latestYear}-12-31T00:00:00.000Z`

  // Hash the complete authoritative row rather than a lossy synthetic key.
  // This prevents collisions between similarly-labelled MCS rows. The stable
  // OTHER_COUNTRIES key preserves an explicitly published aggregate residual
  // without pretending it is an ISO country.
  const sourceRowSha256 = sha256(row)
  const countryKey = iso3 ?? "OTHER_COUNTRIES"
  const sourceRecordId = [
    latestYear,
    countryKey,
    slug(commodity),
    release.sourceFileSha256.slice(0, 12),
    sourceRowSha256.slice(0, 24),
  ].join(":")

  observations.push(
    buildObservation({
      sourceId: SOURCE_ID,
      sourceRecordId,
      category: "CRITICAL_MINERALS",
      countryIso3: iso3,
      observedAt,
      publishedAt: null,
      metric,
      valueNumeric: numeric,
      unit,
      commodity,
      signalType: "critical_mineral_supply_state",
      sourceUrl: SCIENCEBASE_ITEM_URL,
      provenance: {
        release: RELEASE,
        release_item_id: CANONICAL_SCIENCEBASE_ITEM_ID,
        dataset_version: RELEASE,
        observation_year: latestYear,
        section: section || null,
        statistic: statistic || null,
        statistic_detail: detail || null,
        critical_mineral: true,
        critical_mineral_flag: String(
          row["Is critical mineral 2025"] ?? "",
        ).trim(),
        aggregate_bucket: isOtherCountriesAggregate
          ? "OTHER_COUNTRIES"
          : null,
        source_country_label: countryName || null,
        source_file: release.sourceFileName,
        source_file_sha256: release.sourceFileSha256,
        source_row_sha256: sourceRowSha256,
      },
      rawPayload: row,
      qualityStatus: "VERIFIED",
      commercialEligibilityStatus: "VERIFIED",
    }),
  )
}

const sourceRecordIds = observations.map((row) => row.source_record_id)
const normalizedHashes = observations.map((row) => row.normalized_hash)
if (new Set(sourceRecordIds).size !== sourceRecordIds.length) {
  throw new Error("USGS normalization produced duplicate source_record_id values")
}
if (new Set(normalizedHashes).size !== normalizedHashes.length) {
  throw new Error("USGS normalization produced duplicate normalized_hash values")
}

console.log({
  normalized_observations: observations.length,
  unmapped_country_rows: unmappedCountries,
  aggregate_other_countries_rows: aggregateOtherCountryRows,
  non_numeric_rows: nonNumericRows,
  missing_commodity_rows: missingCommodityRows,
  countries: new Set(
    observations.map((row) => row.country_iso3).filter(Boolean),
  ).size,
  commodities: new Set(observations.map((row) => row.commodity)).size,
  metrics: new Set(observations.map((row) => row.metric)).size,
  unique_source_record_ids: new Set(sourceRecordIds).size,
  unique_normalized_hashes: new Set(normalizedHashes).size,
})

if (observations.length === 0) {
  throw new Error(
    "USGS current critical-mineral normalization produced zero observations",
  )
}

if (WRITE) {
  const attempted = await upsertObservations(db, observations)
  console.log({ observations_attempted: attempted })
  console.log("PASS: USGS CURRENT CRITICAL-MINERAL INGESTION CLEAN")
} else {
  console.log({ observations_attempted: 0, writes_performed: false })
  console.log("PASS: USGS CURRENT CRITICAL-MINERAL INGESTION DRY RUN CLEAN")
}
