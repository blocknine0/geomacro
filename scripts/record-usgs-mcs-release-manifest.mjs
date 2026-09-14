import {
  createDb,
  countryIso3FromName,
  loadCountryRegistry,
  parseCsv,
  sha256,
} from "./lib-live-source-utils.mjs"

const SOURCE_ID = "usgs_mcs"
const WRITE = process.argv.includes("--write")
const RELEASE = "MCS 2026"

const CRITICAL_MINERALS = new Set([
  "aluminum", "antimony", "arsenic", "barite", "beryllium", "bismuth",
  "boron", "cerium", "cesium", "chromium", "cobalt", "copper",
  "dysprosium", "erbium", "europium", "fluorspar", "gadolinium", "gallium",
  "germanium", "graphite", "hafnium", "holmium", "indium", "iridium",
  "lanthanum", "lead", "lithium", "lutetium", "magnesium", "manganese",
  "metallurgical coal", "neodymium", "nickel", "niobium", "palladium",
  "phosphate", "platinum", "potash", "praseodymium", "rhenium", "rhodium",
  "rubidium", "ruthenium", "samarium", "scandium", "silicon", "silver",
  "tantalum", "tellurium", "terbium", "thulium", "tin", "titanium",
  "tungsten", "uranium", "vanadium", "ytterbium", "yttrium", "zinc",
  "zirconium",
])

function canonical(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
}

function criticalCommodity(value) {
  const name = canonical(value)
  if (CRITICAL_MINERALS.has(name)) return true
  const alias = {
    aluminium: "aluminum",
    "phosphate rock": "phosphate",
    "silicon metal": "silicon",
  }[name]
  return Boolean(alias && CRITICAL_MINERALS.has(alias))
}

function productionRow(row) {
  const statistic = canonical(row?.Statistics)
  return statistic.includes("production") && !statistic.includes("capacity")
}

const db = createDb()
const registry = await loadCountryRegistry(db)

const metadataUrl =
  "https://www.sciencebase.gov/catalog/item/69837e43b66b01367d7ec7c7?format=json"
const metadataResponse = await fetch(metadataUrl)
if (!metadataResponse.ok) {
  throw new Error(`USGS metadata request failed: ${metadataResponse.status}`)
}
const metadata = await metadataResponse.json()
const csvFile = (metadata?.files ?? []).find((file) =>
  String(file?.name ?? "").toLowerCase().endsWith(".csv"),
)
if (!csvFile) throw new Error("USGS MCS CSV not found")

const csvUrl = csvFile.url ?? csvFile.downloadUri
const response = await fetch(csvUrl)
if (!response.ok) throw new Error(`USGS CSV download failed: ${response.status}`)
const rows = parseCsv(await response.text())
if (!rows.length) throw new Error("USGS MCS CSV parsed zero rows")

const years = rows
  .map((row) => Number(row.Year))
  .filter((year) => Number.isInteger(year) && year >= 1900 && year <= new Date().getUTCFullYear())
if (!years.length) throw new Error("USGS MCS has no valid observation year")
const latestYear = Math.max(...years)
const observedAt = `${latestYear}-12-31T00:00:00.000Z`

const currentCriticalRows = rows.filter(
  (row) => Number(row.Year) === latestYear && criticalCommodity(row.Commodity),
)
const productionRows = currentCriticalRows.filter(productionRow)
if (!productionRows.length) {
  throw new Error("USGS MCS current critical-mineral release has no production rows")
}

let productionNormalizedRows = 0
let productionUnmappedRows = 0
let productionNonNumericRows = 0
const productionUnits = new Set()
const productionCommodities = new Set()
const productionCountries = new Set()

for (const row of productionRows) {
  const iso3 = countryIso3FromName(String(row.Country ?? "").trim(), registry)
  if (!iso3) {
    productionUnmappedRows++
    continue
  }

  const numeric = Number(String(row.Value ?? "").replace(/,/g, "").trim())
  if (!Number.isFinite(numeric) || numeric < 0) {
    productionNonNumericRows++
    continue
  }

  productionNormalizedRows++
  productionCountries.add(iso3)
  productionCommodities.add(canonical(row.Commodity))
  const unit = String(row.Unit ?? "").trim()
  if (unit) productionUnits.add(unit)
}

const persisted = await db
  .from("live_external_observations")
  .select("observation_id", { count: "exact", head: true })
  .eq("source_id", SOURCE_ID)
  .eq("observed_at", observedAt)
  .eq("quality_status", "VERIFIED")
  .eq("commercial_eligibility_status", "VERIFIED")
if (persisted.error) throw persisted.error
if ((persisted.count ?? 0) < productionNormalizedRows) {
  throw new Error(
    `USGS persisted release appears incomplete: ${persisted.count ?? 0} rows < ${productionNormalizedRows} normalized production rows`,
  )
}

const retrievedAt = new Date().toISOString()
const manifestCore = {
  source_id: SOURCE_ID,
  release_id: `mcs-2026:${latestYear}`,
  dataset_version: RELEASE,
  retrieved_at: retrievedAt,
  coverage_start: observedAt,
  coverage_end: observedAt,
  rows_downloaded: rows.length,
  rows_normalized: persisted.count ?? 0,
  verified_rows: persisted.count ?? 0,
  partial_rows: 0,
  rejected_rows: productionNonNumericRows,
  unmapped_rows: productionUnmappedRows,
  write_completed: WRITE,
  metadata: {
    global_release: true,
    source_file: csvFile.name ?? null,
    latest_observation_year: latestYear,
    current_critical_rows: currentCriticalRows.length,
    production_source_rows: productionRows.length,
    production_normalized_rows: productionNormalizedRows,
    production_unmapped_rows: productionUnmappedRows,
    production_non_numeric_rows: productionNonNumericRows,
    production_country_count: productionCountries.size,
    production_commodity_count: productionCommodities.size,
    production_units: [...productionUnits].sort(),
    raw_redistribution: false,
    methodology_status: "RISK_GATE_V2_ENERGY_COMMODITIES_CONCENTRATION_INPUT",
  },
}
const manifest = { ...manifestCore, manifest_hash: sha256(manifestCore) }

if (WRITE) {
  const result = await db
    .from("live_source_release_manifests")
    .upsert(manifest, { onConflict: "source_id,release_id" })
  if (result.error) throw result.error
}

console.log(JSON.stringify({
  source_id: SOURCE_ID,
  mode: WRITE ? "WRITE" : "DRY_RUN",
  release_id: manifest.release_id,
  latest_observation_year: latestYear,
  production_source_rows: productionRows.length,
  production_normalized_rows: productionNormalizedRows,
  production_unmapped_rows: productionUnmappedRows,
  production_non_numeric_rows: productionNonNumericRows,
  persisted_verified_release_rows: persisted.count ?? 0,
  manifest_hash: manifest.manifest_hash,
  write_completed: WRITE,
}, null, 2))

console.log(
  WRITE
    ? "PASS: USGS MCS GLOBAL PRODUCTION MANIFEST WRITTEN"
    : "PASS: USGS MCS GLOBAL PRODUCTION MANIFEST DRY RUN CLEAN; DATABASE UNCHANGED",
)
