import { createHash } from "node:crypto"

import {
  createDb,
  countryIso3FromName,
  loadCountryRegistry,
  parseCsv,
  sha256,
} from "./lib-live-source-utils.mjs"

const SOURCE_ID = "usgs_mcs"
const RELEASE = "MCS 2026"
const FILE = "MCS2026_Commodities_Data.csv"
const FILE_SHA256 =
  "582a0aa231aea53d8a97dc8d1cd3dfa5f885cf3760353e3d029d7f0ae4fbaaf5"
const ITEM_IDS = ["69837e43b66b01367d7ec7c7", "696a75d5d4be0228872d3bf8"]
const WRITE = process.argv.includes("--write")
const METHODOLOGY_SCOPE = "critical_mineral_extraction_concentration_v1"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithRetry(url) {
  let lastError = null
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
      const retryable = response.status === 429 || response.status >= 500
      lastError = new Error(`${url} returned HTTP ${response.status}`)
      if (!retryable || attempt === 4) throw lastError
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt === 4) throw lastError
    }
    await sleep(1000 * 2 ** (attempt - 1))
  }
  throw lastError ?? new Error(`Request failed: ${url}`)
}

async function loadPinnedRows() {
  const failures = []
  for (const itemId of ITEM_IDS) {
    try {
      const metaResponse = await fetchWithRetry(
        `https://www.sciencebase.gov/catalog/item/${itemId}?format=json`,
      )
      const metadata = await metaResponse.json()
      const file = (metadata?.files ?? []).find(
        (entry) => String(entry?.name ?? "") === FILE,
      )
      const url = file?.url ?? file?.downloadUri
      if (!url) {
        failures.push(`${itemId}: ${FILE} unavailable`)
        continue
      }
      const response = await fetchWithRetry(url)
      const bytes = Buffer.from(await response.arrayBuffer())
      const digest = createHash("sha256").update(bytes).digest("hex")
      if (digest !== FILE_SHA256) {
        failures.push(`${itemId}: source hash ${digest}`)
        continue
      }
      return {
        itemId,
        rows: parseCsv(new TextDecoder("windows-1252").decode(bytes)),
      }
    } catch (error) {
      failures.push(
        `${itemId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  throw new Error(`Pinned USGS MCS release unavailable: ${failures.join(" | ")}`)
}

function canonical(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function isCritical(row) {
  return canonical(row?.["Is critical mineral 2025"]) === "yes"
}

function isExtractionSeriesRow(row) {
  const section = canonical(row.Section)
  const statistic = canonical(row.Statistics)
  const detail = canonical(row.Statistics_detail)
  return (
    section.startsWith("world ") &&
    statistic === "production" &&
    detail.includes("mine production") &&
    !detail.includes("rounded") &&
    !detail.includes("refinery") &&
    !detail.includes("smelter") &&
    !detail.includes("secondary")
  )
}

function seriesIdentity(row) {
  return {
    commodity: String(row.Commodity ?? "").trim(),
    section: String(row.Section ?? "").trim(),
    statistic: String(row.Statistics ?? "").trim(),
    detail: String(row.Statistics_detail ?? "").trim(),
    unit: String(row.Unit ?? "").trim(),
  }
}

function seriesKey(identity) {
  return sha256({
    commodity: canonical(identity.commodity),
    section: canonical(identity.section),
    statistic: canonical(identity.statistic),
    detail: canonical(identity.detail),
    unit: canonical(identity.unit),
  })
}

async function loadPersistedRows(db) {
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const result = await db
      .from("live_external_observations")
      .select(
        "observation_id,source_record_id,country_iso3,commodity,value_numeric,unit,observed_at,quality_status,commercial_eligibility_status,provenance",
      )
      .eq("source_id", SOURCE_ID)
      .order("observation_id", { ascending: true })
      .range(from, from + pageSize - 1)
    if (result.error) throw result.error
    rows.push(...(result.data ?? []))
    if ((result.data ?? []).length < pageSize) break
  }
  return rows
}

const db = createDb()
const registry = await loadCountryRegistry(db)
const source = await loadPinnedRows()
if (!source.rows.length) throw new Error("USGS MCS release parsed zero rows")

const years = source.rows
  .map((row) => Number(row.Year))
  .filter((year) => Number.isInteger(year))
if (!years.length) throw new Error("USGS MCS release has no valid year")
const latestYear = Math.max(...years)
const observedAt = `${latestYear}-12-31T00:00:00.000Z`

const current = source.rows.filter(
  (row) => Number(row.Year) === latestYear && isCritical(row),
)
const candidateRows = current.filter(isExtractionSeriesRow)

const grouped = new Map()
for (const row of candidateRows) {
  const identity = seriesIdentity(row)
  const key = seriesKey(identity)
  const group = grouped.get(key) ?? {
    identity,
    rows: [],
    invalid_values: [],
    unmapped_labels: [],
  }

  const rawValue = String(row.Value ?? "").replace(/,/g, "").trim()
  const value = Number(rawValue)
  if (!rawValue || !Number.isFinite(value) || value < 0) {
    group.invalid_values.push({
      country: String(row.Country ?? "").trim(),
      value: String(row.Value ?? "").trim(),
    })
    grouped.set(key, group)
    continue
  }

  const sourceCountryLabel = String(row.Country ?? "").trim()
  const residual = canonical(sourceCountryLabel) === "other countries"
  const countryIso3 = residual
    ? null
    : countryIso3FromName(sourceCountryLabel, registry)
  if (!countryIso3 && !residual) {
    group.unmapped_labels.push(sourceCountryLabel)
    grouped.set(key, group)
    continue
  }

  group.rows.push({
    country_iso3: countryIso3,
    residual,
    source_country_label: sourceCountryLabel,
    value,
    source_row_sha256: sha256(row),
  })
  grouped.set(key, group)
}

const byCommodity = new Map()
for (const [key, group] of grouped.entries()) {
  const commodityKey = canonical(group.identity.commodity)
  const entries = byCommodity.get(commodityKey) ?? []
  entries.push({ key, ...group })
  byCommodity.set(commodityKey, entries)
}

const verifiedSourceSeries = []
const blockedSeries = []
for (const [commodityKey, groups] of [...byCommodity.entries()].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  if (groups.length !== 1) {
    blockedSeries.push({
      commodity_key: commodityKey,
      reason: "AMBIGUOUS_EXTRACTION_SERIES",
      series_count: groups.length,
    })
    continue
  }

  const group = groups[0]
  const actualCountries = new Set(
    group.rows.map((row) => row.country_iso3).filter(Boolean),
  )
  const positiveActual = group.rows.filter(
    (row) => row.country_iso3 && row.value > 0,
  ).length
  const duplicateCountries = group.rows
    .filter((row) => row.country_iso3)
    .map((row) => row.country_iso3)
    .filter((iso3, index, all) => all.indexOf(iso3) !== index)

  const blockers = []
  if (group.invalid_values.length) blockers.push("NON_NUMERIC_OR_WITHHELD_VALUES")
  if (group.unmapped_labels.length) blockers.push("UNMAPPED_COUNTRY_LABELS")
  if (duplicateCountries.length) blockers.push("DUPLICATE_COUNTRY_ROWS")
  if (actualCountries.size < 2 || positiveActual < 2) {
    blockers.push("INSUFFICIENT_PRODUCER_BREADTH")
  }
  if (!group.identity.unit) blockers.push("MISSING_UNIT")

  if (blockers.length) {
    blockedSeries.push({
      commodity_key: commodityKey,
      commodity: group.identity.commodity,
      reason: blockers.join("+"),
      invalid_values: group.invalid_values,
      unmapped_labels: [...new Set(group.unmapped_labels)].sort(),
    })
    continue
  }

  verifiedSourceSeries.push({
    commodity_key: commodityKey,
    commodity: group.identity.commodity,
    series_key: group.key,
    section: group.identity.section,
    statistic: group.identity.statistic,
    detail: group.identity.detail,
    unit: group.identity.unit,
    observed_at: observedAt,
    source_row_count: group.rows.length,
    actual_country_count: actualCountries.size,
    positive_actual_producer_count: positiveActual,
    residual_bucket_present: group.rows.some((row) => row.residual),
    source_row_hashes: group.rows
      .map((row) => row.source_row_sha256)
      .sort(),
  })
}

const persisted = await loadPersistedRows(db)
const deterministicRows = persisted.filter((row) => {
  const provenance =
    row.provenance && typeof row.provenance === "object" ? row.provenance : {}
  return (
    row.quality_status === "VERIFIED" &&
    row.commercial_eligibility_status === "VERIFIED" &&
    row.observed_at === observedAt &&
    provenance.source_file_sha256 === FILE_SHA256 &&
    typeof provenance.source_row_sha256 === "string"
  )
})
const persistedBySourceRow = new Map()
for (const row of deterministicRows) {
  const provenance = row.provenance
  const hash = String(provenance.source_row_sha256)
  if (persistedBySourceRow.has(hash)) {
    throw new Error(`Duplicate deterministic USGS source row persisted: ${hash}`)
  }
  persistedBySourceRow.set(hash, row)
}

const verifiedSeries = []
for (const series of verifiedSourceSeries) {
  const missing = series.source_row_hashes.filter(
    (hash) => !persistedBySourceRow.has(hash),
  )
  if (missing.length) {
    blockedSeries.push({
      commodity_key: series.commodity_key,
      commodity: series.commodity,
      reason: "PERSISTED_SERIES_INCOMPLETE",
      missing_source_row_hash_count: missing.length,
    })
    continue
  }

  const rows = series.source_row_hashes.map((hash) => persistedBySourceRow.get(hash))
  const bad = rows.some((row) => {
    const provenance = row.provenance
    return (
      canonical(row.commodity) !== series.commodity_key ||
      canonical(provenance.section) !== canonical(series.section) ||
      canonical(provenance.statistic) !== canonical(series.statistic) ||
      canonical(provenance.statistic_detail) !== canonical(series.detail) ||
      canonical(row.unit) !== canonical(series.unit)
    )
  })
  if (bad) {
    blockedSeries.push({
      commodity_key: series.commodity_key,
      commodity: series.commodity,
      reason: "PERSISTED_SERIES_IDENTITY_MISMATCH",
    })
    continue
  }

  const seriesHash = sha256({
    methodology_scope: METHODOLOGY_SCOPE,
    source_file_sha256: FILE_SHA256,
    ...series,
  })
  verifiedSeries.push({ ...series, series_hash: seriesHash })
}

if (!verifiedSeries.length) {
  throw new Error(
    "No complete deterministic USGS extraction series are persisted; run the hardened ingestion before recording a manifest",
  )
}

const matchedHashes = new Set(
  verifiedSeries.flatMap((series) => series.source_row_hashes),
)
const retrievedAt = new Date().toISOString()
const releaseId = `mcs-2026:${latestYear}:extraction-concentration-v1`
const manifestCore = {
  source_id: SOURCE_ID,
  release_id: releaseId,
  dataset_version: RELEASE,
  retrieved_at: retrievedAt,
  coverage_start: observedAt,
  coverage_end: observedAt,
  rows_downloaded: source.rows.length,
  rows_normalized: matchedHashes.size,
  verified_rows: matchedHashes.size,
  partial_rows: 0,
  rejected_rows: blockedSeries.length,
  unmapped_rows: blockedSeries.filter((item) =>
    String(item.reason ?? "").includes("UNMAPPED_COUNTRY_LABELS"),
  ).length,
  write_completed: WRITE,
  metadata: {
    methodology_scope: METHODOLOGY_SCOPE,
    source_file: FILE,
    source_file_sha256: FILE_SHA256,
    release_item_id: source.itemId,
    latest_observation_year: latestYear,
    current_critical_rows: current.length,
    extraction_candidate_rows: candidateRows.length,
    verified_series_count: verifiedSeries.length,
    blocked_series_count: blockedSeries.length,
    verified_series: verifiedSeries,
    blocked_series: blockedSeries,
    residual_bucket_semantics:
      "Other countries is retained as a denominator residual and HHI upper-bound bucket; it is never treated as a sovereign producer.",
    raw_redistribution: false,
  },
}
const manifest = { ...manifestCore, manifest_hash: sha256(manifestCore) }

if (WRITE) {
  const result = await db
    .from("live_source_release_manifests")
    .upsert(manifest, { onConflict: "source_id,release_id" })
  if (result.error) throw result.error
}

console.log(
  JSON.stringify(
    {
      source_id: SOURCE_ID,
      mode: WRITE ? "WRITE" : "DRY_RUN",
      release_id: releaseId,
      latest_observation_year: latestYear,
      deterministic_persisted_rows: deterministicRows.length,
      verified_series_count: verifiedSeries.length,
      verified_commodities: verifiedSeries.map((series) => series.commodity),
      blocked_series_count: blockedSeries.length,
      manifest_hash: manifest.manifest_hash,
      write_completed: WRITE,
    },
    null,
    2,
  ),
)
console.log(
  WRITE
    ? "PASS: USGS MCS EXTRACTION MANIFEST WRITTEN"
    : "PASS: USGS MCS EXTRACTION MANIFEST DRY RUN CLEAN; DATABASE UNCHANGED",
)
