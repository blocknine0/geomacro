import crypto from "node:crypto"
import fs from "node:fs"

const OUTPUT = process.env.ADB_FISCAL_DISCOVERY_OUTPUT ?? "adb-key-indicators-fiscal-discovery.json"
const API = "https://kidb.adb.org/api"
const RATE_DELAY_MS = 3200
const DEBT_FLOW = "DF_EXT"
const DEBT_INDICATOR = "DT_DOD_DPPG_CD"
const GDP_FLOW = "DF_NA"
const TARGET_PERIOD = "2024"
const MIN_PEERS = 20

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

const CURRENT_EUROSTAT_ACCEPTED = new Set([
  "AUT", "BEL", "BGR", "CYP", "CZE", "DNK", "ESP", "EST", "FIN", "FRA",
  "GRC", "HRV", "HUN", "IRL", "ITA", "LTU", "LUX", "LVA", "MLT", "NLD",
  "NOR", "POL", "PRT", "ROU", "SVK", "SVN",
])

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function request(url, { accept = "application/json", attempts = 3 } = {}) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          accept,
          "user-agent": "Geomacro-ADB-KIDB-Fiscal-Proof/4.1 (+https://geomacro.live)",
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

function primitiveText(object) {
  return Object.values(object ?? {}).filter((value) => typeof value === "string").join(" | ")
}

function objectCode(object) {
  const value = object?.code
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(value)
    ? value
    : null
}

function findExactCode(payload, code, labelPattern) {
  let match = null
  walkObjects(payload, (object) => {
    if (match) return
    if (!Object.values(object ?? {}).includes(code)) return
    const text = primitiveText(object)
    if (labelPattern && !labelPattern.test(text)) return
    match = { code, text: text.slice(0, 2000) }
  })
  return match
}

function findGdpCandidates(payload) {
  const rows = []
  const seen = new Set()
  walkObjects(payload, (object) => {
    const text = primitiveText(object)
    if (!/GDP at current prices/i.test(text)) return
    const code = objectCode(object)
    if (!code || seen.has(code)) return
    seen.add(code)
    rows.push({ code, text: text.slice(0, 1600) })
  })
  return rows.sort((a, b) => a.code.localeCompare(b.code))
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

function parseObservations(text, defaultIndicator = null) {
  if (/^\s*<\?xml/i.test(text) || /^\s*<message:/i.test(text) || /^\s*<Error/i.test(text)) {
    throw new Error(`KIDB returned XML/error payload instead of SDMX-CSV: ${text.slice(0, 400).replace(/\s+/g, " ")}`)
  }
  const csv = parseCsv(text)
  if (csv.length < 2) return []
  const headers = csv[0]
  const economyIndex = headerIndex(headers, ["ECONOMY_CODE", "REF_AREA", "REFERENCE_AREA"])
  const indicatorIndex = headerIndex(headers, ["INDICATOR", "INDICATOR_CODE"])
  const timeIndex = headerIndex(headers, ["TIME_PERIOD", "TIME"])
  const valueIndex = headerIndex(headers, ["OBS_VALUE", "OBSERVATION_VALUE"])
  const unitIndex = headerIndex(headers, ["UNIT_MEASURE", "UNIT", "UNIT_MEASURE_CODE"])
  const unitMultIndex = headerIndex(headers, ["UNIT_MULT", "UNIT_MULTIPLIER"])
  if ([economyIndex, timeIndex, valueIndex].some((index) => index < 0)) {
    throw new Error(`KIDB SDMX-CSV missing required columns: ${headers.join(",")}`)
  }
  return csv.slice(1).map((row) => ({
    economy_code: String(row[economyIndex] ?? "").trim().toUpperCase(),
    indicator: indicatorIndex >= 0 ? String(row[indicatorIndex] ?? "").trim().toUpperCase() : defaultIndicator,
    time_period: String(row[timeIndex] ?? "").trim(),
    value: Number(row[valueIndex]),
    unit: unitIndex >= 0 ? String(row[unitIndex] ?? "").trim().toUpperCase() || null : null,
    unit_multiplier: unitMultIndex >= 0 ? String(row[unitMultIndex] ?? "").trim() || null : null,
  })).filter((row) => row.economy_code && row.time_period && Number.isFinite(row.value))
}

function multiplierFactor(value) {
  if (value == null || value === "") return 1
  const exponent = Number(value)
  if (!Number.isInteger(exponent) || exponent < -12 || exponent > 18) {
    throw new Error(`Unsupported KIDB UNIT_MULT value: ${value}`)
  }
  return 10 ** exponent
}

function normalizeUsd(row) {
  if (row.unit !== "USD") throw new Error(`Expected USD for ${row.economy_code}/${row.indicator}; got ${row.unit}`)
  return row.value * multiplierFactor(row.unit_multiplier)
}

function midrankPercentile(values, value) {
  const less = values.filter((candidate) => candidate < value).length
  const equal = values.filter((candidate) => candidate === value).length
  return Number((((less + 0.5 * equal) / values.length) * 100).toFixed(4))
}

function quantile(sorted, q) {
  const index = (sorted.length - 1) * q
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

async function probeGdpCandidate(candidate) {
  await sleep(RATE_DELAY_MS)
  const url = `${API}/v5/sdmx/data/ADB,${GDP_FLOW}/A.${candidate.code}.PHI?startPeriod=${TARGET_PERIOD}&endPeriod=${TARGET_PERIOD}&format=sdmx-csv`
  try {
    const response = await request(url, { accept: "text/csv,*/*;q=0.2" })
    const text = await response.text()
    const rows = parseObservations(text, candidate.code).filter(
      (row) => row.indicator === candidate.code && row.time_period === TARGET_PERIOD,
    )
    return {
      ...candidate,
      probe_url: url,
      status: "OK",
      observation_count: rows.length,
      units: [...new Set(rows.map((row) => row.unit).filter(Boolean))].sort(),
      unit_multipliers: [...new Set(rows.map((row) => row.unit_multiplier).filter((value) => value != null))].sort(),
    }
  } catch (error) {
    return {
      ...candidate,
      probe_url: url,
      status: "FAIL_CLOSED",
      observation_count: 0,
      units: [],
      unit_multipliers: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  const economyCodes = KIDB_ECONOMIES.map((row) => row.kidb).join("+")

  const debtIndicatorsUrl = `${API}/dataflow/indicators/${DEBT_FLOW}`
  const debtIndicators = await (await request(debtIndicatorsUrl)).json()
  const debtMetadata = findExactCode(debtIndicators, DEBT_INDICATOR, /public and publicly guaranteed/i)
  if (!debtMetadata) throw new Error(`${DEBT_INDICATOR} exact PPG series missing from ${DEBT_FLOW}`)

  await sleep(RATE_DELAY_MS)
  const debtHistoryUrl = `${API}/v5/sdmx/data/ADB,${DEBT_FLOW}/A.${DEBT_INDICATOR}.${economyCodes}?startPeriod=2022&endPeriod=2024&format=sdmx-csv`
  const debtHistory = parseObservations(await (await request(debtHistoryUrl, { accept: "text/csv,*/*;q=0.2" })).text(), DEBT_INDICATOR)
  const latestDebt = new Map()
  for (const row of debtHistory) {
    const current = latestDebt.get(row.economy_code)
    if (!current || row.time_period > current.time_period) latestDebt.set(row.economy_code, row)
  }

  const coverage = KIDB_ECONOMIES.map((economy) => ({
    ...economy,
    observed: latestDebt.has(economy.kidb),
    latest: latestDebt.get(economy.kidb) ?? null,
    latest_is_2024: latestDebt.get(economy.kidb)?.time_period === TARGET_PERIOD,
    already_eurostat_production_accepted: CURRENT_EUROSTAT_ACCEPTED.has(economy.iso3),
  }))
  const observed = coverage.filter((row) => row.observed)
  const observed2024 = coverage.filter((row) => row.latest_is_2024)

  await sleep(RATE_DELAY_MS)
  const gdpIndicatorsUrl = `${API}/dataflow/indicators/${GDP_FLOW}`
  const gdpIndicators = await (await request(gdpIndicatorsUrl)).json()
  const gdpCandidates = findGdpCandidates(gdpIndicators)
  if (!gdpCandidates.length) throw new Error("No direct indicator-code GDP at current prices candidates found in DF_NA")

  const candidateEvidence = []
  for (const candidate of gdpCandidates) {
    candidateEvidence.push(await probeGdpCandidate(candidate))
  }
  const usdCandidates = candidateEvidence.filter(
    (row) => row.status === "OK" && row.observation_count > 0 && row.units.length === 1 && row.units[0] === "USD",
  )
  if (usdCandidates.length !== 1) {
    throw new Error(
      `Expected exactly one USD GDP-current-price candidate; direct codes=${gdpCandidates.map((row) => row.code).join(",")}; USD matches=${usdCandidates.map((row) => row.code).join(",") || "none"}; evidence=${JSON.stringify(candidateEvidence)}`,
    )
  }
  const gdpIndicator = usdCandidates[0].code

  await sleep(RATE_DELAY_MS)
  const gdpUrl = `${API}/v5/sdmx/data/ADB,${GDP_FLOW}/A.${gdpIndicator}.${economyCodes}?startPeriod=${TARGET_PERIOD}&endPeriod=${TARGET_PERIOD}&format=sdmx-csv`
  const gdpRows = parseObservations(await (await request(gdpUrl, { accept: "text/csv,*/*;q=0.2" })).text(), gdpIndicator)
    .filter((row) => row.time_period === TARGET_PERIOD)
  const gdpByEconomy = new Map(gdpRows.map((row) => [row.economy_code, row]))

  const peers = []
  for (const economy of KIDB_ECONOMIES) {
    const debt = latestDebt.get(economy.kidb)
    const gdp = gdpByEconomy.get(economy.kidb)
    if (!debt || debt.time_period !== TARGET_PERIOD || !gdp) continue
    const debtUsd = normalizeUsd(debt)
    const gdpUsd = normalizeUsd(gdp)
    if (!(gdpUsd > 0) || debtUsd < 0) continue
    const ratio = (debtUsd / gdpUsd) * 100
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1000) {
      throw new Error(`Implausible PPG debt/GDP ratio for ${economy.iso3}: ${ratio}`)
    }
    peers.push({
      kidb: economy.kidb,
      iso3: economy.iso3,
      period: TARGET_PERIOD,
      ppg_external_debt_usd: debtUsd,
      gdp_current_usd: gdpUsd,
      ppg_external_debt_pct_gdp: Number(ratio.toFixed(6)),
    })
  }
  if (peers.length < MIN_PEERS) throw new Error(`Same-source ADB peer universe too small: ${peers.length} < ${MIN_PEERS}`)

  const ratios = peers.map((row) => row.ppg_external_debt_pct_gdp).sort((a, b) => a - b)
  const scored = peers.map((row) => ({
    ...row,
    shadow_risk_score: midrankPercentile(ratios, row.ppg_external_debt_pct_gdp),
  })).sort((a, b) => a.iso3.localeCompare(b.iso3))
  if (scored.some((row) => row.shadow_risk_score < 0 || row.shadow_risk_score > 100)) {
    throw new Error("ADB shadow percentile produced score outside 0..100")
  }

  const methodology = {
    methodology_version: "adb-ppg-external-debt-gdp-percentile-1.0.0-shadow",
    numerator: { dataflow: DEBT_FLOW, indicator: DEBT_INDICATOR, concept: "public_and_publicly_guaranteed_long_term_external_debt" },
    denominator: { dataflow: GDP_FLOW, indicator: gdpIndicator, concept: "gdp_at_current_prices_usd" },
    period: TARGET_PERIOD,
    peer_universe: "same-source KIDB economies with same-period numerator and denominator",
    score_rule: "midrank percentile of PPG external debt as percent of GDP; higher ratio means higher risk",
    minimum_peer_count: MIN_PEERS,
    cross_source_pooling: false,
    production_module_state_emitted: false,
  }
  const methodologyHash = crypto.createHash("sha256").update(JSON.stringify(methodology)).digest("hex")

  const report = {
    schema_version: "geomacro-adb-kidb-ppg-fiscal-shadow-4.1",
    generated_at: new Date().toISOString(),
    source_candidate: "adb_kidb_sdmx_v5",
    publisher: "Asian Development Bank / Key Indicators Database",
    writes_performed: false,
    production_activation_allowed: false,
    scoring_changed: false,
    api_contract: {
      documentation_url: "https://kidb.adb.org/api",
      version: "v5",
      documented_rate_limit: "20 queries/minute",
      enforced_inter_request_delay_ms: RATE_DELAY_MS,
      debt_data_endpoint: debtHistoryUrl,
      gdp_probe_endpoints: candidateEvidence.map((row) => row.probe_url),
      gdp_data_endpoint: gdpUrl,
    },
    exact_series: {
      dataflow: DEBT_FLOW,
      indicator_code: DEBT_INDICATOR,
      label_verified: true,
      metadata_text: debtMetadata.text,
      source_concept: "public_and_publicly_guaranteed_long_term_external_debt",
      units: [...new Set(debtHistory.map((row) => row.unit).filter(Boolean))].sort(),
      unit_multipliers: [...new Set(debtHistory.map((row) => row.unit_multiplier).filter((value) => value != null))].sort(),
    },
    commercial_boundary: {
      status: "KIDB_COMMERCIAL_REUSE_ALLOWED_WITH_ATTRIBUTION",
      rights_reference_urls: ["https://kidb.adb.org/terms", "https://data.adb.org/terms-use-data", "https://data.adb.org/dataset/india-key-indicators"],
      third_party_content_excluded: true,
      raw_redistribution_default: false,
      attribution_required: true,
    },
    methodology_boundary: {
      discovery_only: true,
      not_equivalent_to_wdi_central_government_debt: true,
      not_equivalent_to_eurostat_general_government_debt: true,
      debt_definition_harmonised: false,
      cross_source_value_pooling_allowed: false,
      direct_sovereign_fiscal_fallback_allowed: false,
      country_registry_and_sovereignty_match_required_before_support_claim: true,
      shadow_methodology_proven: true,
      production_module_state_emitted: false,
    },
    coverage_summary: {
      requested_kidb_economy_count: KIDB_ECONOMIES.length,
      observed_2022_2024_count: observed.length,
      latest_2024_count: observed2024.length,
      distinct_from_current_eurostat_accepted_count: observed.filter((row) => !row.already_eurostat_production_accepted).length,
      paired_2024_peer_count: scored.length,
      production_supported_country_count_added: 0,
    },
    gdp_denominator_discovery: {
      dataflow: GDP_FLOW,
      candidates: candidateEvidence,
      selected_indicator: gdpIndicator,
    },
    shadow_methodology: methodology,
    shadow_methodology_hash: methodologyHash,
    shadow_distribution: {
      minimum_pct_gdp: ratios[0],
      p25_pct_gdp: Number(quantile(ratios, 0.25).toFixed(6)),
      median_pct_gdp: Number(quantile(ratios, 0.5).toFixed(6)),
      p75_pct_gdp: Number(quantile(ratios, 0.75).toFixed(6)),
      maximum_pct_gdp: ratios[ratios.length - 1],
    },
    shadow_countries: scored,
    coverage,
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report, null, 2))
  console.log(`PASS: ADB EXACT PPG COVERAGE + SAME-SOURCE GDP SHADOW METHODOLOGY - ${scored.length} PEERS - NO WRITES, NO PRODUCTION SCORING`)
  console.log("PASS: ADB EXACT PPG EXTERNAL-DEBT COVERAGE AUDIT COMPLETE - NO WRITES, NO SCORING")
}

main().catch((error) => {
  const report = {
    schema_version: "geomacro-adb-kidb-ppg-fiscal-shadow-error-4.1",
    generated_at: new Date().toISOString(),
    writes_performed: false,
    production_activation_allowed: false,
    scoring_changed: false,
    error: error instanceof Error ? error.message : String(error),
  }
  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
})
