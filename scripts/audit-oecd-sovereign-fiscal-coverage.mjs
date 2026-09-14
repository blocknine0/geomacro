import fs from "node:fs"
import { createHash } from "node:crypto"

const BASE =
  "https://sdmx.oecd.org/public/rest/data/OECD.SDD.NAD,DSD_PSD_D1D4@DF_PSD_D1D4,1.0"
const AS_OF = new Date(process.env.OECD_FISCAL_AS_OF ?? Date.now())
const MAX_AGE_DAYS = Number(process.env.OECD_FISCAL_MAX_AGE_DAYS ?? 800)
const OUTPUT = process.env.OECD_FISCAL_COVERAGE_OUTPUT ?? "oecd-sovereign-fiscal-coverage.json"

// This baseline is the exact accepted set from the production country census
// run that promoted Eurostat sovereign_fiscal on 2026-09-14. It is evidence
// context only. It is never used to score or filter OECD observations.
const PRODUCTION_BASELINE = Object.freeze({
  run_id: 34833782067,
  commit_sha: "ede1038389bcebd39956983b8cab1fd857d78130",
  denominator: 194,
  accepted_iso3: [
    "AUT", "BEL", "BGR", "CYP", "CZE", "DNK", "ESP", "EST", "FIN", "FRA",
    "GRC", "HRV", "HUN", "IRL", "ITA", "LTU", "LUX", "LVA", "MLT", "NLD",
    "NOR", "POL", "PRT", "ROU", "SVK", "SVN",
  ],
})

const CONCEPTS = [
  {
    id: "D3",
    measure: "FD3",
    description:
      "General-government gross debt D3: SDRs, currency and deposits, debt securities, loans and other accounts payable",
    candidate_role: "PREFERRED_SOURCE_SPECIFIC_SOVEREIGN_FISCAL_CANDIDATE",
  },
  {
    id: "D4",
    measure: "FD4",
    description:
      "General-government gross debt D4 total gross debt, including the broadest instrument coverage",
    candidate_role: "COVERAGE_COMPARATOR_NOT_PREFERRED_FOR_CROSS_COUNTRY_SCORING",
  },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex")

async function request(url, headers = {}) {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Geomacro-OECD-Fiscal-Coverage-Audit/1.2 (+https://geomacro.live)",
          ...headers,
        },
      })
      if (response.ok) return response
      lastError = new Error(`HTTP ${response.status}`)
      if (response.status < 500 && response.status !== 429) throw lastError
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt === 3) throw lastError
    }
    await sleep(500 * 2 ** (attempt - 1))
  }
  throw lastError ?? new Error("OECD request failed")
}

async function fetchCsv(concept) {
  const baseParams = new URLSearchParams({
    lastNObservations: "1",
    dimensionAtObservation: "AllDimensions",
  })
  const path = `${BASE}/Q..${concept.measure}.PT_B1GQ.S13`

  const variants = [
    {
      label: "accept-sdmx-csv",
      url: `${path}?${baseParams.toString()}`,
      headers: {
        accept: "application/vnd.sdmx.data+csv;version=2.0.0,text/csv;q=0.9,*/*;q=0.1",
      },
    },
    {
      label: "csvfilewithlabels",
      url: `${path}?${baseParams.toString()}&format=csvfilewithlabels`,
      headers: {},
    },
    {
      label: "csvfile",
      url: `${path}?${baseParams.toString()}&format=csvfile`,
      headers: {},
    },
  ]

  const failures = []
  for (const variant of variants) {
    try {
      const response = await request(variant.url, variant.headers)
      const text = await response.text()
      const trimmed = text.trim()
      if (!trimmed) throw new Error("empty body")
      if (trimmed.startsWith("{") || trimmed.startsWith("<")) {
        throw new Error("response was not CSV")
      }
      return {
        text,
        url: variant.url,
        transport: variant.label,
        response_sha256: sha256(text),
      }
    } catch (error) {
      failures.push(
        `${variant.label}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  throw new Error(`OECD ${concept.id} latest-only query failed: ${failures.join(" | ")}`)
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

    if (ch === '"') quoted = true
    else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""))
      rows.push(row)
      row = []
      field = ""
    } else field += ch
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

function sorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

async function auditConcept(concept) {
  const { text, url, transport, response_sha256 } = await fetchCsv(concept)
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
    if (!end || end.getTime() > AS_OF.getTime()) continue
    const current = latestByArea.get(refArea)
    if (!current || end.getTime() > current.end.getTime()) {
      latestByArea.set(refArea, { ref_area: refArea, period, end, value })
    }
  }

  const latest = [...latestByArea.values()].sort((a, b) =>
    a.ref_area.localeCompare(b.ref_area),
  )
  const fresh = latest.filter((row) => daysBetween(AS_OF, row.end) <= MAX_AGE_DAYS)
  const freshIso3 = sorted(fresh.map((row) => row.ref_area))
  const baselineSet = new Set(PRODUCTION_BASELINE.accepted_iso3)
  const overlap = freshIso3.filter((iso3) => baselineSet.has(iso3))
  const expansion = freshIso3.filter((iso3) => !baselineSet.has(iso3))
  const periodDistribution = {}
  for (const row of latest) {
    periodDistribution[row.period] = (periodDistribution[row.period] ?? 0) + 1
  }

  return {
    concept: concept.id,
    measure_code: concept.measure,
    description: concept.description,
    candidate_role: concept.candidate_role,
    institutional_sector: "S13 general government",
    unit: "PT_B1GQ percentage of GDP",
    frequency: "quarterly",
    query_mode: "lastNObservations=1 per series",
    transport,
    source_url: url,
    response_sha256,
    raw_observation_rows: csv.length - 1,
    latest_iso3_area_count: latest.length,
    fresh_or_aging_iso3_area_count: fresh.length,
    max_age_days: MAX_AGE_DAYS,
    latest_period_distribution: periodDistribution,
    fresh_or_aging_iso3: freshIso3,
    current_production_overlap_count: overlap.length,
    current_production_overlap_iso3: overlap,
    potential_expansion_count: expansion.length,
    potential_expansion_iso3: expansion,
    fresh_or_aging_areas: fresh.map((row) => ({
      ref_area: row.ref_area,
      period: row.period,
      observed_at: row.end.toISOString(),
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

  const d3 = concepts.find((item) => item.concept === "D3")
  const d4 = concepts.find((item) => item.concept === "D4")
  if (!d3 || !d4) throw new Error("OECD audit did not return both D3 and D4")

  const d3Set = new Set(d3.fresh_or_aging_iso3)
  const d4Set = new Set(d4.fresh_or_aging_iso3)
  const comparison = {
    d3_d4_fresh_intersection_iso3: sorted(
      d3.fresh_or_aging_iso3.filter((iso3) => d4Set.has(iso3)),
    ),
    d3_only_fresh_iso3: sorted(
      d3.fresh_or_aging_iso3.filter((iso3) => !d4Set.has(iso3)),
    ),
    d4_only_fresh_iso3: sorted(
      d4.fresh_or_aging_iso3.filter((iso3) => !d3Set.has(iso3)),
    ),
  }

  const report = {
    schema_version: "geomacro-oecd-sovereign-fiscal-coverage-1.2",
    generated_at: new Date().toISOString(),
    as_of: AS_OF.toISOString(),
    source_id: "oecd_public_finance",
    dataset: "OECD Government debt by instrument coverage",
    dataflow: "OECD.SDD.NAD,DSD_PSD_D1D4@DF_PSD_D1D4,1.0",
    dataset_contract_reviewed_at: "2026-09-14",
    writes_performed: false,
    production_baseline: PRODUCTION_BASELINE,
    commercial_boundary: {
      status: "RIGHTS_APPROVED_CANDIDATE_NOT_YET_RISK_GATE_ACTIVE",
      note:
        "OECD data terms permit commercial use unless exact dataset metadata or third-party rights impose additional restrictions. This audit performs no writes and no Risk Gate activation.",
    },
    methodology_boundary: {
      current_wdi_metric: "central_government_debt_pct_gdp",
      active_eurostat_metric: "general_government_gross_debt_pct_gdp",
      oecd_sector: "S13 general government",
      preferred_candidate: "D3",
      preferred_candidate_reason:
        "Use D3 only as a separately normalized OECD general-government debt methodology candidate. D4 remains a coverage comparator because broader pension-liability treatment reduces cross-country comparability.",
      direct_merge_allowed: false,
      cross_source_raw_value_mixing_allowed: false,
      source_specific_peer_universe_required: true,
    },
    preferred_candidate_summary: {
      concept: "D3",
      fresh_or_aging_peer_count: d3.fresh_or_aging_iso3_area_count,
      current_production_overlap_count: d3.current_production_overlap_count,
      potential_expansion_count: d3.potential_expansion_count,
      potential_expansion_iso3: d3.potential_expansion_iso3,
      shadow_methodology_candidate: d3.fresh_or_aging_iso3_area_count >= 20,
      production_activation_allowed: false,
    },
    cross_concept_coverage_comparison: comparison,
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
