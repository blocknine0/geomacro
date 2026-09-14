import fs from "node:fs"

const OUTPUT = process.env.ADB_PPG_GDP_RATIO_OUTPUT ?? "adb-ppg-gdp-ratio-coverage.json"
const API = "https://kidb.adb.org/api"
const RATE_DELAY_MS = 3200
const DEBT_FLOW = "DF_EXT"
const DEBT_INDICATOR = "DT_DOD_DPPG_CD"
const GDP_FLOW = "DF_NA"
const TARGET_YEAR = "2024"

const KIDB_ECONOMIES = [
  ["AFG", "AFG"], ["ARM", "ARM"], ["AUS", "AUS"], ["AZE", "AZE"],
  ["BAN", "BGD"], ["BHU", "BTN"], ["BRU", "BRN"], ["CAM", "KHM"],
  ["COO", "COK"], ["FIJ", "FJI"], ["FSM", "FSM"], ["GEO", "GEO"],
  ["HKG", "HKG"], ["IND", "IND"], ["INO", "IDN"], ["JPN", "JPN"],
  ["KAZ", "KAZ"], ["KGZ", "KGZ"], ["KIR", "KIR"], ["KOR", "KOR"],
  ["LAO", "LAO"], ["MAL", "MYS"], ["MLD", "MDV"], ["MON", "MNG"],
  ["MYA", "MMR"], ["NAU", "NRU"], ["NEP", "NPL"], ["NIU", "NIU"],
  ["NZL", "NZL"], ["PAK", "PAK"], ["PHI", "PHL"], ["PLW", "PLW"],
  ["PNG", "PNG"], ["PRC", "CHN"], ["RMI", "MHL"], ["SAM", "WSM"],
  ["SIN", "SGP"], ["SOL", "SLB"], ["SRI", "LKA"], ["TAJ", "TJK"],
  ["TAP", "TWN"], ["THA", "THA"], ["TIM", "TLS"], ["TKM", "TKM"],
  ["TON", "TON"], ["TUR", "TUR"], ["TUV", "TUV"], ["UZB", "UZB"],
  ["VAN", "VUT"], ["VIE", "VNM"],
].map(([kidb, iso3]) => ({ kidb, iso3 }))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function request(url, { accept = "application/json", attempts = 3 } = {}) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          accept,
          "user-agent": "Geomacro-ADB-PPG-GDP-Ratio-Audit/1.0 (+https://geomacro.live)",
        },
      })
      if (response.ok) return response
      lastError = new Error(`HTTP ${response.status} for ${url}`)
      if (response.status < 500 && response.status !== 429) throw lastError
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt === attempts) throw lastError
    }
    await sleep(700 * 2 ** (attempt - 1))
  }
  throw lastError ?? new Error(`ADB KIDB request failed for ${url}`)
}

function walkObjects(node, visit) {
  if (!node || typeof node !== "object") return
  if (!Array.isArray(node)) visit(node)
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") walkObjects(value, visit)
  }
}

function objectCode(object) {
  for (const key of ["id", "code", "value", "key"]) {
    const value = object?.[key]
    if (typeof value === "string" && /^[A-Z][A-Z0-9_]{1,80}$/.test(value)) return value
  }
  return null
}

function objectText(object) {
  return Object.values(object ?? {})
    .filter((value) => typeof value === "string")
    .join(" | ")
}

function discoverCurrentUsdGdp(payload) {
  const candidates = []
  const seen = new Set()
  walkObjects(payload, (object) => {
    const code = objectCode(object)
    if (!code || seen.has(code)) return
    const text = objectText(object)
    const lower = text.toLowerCase()
    const isGdp = lower.includes("gross domestic product") || /(^|\W)gdp(\W|$)/i.test(text)
    const isCurrent = lower.includes("current")
    const isUsd = lower.includes("$ million") || lower.includes("usd million") || lower.includes("us dollar")
    const excluded =
      lower.includes("per capita") ||
      lower.includes("purchasing power") ||
      lower.includes("constant") ||
      lower.includes("annual change") ||
      lower.includes("growth") ||
      lower.includes("% of gdp") ||
      lower.includes("percentage of gdp")
    if (isGdp && isCurrent && isUsd && !excluded) {
      seen.add(code)
      candidates.push({ code, text: text.slice(0, 2000) })
    }
  })
  return candidates
}

function findExactDebt(payload) {
  let match = null
  walkObjects(payload, (object) => {
    if (match) return
    const code = objectCode(object)
    if (code !== DEBT_INDICATOR) return
    const text = objectText(object)
    if (!/public and publicly guaranteed/i.test(text)) return
    match = { code, text: text.slice(0, 2000) }
  })
  return match
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
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
  return rows.filter((item) => item.some((value) => String(value).trim() !== ""))
}

function headerIndex(headers, candidates) {
  const normalized = headers.map((value) => String(value).trim().toUpperCase().replaceAll(" ", "_"))
  for (const candidate of candidates) {
    const index = normalized.indexOf(candidate)
    if (index >= 0) return index
  }
  return -1
}

function parseObservations(csvText, expectedIndicator) {
  const csv = parseCsv(csvText)
  if (csv.length < 2) return []
  const headers = csv[0]
  const indicatorIndex = headerIndex(headers, ["INDICATOR", "INDICATOR_CODE"])
  const economyIndex = headerIndex(headers, ["ECONOMY_CODE", "REF_AREA", "REFERENCE_AREA"])
  const timeIndex = headerIndex(headers, ["TIME_PERIOD", "TIME"])
  const valueIndex = headerIndex(headers, ["OBS_VALUE", "OBSERVATION_VALUE"])
  const unitIndex = headerIndex(headers, ["UNIT_MEASURE", "UNIT", "UNIT_MEASURE_CODE"])
  const multiplierIndex = headerIndex(headers, ["UNIT_MULT", "UNIT_MULTIPLIER"])
  if ([economyIndex, timeIndex, valueIndex].some((index) => index < 0)) {
    throw new Error(`KIDB SDMX-CSV missing required columns: ${headers.join(",")}`)
  }

  return csv
    .slice(1)
    .map((row) => ({
      indicator: indicatorIndex >= 0 ? String(row[indicatorIndex] ?? "").trim() : expectedIndicator,
      economy_code: String(row[economyIndex] ?? "").trim(),
      time_period: String(row[timeIndex] ?? "").trim(),
      value: Number(row[valueIndex]),
      unit: unitIndex >= 0 ? String(row[unitIndex] ?? "").trim() || null : null,
      unit_multiplier: multiplierIndex >= 0 ? String(row[multiplierIndex] ?? "").trim() || "0" : "0",
    }))
    .filter(
      (row) =>
        row.indicator === expectedIndicator &&
        row.economy_code &&
        row.time_period === TARGET_YEAR &&
        Number.isFinite(row.value) &&
        row.value > 0,
    )
}

function scaledValue(row) {
  const multiplier = Number(row.unit_multiplier ?? 0)
  if (!Number.isFinite(multiplier)) throw new Error(`Invalid unit multiplier ${row.unit_multiplier}`)
  return row.value * 10 ** multiplier
}

async function main() {
  const [debtMetaResponse, gdpMetaResponse] = await Promise.all([
    request(`${API}/dataflow/indicators/${DEBT_FLOW}`),
    request(`${API}/dataflow/indicators/${GDP_FLOW}`),
  ])
  const [debtMeta, gdpMeta] = await Promise.all([debtMetaResponse.json(), gdpMetaResponse.json()])

  const debt = findExactDebt(debtMeta)
  if (!debt) throw new Error(`Exact ${DEBT_INDICATOR} PPG debt metadata not found in ${DEBT_FLOW}`)

  const gdpCandidates = discoverCurrentUsdGdp(gdpMeta)
  if (gdpCandidates.length !== 1) {
    const report = {
      schema_version: "geomacro-adb-ppg-gdp-ratio-discovery-1.0",
      generated_at: new Date().toISOString(),
      writes_performed: false,
      scoring_changed: false,
      production_activation_allowed: false,
      debt_series: debt,
      gdp_candidates: gdpCandidates,
      fail_closed_reason: `Expected exactly one current-USD GDP series in ${GDP_FLOW}; found ${gdpCandidates.length}`,
    }
    fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
    console.log(JSON.stringify(report, null, 2))
    process.exit(2)
  }
  const gdp = gdpCandidates[0]

  const economyCodes = KIDB_ECONOMIES.map((row) => row.kidb).join("+")
  await sleep(RATE_DELAY_MS)
  const debtUrl = `${API}/v5/sdmx/data/ADB,${DEBT_FLOW}/A.${DEBT_INDICATOR}.${economyCodes}?startPeriod=${TARGET_YEAR}&endPeriod=${TARGET_YEAR}&format=sdmx-csv`
  const gdpUrl = `${API}/v5/sdmx/data/ADB,${GDP_FLOW}/A.${gdp.code}.${economyCodes}?startPeriod=${TARGET_YEAR}&endPeriod=${TARGET_YEAR}&format=sdmx-csv`
  const debtResponse = await request(debtUrl, { accept: "text/csv,application/vnd.sdmx.data+csv,*/*;q=0.2" })
  await sleep(RATE_DELAY_MS)
  const gdpResponse = await request(gdpUrl, { accept: "text/csv,application/vnd.sdmx.data+csv,*/*;q=0.2" })

  const debtRows = parseObservations(await debtResponse.text(), DEBT_INDICATOR)
  const gdpRows = parseObservations(await gdpResponse.text(), gdp.code)
  const debtByEconomy = new Map(debtRows.map((row) => [row.economy_code, row]))
  const gdpByEconomy = new Map(gdpRows.map((row) => [row.economy_code, row]))

  const ratios = KIDB_ECONOMIES.map((economy) => {
    const debtRow = debtByEconomy.get(economy.kidb) ?? null
    const gdpRow = gdpByEconomy.get(economy.kidb) ?? null
    if (!debtRow || !gdpRow) {
      return {
        ...economy,
        year: TARGET_YEAR,
        debt: debtRow,
        gdp: gdpRow,
        ratio_pct: null,
        status: "INCOMPLETE",
      }
    }
    if (debtRow.unit !== "USD" || gdpRow.unit !== "USD") {
      return {
        ...economy,
        year: TARGET_YEAR,
        debt: debtRow,
        gdp: gdpRow,
        ratio_pct: null,
        status: "UNIT_MISMATCH",
      }
    }
    const denominator = scaledValue(gdpRow)
    const numerator = scaledValue(debtRow)
    const ratio = denominator > 0 ? (numerator / denominator) * 100 : null
    return {
      ...economy,
      year: TARGET_YEAR,
      debt: debtRow,
      gdp: gdpRow,
      ratio_pct: ratio == null ? null : Number(ratio.toFixed(8)),
      status: ratio == null ? "INVALID_DENOMINATOR" : "RATIO_READY",
    }
  })

  const ready = ratios.filter((row) => row.status === "RATIO_READY")
  const sorted = [...ready].sort((a, b) => a.ratio_pct - b.ratio_pct)
  const peerValues = sorted.map((row) => row.ratio_pct)
  const p50 = peerValues.length ? peerValues[Math.floor((peerValues.length - 1) * 0.5)] : null
  const p75 = peerValues.length ? peerValues[Math.floor((peerValues.length - 1) * 0.75)] : null
  const p90 = peerValues.length ? peerValues[Math.floor((peerValues.length - 1) * 0.9)] : null

  const report = {
    schema_version: "geomacro-adb-ppg-gdp-ratio-coverage-1.0",
    generated_at: new Date().toISOString(),
    target_year: TARGET_YEAR,
    writes_performed: false,
    scoring_changed: false,
    production_activation_allowed: false,
    source: {
      publisher: "Asian Development Bank / Key Indicators Database",
      api: API,
      documented_rate_limit: "20 queries/minute",
      enforced_inter_request_delay_ms: RATE_DELAY_MS,
    },
    numerator: {
      dataflow: DEBT_FLOW,
      indicator_code: DEBT_INDICATOR,
      metadata_text: debt.text,
      concept: "public_and_publicly_guaranteed_long_term_external_debt",
    },
    denominator: {
      dataflow: GDP_FLOW,
      indicator_code: gdp.code,
      metadata_text: gdp.text,
      concept: "gross_domestic_product_current_usd",
    },
    methodology_boundary: {
      methodology_id: "adb-ppg-external-debt-to-gdp-shadow-v1",
      metric: "ppg_external_debt_pct_gdp",
      formula: "100 * PPG long-term external debt current USD / GDP current USD",
      same_publisher_required: true,
      same_year_required: true,
      raw_absolute_debt_peer_scoring_allowed: false,
      cross_source_value_pooling_allowed: false,
      direct_equivalence_to_wdi_or_eurostat_debt: false,
      production_module_state_allowed: false,
      shadow_only: true,
    },
    coverage_summary: {
      requested_economy_count: KIDB_ECONOMIES.length,
      debt_2024_count: debtRows.length,
      gdp_2024_count: gdpRows.length,
      ratio_ready_count: ready.length,
      incomplete_count: ratios.length - ready.length,
      peer_minimum_met: ready.length >= 20,
    },
    descriptive_peer_distribution: {
      note: "Descriptive only. Risk transform is not approved by this audit.",
      p50_ratio_pct: p50,
      p75_ratio_pct: p75,
      p90_ratio_pct: p90,
    },
    countries: ratios,
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report, null, 2))
  if (ready.length < 20) {
    console.error(`Only ${ready.length} same-source same-year PPG/GDP ratios are available; need >=20`)
    process.exit(3)
  }
  console.log("PASS: ADB PPG EXTERNAL-DEBT / GDP RATIO COVERAGE PROVEN - SHADOW ONLY")
}

main().catch((error) => {
  const report = {
    schema_version: "geomacro-adb-ppg-gdp-ratio-error-1.0",
    generated_at: new Date().toISOString(),
    writes_performed: false,
    scoring_changed: false,
    production_activation_allowed: false,
    error: error instanceof Error ? error.message : String(error),
  }
  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
})
