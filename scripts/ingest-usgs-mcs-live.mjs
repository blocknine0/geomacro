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
const SCIENCEBASE_ITEM_ID = "69837e43b66b01367d7ec7c7"
const SCIENCEBASE_ITEM_URL =
  `https://www.sciencebase.gov/catalog/item/${SCIENCEBASE_ITEM_ID}`
const SCIENCEBASE_METADATA_URL = `${SCIENCEBASE_ITEM_URL}?format=json`
const WRITE = !process.argv.includes("--dry-run")

const db = createDb()
const registry = await loadCountryRegistry(db)

console.log("===== USGS MCS CURRENT CRITICAL-MINERAL INGESTION =====")
console.log({ mode: WRITE ? "WRITE" : "DRY_RUN" })

const metadataResponse = await fetch(SCIENCEBASE_METADATA_URL)
if (!metadataResponse.ok) {
  throw new Error(`USGS metadata request failed: ${metadataResponse.status}`)
}

const metadata = await metadataResponse.json()
const csvFile = (metadata?.files ?? []).find(
  (file) =>
    String(file?.name ?? "").toLowerCase() ===
    "mcs2026_commodities_data.csv",
)
if (!csvFile) {
  throw new Error("Authoritative MCS2026_Commodities_Data.csv was not found")
}

const csvUrl = csvFile.url ?? csvFile.downloadUri
if (!csvUrl) {
  throw new Error("USGS MCS CSV has no download URL")
}

const response = await fetch(csvUrl)
if (!response.ok) {
  throw new Error(`USGS CSV download failed: ${response.status}`)
}

const bytes = Buffer.from(await response.arrayBuffer())
const sourceFileSha256 = createHash("sha256").update(bytes).digest("hex")
const text = new TextDecoder("windows-1252").decode(bytes)
const rows = parseCsv(text)
if (!rows.length) {
  throw new Error("USGS CSV parsed zero rows")
}

const years = rows
  .map((row) => Number(row.Year))
  .filter(
    (year) =>
      Number.isInteger(year) &&
      year >= 1900 &&
      year <= new Date().getUTCFullYear(),
  )
if (!years.length) {
  throw new Error("No valid USGS observation years found")
}
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
  return (
    String(row?.["Is critical mineral 2025"] ?? "")
      .trim()
      .toLowerCase() === "yes"
  )
}

const currentRows = rows.filter(
  (row) => Number(row.Year) === latestYear && isCriticalMineralRow(row),
)

console.log({
  raw_rows: rows.length,
  latest_observation_year: latestYear,
  current_critical_rows: currentRows.length,
  source_file: csvFile.name,
  source_file_bytes: bytes.length,
  source_file_sha256: sourceFileSha256,
  source_last_updated: metadata?.provenance?.lastUpdated ?? null,
})

const observations = []
let unmappedCountries = 0
let nonNumericRows = 0
let missingCommodityRows = 0

for (const row of currentRows) {
  const countryName = String(row.Country ?? "").trim()
  const iso3 = countryIso3FromName(countryName, registry)
  if (!iso3) {
    unmappedCountries++
    continue
  }

  const commodity = String(row.Commodity ?? "").trim()
  if (!commodity) {
    missingCommodityRows++
    continue
  }

  const numeric = Number(String(row.Value ?? "").replace(/,/g, "").trim())
  if (!Number.isFinite(numeric)) {
    nonNumericRows++
    continue
  }

  const section = String(row.Section ?? "").trim()
  const statistic = String(row.Statistics ?? "").trim()
  const detail = String(row.Statistics_detail ?? "").trim()
  const unit = String(row.Unit ?? "").trim() || null
  const metric =
    slug([statistic, detail].filter(Boolean).join(" ")) || "mineral_statistic"
  const observedAt = `${latestYear}-12-31T00:00:00.000Z`

  // Hash the complete authoritative row rather than a lossy synthetic key.
  // This prevents collisions such as the MCS U.S. salient-statistics row and
  // the separate world-production row sharing country/commodity/metric text.
  const sourceRowSha256 = sha256(row)
  const sourceRecordId = [
    latestYear,
    iso3,
    slug(commodity),
    sourceFileSha256.slice(0, 12),
    sourceRowSha256.slice(0, 24),
  ].join(":")

  observations.push(
    buildObservation({
      sourceId: SOURCE_ID,
      sourceRecordId,
      category: "CRITICAL_MINERALS",
      countryIso3: iso3,
      observedAt,
      // Do not invent a publication timestamp.
      publishedAt: null,
      metric,
      valueNumeric: numeric,
      unit,
      commodity,
      signalType: "critical_mineral_supply_state",
      // Persist the stable ScienceBase item URL, not a storage download URI
      // that may change independently of the authoritative bytes.
      sourceUrl: SCIENCEBASE_ITEM_URL,
      provenance: {
        release: RELEASE,
        release_item_id: SCIENCEBASE_ITEM_ID,
        dataset_version: String(metadata?.title ?? RELEASE),
        observation_year: latestYear,
        section: section || null,
        statistic: statistic || null,
        statistic_detail: detail || null,
        critical_mineral: true,
        critical_mineral_flag: String(
          row["Is critical mineral 2025"] ?? "",
        ).trim(),
        source_file: csvFile.name,
        source_file_sha256: sourceFileSha256,
        source_row_sha256: sourceRowSha256,
        source_last_updated: metadata?.provenance?.lastUpdated ?? null,
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
  non_numeric_rows: nonNumericRows,
  missing_commodity_rows: missingCommodityRows,
  countries: new Set(observations.map((row) => row.country_iso3)).size,
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
