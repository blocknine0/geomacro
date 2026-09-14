import fs from "node:fs"
import { gunzipSync } from "node:zlib"

const DATASET = "gov_10q_ggdebt"
const METABASE_URL = "https://ec.europa.eu/eurostat/api/dissemination/catalogue/metabase.txt.gz"
const DATA_BASE = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${DATASET}`
const OUTPUT = process.env.EUROSTAT_FISCAL_COVERAGE_OUTPUT ?? "eurostat-sovereign-fiscal-coverage.json"
const AS_OF = new Date(process.env.EUROSTAT_FISCAL_AS_OF ?? Date.now())
const MAX_AGE_DAYS = Number(process.env.EUROSTAT_FISCAL_MAX_AGE_DAYS ?? 550)

const REQUIRED_CODES = {
  freq: "Q",
  unit: "PC_GDP",
  sector: "S13",
  na_item: "GD",
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithRetry(url, options = {}) {
  let lastError
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "user-agent": "Geomacro-Eurostat-Fiscal-Coverage-Audit/1.0",
          ...(options.headers ?? {}),
        },
      })
      if (response.ok) return response
      lastError = new Error(`HTTP ${response.status} for ${url}`)
      if (response.status < 500 && response.status !== 429) throw lastError
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt === 4) throw lastError
    }
    await sleep(600 * 2 ** (attempt - 1))
  }
  throw lastError ?? new Error("Eurostat request failed")
}

function parseMetabase(text) {
  const dimensions = new Map()
  for (const line of text.split(/\r?\n/)) {
    const [dataset, dimension, position] = line.split("\t")
    if (String(dataset).toLowerCase() !== DATASET) continue
    if (!dimensions.has(dimension)) dimensions.set(dimension, new Set())
    dimensions.get(dimension).add(position)
  }
  return dimensions
}

function assertStructure(dimensions) {
  if (dimensions.size === 0) throw new Error(`Eurostat metabase has no structure for ${DATASET}`)
  for (const [dimension, code] of Object.entries(REQUIRED_CODES)) {
    if (!dimensions.has(dimension)) {
      throw new Error(`Eurostat ${DATASET} structure is missing dimension ${dimension}`)
    }
    if (!dimensions.get(dimension).has(code)) {
      throw new Error(`Eurostat ${DATASET} ${dimension} does not contain required code ${code}`)
    }
  }
  if (!dimensions.has("geo") || !dimensions.has("time")) {
    throw new Error(`Eurostat ${DATASET} structure is missing geo/time dimensions`)
  }
}

function orderedCategoryCodes(category) {
  const index = category?.index ?? {}
  if (Array.isArray(index)) return [...index]
  return Object.entries(index)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map(([key]) => key)
}

function decodeJsonStat(dataset) {
  const ids = dataset.id
  const sizes = dataset.size
  if (!Array.isArray(ids) || !Array.isArray(sizes) || ids.length !== sizes.length) {
    throw new Error("Eurostat JSON-stat response has invalid id/size arrays")
  }
  const geoDim = ids.indexOf("geo")
  const timeDim = ids.indexOf("time")
  if (geoDim < 0 || timeDim < 0) throw new Error("Eurostat response is missing geo/time dimensions")

  const geoCodes = orderedCategoryCodes(dataset.dimension?.geo?.category)
  const timeCodes = orderedCategoryCodes(dataset.dimension?.time?.category)
  if (geoCodes.length !== sizes[geoDim] || timeCodes.length !== sizes[timeDim]) {
    throw new Error("Eurostat JSON-stat category dimensions do not match response sizes")
  }

  const strides = new Array(sizes.length).fill(1)
  for (let i = sizes.length - 2; i >= 0; i--) strides[i] = strides[i + 1] * sizes[i + 1]

  const latestByGeo = new Map()
  const values = dataset.value ?? {}
  for (const [flatIndexRaw, rawValue] of Object.entries(values)) {
    const value = Number(rawValue)
    if (!Number.isFinite(value)) continue
    const flatIndex = Number(flatIndexRaw)
    if (!Number.isInteger(flatIndex) || flatIndex < 0) continue
    const geoIndex = Math.floor(flatIndex / strides[geoDim]) % sizes[geoDim]
    const timeIndex = Math.floor(flatIndex / strides[timeDim]) % sizes[timeDim]
    const geo = geoCodes[geoIndex]
    const period = timeCodes[timeIndex]
    if (!geo || !period) continue
    const current = latestByGeo.get(geo)
    if (!current || period > current.period) latestByGeo.set(geo, { geo, period, value })
  }
  return [...latestByGeo.values()].sort((a, b) => a.geo.localeCompare(b.geo))
}

function periodEnd(period) {
  const match = /^(\d{4})-Q([1-4])$/.exec(period)
  if (!match) return null
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) * 3, 0, 23, 59, 59, 999))
}

function ageDays(period) {
  const end = periodEnd(period)
  if (!end) return null
  return Math.max(0, (AS_OF.getTime() - end.getTime()) / 86_400_000)
}

async function main() {
  if (Number.isNaN(AS_OF.getTime())) throw new Error("Invalid EUROSTAT_FISCAL_AS_OF")
  if (!Number.isFinite(MAX_AGE_DAYS) || MAX_AGE_DAYS <= 0) {
    throw new Error("EUROSTAT_FISCAL_MAX_AGE_DAYS must be positive")
  }

  const metabaseResponse = await fetchWithRetry(METABASE_URL)
  const metabaseBuffer = Buffer.from(await metabaseResponse.arrayBuffer())
  const metabaseText = gunzipSync(metabaseBuffer).toString("utf8")
  const dimensions = parseMetabase(metabaseText)
  assertStructure(dimensions)

  const params = new URLSearchParams({
    format: "JSON",
    lang: "en",
    freq: REQUIRED_CODES.freq,
    unit: REQUIRED_CODES.unit,
    sector: REQUIRED_CODES.sector,
    na_item: REQUIRED_CODES.na_item,
    sinceTimePeriod: "2024-Q1",
  })
  const sourceUrl = `${DATA_BASE}?${params.toString()}`
  const response = await fetchWithRetry(sourceUrl, { headers: { accept: "application/json" } })
  const payload = await response.json()
  if (payload?.error) throw new Error(`Eurostat returned an API error: ${JSON.stringify(payload.error)}`)

  const latest = decodeJsonStat(payload)
  if (latest.length === 0) throw new Error("Eurostat fiscal query returned no country/area observations")

  const sovereignLike = latest.filter((row) => /^[A-Z]{2}$/.test(row.geo))
  const fresh = sovereignLike.filter((row) => {
    const age = ageDays(row.period)
    return age !== null && age <= MAX_AGE_DAYS
  })
  const periodDistribution = {}
  for (const row of sovereignLike) {
    periodDistribution[row.period] = (periodDistribution[row.period] ?? 0) + 1
  }

  const report = {
    schema_version: "geomacro-eurostat-sovereign-fiscal-coverage-1.0",
    generated_at: new Date().toISOString(),
    as_of: AS_OF.toISOString(),
    source_id: "eurostat_government_finance",
    dataset_code: DATASET,
    source_url: sourceUrl,
    writes_performed: false,
    structure_proof: {
      metabase_url: METABASE_URL,
      required_codes: REQUIRED_CODES,
      required_codes_verified: true,
      dimensions_found: [...dimensions.keys()],
    },
    methodology_boundary: {
      measure: "quarterly general-government gross debt, percentage of GDP",
      sector: "S13 general government",
      direct_merge_with_world_bank_central_government_debt_allowed: false,
      reason: "General-government and central-government debt are not identical statistical concepts. A versioned harmonisation methodology is required before scoring.",
    },
    coverage: {
      latest_two_letter_geo_count: sovereignLike.length,
      fresh_or_aging_geo_count: fresh.length,
      max_age_days: MAX_AGE_DAYS,
      latest_period_distribution: periodDistribution,
      fresh_or_aging_areas: fresh.map((row) => ({
        geo: row.geo,
        period: row.period,
        value_pct_gdp: row.value,
        age_days: Number(ageDays(row.period).toFixed(2)),
      })),
    },
    activation: {
      coverage_proven: fresh.length > 0,
      operational_activation_allowed: false,
      reason: "This audit proves live source structure and coverage only. Risk Gate activation still requires country mapping, rights manifest, deterministic harmonisation, tests, production ingest and census proof.",
    },
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report, null, 2))
  console.log("PASS: EUROSTAT SOVEREIGN FISCAL COVERAGE AUDIT COMPLETE - NO WRITES")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
