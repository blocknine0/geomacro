import fs from "node:fs"

const BASE =
  "https://sdmx.oecd.org/public/rest/data/OECD.SDD.NAD,DSD_PSD_D1D4@DF_PSD_D1D4,1.0"
const START_PERIOD = process.env.OECD_FISCAL_START_PERIOD ?? "2024-Q1"
const AS_OF = new Date(process.env.OECD_FISCAL_AS_OF ?? Date.now())
const MAX_AGE_DAYS = Number(process.env.OECD_FISCAL_MAX_AGE_DAYS ?? 800)
const OUTPUT = process.env.OECD_FISCAL_COVERAGE_OUTPUT ?? "oecd-sovereign-fiscal-coverage.json"

const CONCEPTS = [
  {
    id: "D3",
    measure: "FD3",
    description:
      "General-government gross debt D3: SDRs, currency and deposits, debt securities, loans and other accounts payable",
  },
  {
    id: "D4",
    measure: "FD4",
    description:
      "General-government gross debt D4 total gross debt, the broadest standard measure",
  },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithRetry(url) {
  let lastError
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "text/csv, application/vnd.sdmx.data+csv;version=2.0.0;q=0.9",
          "user-agent": "Geomacro-OECD-Fiscal-Coverage-Audit/1.0",
        },
      })
      if (response.ok) return response
      lastError = new Error(`OECD returned HTTP ${response.status}`)
      if (response.status < 500 && response.status !== 429) throw lastError
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt === 4) throw lastError
    }
    await sleep(750 * 2 ** (attempt - 1))
  }
  throw lastError ?? new Error("OECD request failed")
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ""
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      quoted = true
    } else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""))
      rows.push(row)
      row = []
      field = ""
    } else {
      field += ch
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""))
    rows.push(row)
  }

  return rows.filter((item) => item.some((value) => value !== ""))
}

function findHeader(headers, candidates) {
  const normalized = new Map(
    headers.map((header, index) => [
      String(header).trim().toUpperCase().replaceAll(" ", "_"),
      index,
    ]),
  )
  for (const candidate of candidates) {
    const index = normalized.get(candidate.toUpperCase().replaceAll(" ", "_"))
    if (index !== undefined) return index
  }
  return -1
}

function periodEnd(period) {
  const quarter = /^(\d{4})-Q([1-4])$/.exec(period)
  if (quarter) {
    const year = Number(quarter[1])
    const q = Number(quarter[2])
    return new Date(Date.UTC(year, q * 3, 0, 23, 59, 59, 999))
  }
  const year = /^(\d{4})$/.exec(period)
  if (year) return new Date(Date.UTC(Number(year[1]), 11, 31, 23, 59, 59, 999))
  const date = new Date(period)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysBetween(a, b) {
  return Math.max(0, (a.getTime() - b.getTime()) / 86_400_000)
}

async function auditConcept(concept) {
  const url =
    `${BASE}/Q..${concept.measure}.PT_B1GQ.S13` +
    `?startPeriod=${encodeURIComponent(START_PERIOD)}&dimensionAtObservation=AllDimensions`
  const response = await fetchWithRetry(url)
  const text = await response.text()
  if (!text.trim()) throw new Error(`OECD ${concept.id} returned an empty body`)
  if (text.trim().startsWith("{") || text.trim().startsWith("<")) {
    throw new Error(`OECD ${concept.id} did not return SDMX CSV`)
  }

  const csv = parseCsv(text)
  if (csv.length < 2) throw new Error(`OECD ${concept.id} CSV contained no observations`)

  const headers = csv[0]
  const refIndex = findHeader(headers, ["REF_AREA", "REFERENCE_AREA"])
  const timeIndex = findHeader(headers, ["TIME_PERIOD", "TIME"])
  const valueIndex = findHeader(headers, ["OBS_VALUE", "OBSERVATION_VALUE"])
  if ([refIndex, timeIndex, valueIndex].some((index) => index < 0)) {
    throw new Error(
      `OECD ${concept.id} CSV missing required columns. Headers: ${headers.join(", ")}`,
    )
  }

  const latestByArea = new Map()
  for (const cells of csv.slice(1)) {
    const refArea = String(cells[refIndex] ?? "").trim().toUpperCase()
    const period = String(cells[timeIndex] ?? "").trim()
    const value = Number(cells[valueIndex])
    if (!/^[A-Z]{3}$/.test(refArea) || !period || !Number.isFinite(value)) continue

    const end = periodEnd(period)
    if (!end) continue
    const current = latestByArea.get(refArea)
    if (!current || end.getTime() > current.end.getTime()) {
      latestByArea.set(refArea, { ref_area: refArea, period, end, value })
    }
  }

  const latest = [...latestByArea.values()].sort((a, b) =>
    a.ref_area.localeCompare(b.ref_area),
  )
  const fresh = latest.filter((row) => daysBetween(AS_OF, row.end) <= MAX_AGE_DAYS)
  const periodDistribution = {}
  for (const row of latest) {
    periodDistribution[row.period] = (periodDistribution[row.period] ?? 0) + 1
  }

  return {
    concept: concept.id,
    measure_code: concept.measure,
    description: concept.description,
    institutional_sector: "S13 general government",
    unit: "PT_B1GQ percentage of GDP",
    frequency: "quarterly",
    source_url: url,
    raw_observation_rows: csv.length - 1,
    latest_iso3_area_count: latest.length,
    fresh_or_aging_iso3_area_count: fresh.length,
    max_age_days: MAX_AGE_DAYS,
    latest_period_distribution: periodDistribution,
    fresh_or_aging_areas: fresh.map((row) => ({
      ref_area: row.ref_area,
      period: row.period,
      value: row.value,
    })),
  }
}

async function main() {
  if (Number.isNaN(AS_OF.getTime())) throw new Error("Invalid OECD_FISCAL_AS_OF")
  if (!Number.isFinite(MAX_AGE_DAYS) || MAX_AGE_DAYS <= 0) {
    throw new Error("OECD_FISCAL_MAX_AGE_DAYS must be positive")
  }

  const concepts = []
  for (const concept of CONCEPTS) concepts.push(await auditConcept(concept))

  const report = {
    schema_version: "geomacro-oecd-sovereign-fiscal-coverage-1.0",
    generated_at: new Date().toISOString(),
    as_of: AS_OF.toISOString(),
    start_period: START_PERIOD,
    source_id: "oecd_public_finance",
    dataset: "OECD Government debt by instrument coverage",
    dataflow: "OECD.SDD.NAD,DSD_PSD_D1D4@DF_PSD_D1D4,1.0",
    writes_performed: false,
    commercial_boundary: {
      status: "RIGHTS_APPROVED_CANDIDATE_NOT_YET_RISK_GATE_ACTIVE",
      note:
        "OECD data terms permit commercial use unless exact dataset metadata or third-party rights impose additional restrictions. This audit does not promote a Risk Gate metric.",
    },
    methodology_boundary: {
      current_geomacro_metric: "central_government_debt_pct_gdp",
      oecd_sector: "general government",
      direct_merge_allowed: false,
      reason:
        "Government-sector and debt-instrument definitions differ. A separately versioned harmonisation methodology is required before scoring.",
    },
    concepts,
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report, null, 2))
  console.log("PASS: OECD SOVEREIGN FISCAL COVERAGE AUDIT COMPLETE - NO WRITES")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
