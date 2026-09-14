import fs from "node:fs"

const OUTPUT = process.env.ADB_PPG_GDP_RATIO_OUTPUT ?? "adb-ppg-gdp-ratio-coverage.json"
const API = "https://kidb.adb.org/api"
const RATE_DELAY_MS = 3200
const TARGET_YEAR = "2024"
const DEBT_FLOW = "DF_EXT"
const DEBT_INDICATOR = "DT_DOD_DPPG_CD"
const GDP_FLOW = "DF_NA"
const GDP_INDICATOR = "NY_GDP_MKTP_CD"

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
          "user-agent": "Geomacro-ADB-PPG-GDP-Exact-Ratio/1.0 (+https://geomacro.live)",
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

function findMetadata(payload, expectedCode) {
  const stack = [payload]
  while (stack.length) {
    const node = stack.pop()
    if (!node || typeof node !== "object") continue
    if (!Array.isArray(node)) {
      const code = node.code ?? node.id ?? null
      if (code === expectedCode) {
        const text = Object.values(node)
          .filter((value) => typeof value === "string")
          .join(" | ")
        return { code: expectedCode, text: text.slice(0, 2200) }
      }
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") stack.push(value)
    }
  }
  return null
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

function parseSeries(csvText, indicatorCode) {
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
  return csv.slice(1).map((row) => ({
    indicator: indicatorIndex >= 0 ? String(row[indicatorIndex] ?? "").trim() : indicatorCode,
    economy_code: String(row[economyIndex] ?? "").trim(),
    time_period: String(row[timeIndex] ?? "").trim(),
    value: Number(row[valueIndex]),
    unit: unitIndex >= 0 ? String(row[unitIndex] ?? "").trim() || null : null,
    unit_multiplier: multiplierIndex >= 0 ? String(row[multiplierIndex] ?? "").trim() || "0" : "0",
  })).filter((row) =>
    row.indicator === indicatorCode &&
    row.economy_code &&
    row.time_period === TARGET_YEAR &&
    Number.isFinite(row.value) &&
    row.value > 0
  )
}

function scaled(row) {
  const multiplier = Number(row.unit_multiplier ?? "0")
  if (!Number.isFinite(multiplier)) throw new Error(`Invalid unit multiplier: ${row.unit_multiplier}`)
  return row.value * 10 ** multiplier
}

function quantileNearestRank(values, q) {
  if (!values.length) return null
  const ordered = [...values].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil(q * ordered.length))
  return ordered[rank - 1]
}

async function main() {
  const [debtMetaResponse, gdpMetaResponse] = await Promise.all([
    request(`${API}/dataflow/indicators/${DEBT_FLOW}`),
    request(`${API}/dataflow/indicators/${GDP_FLOW}`),
  ])
  const [debtMetaPayload, gdpMetaPayload] = await Promise.all([
    debtMetaResponse.json(),
    gdpMetaResponse.json(),
  ])
  const debtMeta = findMetadata(debtMetaPayload, DEBT_INDICATOR)
  const gdpMeta = findMetadata(gdpMetaPayload, GDP_INDICATOR)
  if (!debtMeta || !/public and publicly guaranteed/i.test(debtMeta.text)) {
    throw new Error(`Exact PPG debt metadata contract changed for ${DEBT_INDICATOR}`)
  }
  if (!gdpMeta || !/gross domestic product/i.test(gdpMeta.text) || !/us dollars/i.test(gdpMeta.text)) {
    throw new Error(`Exact current-USD GDP metadata contract changed for ${GDP_INDICATOR}`)
  }

  const economyCodes = KIDB_ECONOMIES.map((row) => row.kidb).join("+")
  await sleep(RATE_DELAY_MS)
  const debtUrl = `${API}/v5/sdmx/data/ADB,${DEBT_FLOW}/A.${DEBT_INDICATOR}.${economyCodes}?startPeriod=${TARGET_YEAR}&endPeriod=${TARGET_YEAR}&format=sdmx-csv`
  const debtResponse = await request(debtUrl, { accept: "text/csv,application/vnd.sdmx.data+csv,*/*;q=0.2" })
  await sleep(RATE_DELAY_MS)
  const gdpUrl = `${API}/v5/sdmx/data/ADB,${GDP_FLOW}/A.${GDP_INDICATOR}.${economyCodes}?startPeriod=${TARGET_YEAR}&endPeriod=${TARGET_YEAR}&format=sdmx-csv`
  const gdpResponse = await request(gdpUrl, { accept: "text/csv,application/vnd.sdmx.data+csv,*/*;q=0.2" })

  const debtRows = parseSeries(await debtResponse.text(), DEBT_INDICATOR)
  const gdpRows = parseSeries(await gdpResponse.text(), GDP_INDICATOR)
  const debtByEconomy = new Map(debtRows.map((row) => [row.economy_code, row]))
  const gdpByEconomy = new Map(gdpRows.map((row) => [row.economy_code, row]))

  const countries = KIDB_ECONOMIES.map((economy) => {
    const debt = debtByEconomy.get(economy.kidb) ?? null
    const gdp = gdpByEconomy.get(economy.kidb) ?? null
    if (!debt || !gdp) {
      return { ...economy, year: TARGET_YEAR, status: "INCOMPLETE", debt, gdp, ratio_pct: null }
    }
    if (debt.unit !== "USD" || gdp.unit !== "USD") {
      return { ...economy, year: TARGET_YEAR, status: "UNIT_MISMATCH", debt, gdp, ratio_pct: null }
    }
    const numerator = scaled(debt)
    const denominator = scaled(gdp)
    if (!(denominator > 0)) {
      return { ...economy, year: TARGET_YEAR, status: "INVALID_DENOMINATOR", debt, gdp, ratio_pct: null }
    }
    return {
      ...economy,
      year: TARGET_YEAR,
      status: "RATIO_READY",
      debt,
      gdp,
      ratio_pct: Number(((numerator / denominator) * 100).toFixed(8)),
    }
  })

  const ready = countries.filter((row) => row.status === "RATIO_READY")
  const values = ready.map((row) => row.ratio_pct)
  const report = {
    schema_version: "geomacro-adb-ppg-gdp-exact-ratio-1.0",
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
      metadata_text: debtMeta.text,
      concept: "public_and_publicly_guaranteed_long_term_external_debt",
    },
    denominator: {
      dataflow: GDP_FLOW,
      indicator_code: GDP_INDICATOR,
      metadata_text: gdpMeta.text,
      concept: "gross_domestic_product_current_usd",
    },
    methodology_boundary: {
      methodology_id: "adb-ppg-external-debt-to-gdp-shadow-v1",
      metric: "ppg_external_debt_pct_gdp",
      formula: "100 * scaled PPG long-term external debt USD / scaled GDP current USD",
      same_publisher_required: true,
      same_year_required: true,
      raw_absolute_debt_peer_scoring_allowed: false,
      cross_source_value_pooling_allowed: false,
      direct_equivalence_to_wdi_or_eurostat_debt: false,
      production_module_state_allowed: false,
      shadow_only: true,
      descriptive_distribution_only: true,
    },
    coverage_summary: {
      requested_economy_count: KIDB_ECONOMIES.length,
      debt_2024_count: debtRows.length,
      gdp_2024_count: gdpRows.length,
      ratio_ready_count: ready.length,
      incomplete_count: countries.length - ready.length,
      peer_minimum: 20,
      peer_minimum_met: ready.length >= 20,
    },
    descriptive_peer_distribution: {
      p50_ratio_pct: quantileNearestRank(values, 0.5),
      p75_ratio_pct: quantileNearestRank(values, 0.75),
      p90_ratio_pct: quantileNearestRank(values, 0.9),
      min_ratio_pct: values.length ? Math.min(...values) : null,
      max_ratio_pct: values.length ? Math.max(...values) : null,
    },
    countries,
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report, null, 2))
  if (ready.length < 20) {
    console.error(`Only ${ready.length} exact same-source same-year PPG/GDP ratios are available; need >=20`)
    process.exit(2)
  }
  console.log("PASS: ADB EXACT PPG EXTERNAL-DEBT / GDP RATIO COVERAGE PROVEN - SHADOW ONLY")
}

main().catch((error) => {
  const report = {
    schema_version: "geomacro-adb-ppg-gdp-exact-ratio-error-1.0",
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
