import crypto from "node:crypto"
import fs from "node:fs"

const OUTPUT = process.env.ADB_FISCAL_DISCOVERY_OUTPUT ?? "adb-key-indicators-fiscal-discovery.json"
const API = "https://kidb.adb.org/api"
const RATE_DELAY_MS = 3200
const DEBT_FLOW = "DF_EXT"
const DEBT_INDICATOR = "DT_DOD_DPPG_CD"
const START_YEAR = 2022
const END_YEAR = 2024
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
          "user-agent": "Geomacro-ADB-KIDB-Fiscal-Proof/6.0 (+https://geomacro.live)",
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

function directCode(object) {
  for (const key of ["code", "id"]) {
    const value = object?.[key]
    if (typeof value === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(value)) return value
  }
  return null
}

function findExactCode(payload, code, labelPattern = null) {
  let match = null
  walkObjects(payload, (object) => {
    if (match || !Object.values(object ?? {}).includes(code)) return
    const text = primitiveText(object)
    if (labelPattern && !labelPattern.test(text)) return
    match = { code, text: text.replace(/\s+/g, " ").slice(0, 2200) }
  })
  return match
}

function fiscalCandidate(object) {
  const code = directCode(object)
  if (!code) return null
  const text = primitiveText(object).replace(/\s+/g, " ").trim()
  const lower = text.toLowerCase()
  if (!lower.includes("gdp")) return null

  const isTotal = /\btotal revenue\b|\btotal expenditure\b/i.test(text)
  let role = null
  if (/\btotal revenue\b.*(?:%|percent).*gdp/i.test(text) || /^revenue\s*\(% of gdp\)/i.test(text) || /\brevenue\b.*percent of gdp/i.test(text)) role = "revenue"
  if (/\btotal expenditure\b.*(?:%|percent).*gdp/i.test(text) || /^expenditure\s*\(% of gdp\)/i.test(text) || /\bexpenditure\b.*percent of gdp/i.test(text)) role = "expenditure"
  if (!role) return null

  if (/tax revenue|health expenditure|education expenditure|military expenditure|household expenditure|consumption expenditure/i.test(text)) return null
  const family = isTotal ? "total_revenue_expenditure_pct_gdp" : "revenue_expenditure_pct_gdp"
  return { code, role, family, text: text.slice(0, 2200) }
}

function findFiscalCandidates(payload) {
  const byKey = new Map()
  walkObjects(payload, (object) => {
    const row = fiscalCandidate(object)
    if (!row) return
    const key = `${row.code}:${row.role}`
    if (!byKey.has(key) || row.text.length > byKey.get(key).text.length) byKey.set(key, row)
  })
  return [...byKey.values()].sort((a, b) => a.family.localeCompare(b.family) || a.role.localeCompare(b.role) || a.code.localeCompare(b.code))
}

function flowIdsFromRegistry(text) {
  return [...new Set(text.match(/DF_[A-Z0-9_]+/g) ?? [])].sort()
}

function indicatorCodesFromFlow(payload) {
  const codes = new Set()
  if (Array.isArray(payload)) {
    for (const row of payload) if (typeof row?.code === "string") codes.add(row.code)
  } else {
    walkObjects(payload, (object) => {
      if (typeof object?.code === "string") codes.add(object.code)
    })
  }
  return codes
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
  if (/^\s*</.test(text)) throw new Error(`KIDB returned XML/error payload instead of SDMX-CSV: ${text.slice(0, 500).replace(/\s+/g, " ")}`)
  const csv = parseCsv(text)
  if (csv.length < 2) return []
  const headers = csv[0]
  const economyIndex = headerIndex(headers, ["ECONOMY_CODE", "REF_AREA", "REFERENCE_AREA"])
  const indicatorIndex = headerIndex(headers, ["INDICATOR", "INDICATOR_CODE"])
  const timeIndex = headerIndex(headers, ["TIME_PERIOD", "TIME"])
  const valueIndex = headerIndex(headers, ["OBS_VALUE", "OBSERVATION_VALUE"])
  const unitIndex = headerIndex(headers, ["UNIT_MEASURE", "UNIT", "UNIT_MEASURE_CODE"])
  if ([economyIndex, timeIndex, valueIndex].some((index) => index < 0)) throw new Error(`KIDB SDMX-CSV missing required columns: ${headers.join(",")}`)
  return csv.slice(1).map((row) => ({
    economy_code: String(row[economyIndex] ?? "").trim().toUpperCase(),
    indicator: indicatorIndex >= 0 ? String(row[indicatorIndex] ?? "").trim().toUpperCase() : defaultIndicator,
    time_period: String(row[timeIndex] ?? "").trim(),
    value: Number(row[valueIndex]),
    unit: unitIndex >= 0 ? String(row[unitIndex] ?? "").trim() || null : null,
  })).filter((row) => row.economy_code && row.time_period && Number.isFinite(row.value))
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

async function discoverFiscalPairs() {
  await sleep(RATE_DELAY_MS)
  const codelistUrl = `${API}/v5/sdmx/structure/codelist/ADB/CL_KIDB_INDICATORS/+?format=sdmx-json`
  const codelist = JSON.parse(await (await request(codelistUrl)).text())
  const candidates = findFiscalCandidates(codelist)
  const revenues = candidates.filter((row) => row.role === "revenue")
  const expenditures = candidates.filter((row) => row.role === "expenditure")
  if (!revenues.length || !expenditures.length) throw new Error(`KIDB fiscal codelist discovery incomplete: ${JSON.stringify(candidates)}`)

  await sleep(RATE_DELAY_MS)
  const registryUrl = `${API}/v5/sdmx/structure/dataflow/all/all/+?format=sdmx-json`
  const registryText = await (await request(registryUrl)).text()
  const flows = flowIdsFromRegistry(registryText)
  if (!flows.length) throw new Error("KIDB dataflow registry returned no DF_* identifiers")

  const candidateCodes = new Set(candidates.map((row) => row.code))
  const owners = new Map()
  const flowAudit = []
  for (const flow of flows) {
    await sleep(RATE_DELAY_MS)
    try {
      const payload = await (await request(`${API}/dataflow/indicators/${flow}`)).json()
      const codes = indicatorCodesFromFlow(payload)
      const matches = [...candidateCodes].filter((code) => codes.has(code))
      flowAudit.push({ flow, status: "OK", matches })
      for (const code of matches) {
        if (!owners.has(code)) owners.set(code, [])
        owners.get(code).push(flow)
      }
      if ([...candidateCodes].every((code) => owners.has(code))) break
    } catch (error) {
      flowAudit.push({ flow, status: "ERROR", error: error instanceof Error ? error.message : String(error) })
    }
  }

  const pairs = []
  for (const revenue of revenues) {
    for (const expenditure of expenditures) {
      if (revenue.family !== expenditure.family) continue
      const revenueFlows = owners.get(revenue.code) ?? []
      const expenditureFlows = owners.get(expenditure.code) ?? []
      const commonFlows = revenueFlows.filter((flow) => expenditureFlows.includes(flow))
      for (const flow of commonFlows) pairs.push({ family: revenue.family, flow, revenue, expenditure })
    }
  }
  if (!pairs.length) throw new Error(`No same-flow KIDB revenue/expenditure pair found: ${JSON.stringify({ candidates, owners: Object.fromEntries(owners) })}`)
  return { candidates, pairs, flowAudit, codelistUrl, registryUrl }
}

async function auditPair(pair, economyCodes) {
  await sleep(RATE_DELAY_MS)
  const url = `${API}/v5/sdmx/data/ADB,${pair.flow}/A.${pair.revenue.code}+${pair.expenditure.code}.${economyCodes}?startPeriod=${START_YEAR}&endPeriod=${END_YEAR}&format=sdmx-csv`
  try {
    const rows = parseObservations(await (await request(url, { accept: "text/csv,*/*;q=0.2" })).text())
    const byKey = new Map(rows.map((row) => [`${row.indicator}:${row.economy_code}:${row.time_period}`, row]))
    const yearCoverage = []
    for (let year = END_YEAR; year >= START_YEAR; year--) {
      const paired = []
      for (const economy of KIDB_ECONOMIES) {
        const revenue = byKey.get(`${pair.revenue.code}:${economy.kidb}:${year}`)
        const expenditure = byKey.get(`${pair.expenditure.code}:${economy.kidb}:${year}`)
        if (!revenue || !expenditure) continue
        if (revenue.value < -50 || revenue.value > 200 || expenditure.value < -50 || expenditure.value > 200) continue
        paired.push({
          kidb: economy.kidb,
          iso3: economy.iso3,
          year,
          revenue_pct_gdp: revenue.value,
          expenditure_pct_gdp: expenditure.value,
          fiscal_balance_pct_gdp: Number((revenue.value - expenditure.value).toFixed(6)),
          deficit_pressure_pct_gdp: Number(Math.max(0, expenditure.value - revenue.value).toFixed(6)),
          revenue_unit: revenue.unit,
          expenditure_unit: expenditure.unit,
        })
      }
      yearCoverage.push({ year, peer_count: paired.length, paired })
    }
    const selectedYear = yearCoverage.find((row) => row.peer_count >= MIN_PEERS) ?? null
    return { pair, url, status: selectedYear ? "ELIGIBLE_SHADOW" : "INSUFFICIENT_PEERS", year_coverage: yearCoverage.map(({ year, peer_count }) => ({ year, peer_count })), selected: selectedYear }
  } catch (error) {
    return { pair, url, status: "FAIL_CLOSED", error: error instanceof Error ? error.message : String(error) }
  }
}

async function main() {
  const economyCodes = KIDB_ECONOMIES.map((row) => row.kidb).join("+")

  const debtIndicatorsUrl = `${API}/dataflow/indicators/${DEBT_FLOW}`
  const debtIndicators = await (await request(debtIndicatorsUrl)).json()
  const debtMetadata = findExactCode(debtIndicators, DEBT_INDICATOR, /public and publicly guaranteed/i)
  if (!debtMetadata) throw new Error(`${DEBT_INDICATOR} exact PPG series missing from ${DEBT_FLOW}`)

  await sleep(RATE_DELAY_MS)
  const debtHistoryUrl = `${API}/v5/sdmx/data/ADB,${DEBT_FLOW}/A.${DEBT_INDICATOR}.${economyCodes}?startPeriod=${START_YEAR}&endPeriod=${END_YEAR}&format=sdmx-csv`
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
    latest_is_2024: latestDebt.get(economy.kidb)?.time_period === "2024",
    already_eurostat_production_accepted: CURRENT_EUROSTAT_ACCEPTED.has(economy.iso3),
  }))
  const observed = coverage.filter((row) => row.observed)
  const observed2024 = coverage.filter((row) => row.latest_is_2024)

  const discovery = await discoverFiscalPairs()
  const audits = []
  for (const pair of discovery.pairs) audits.push(await auditPair(pair, economyCodes))
  const eligible = audits.filter((row) => row.status === "ELIGIBLE_SHADOW")
  if (!eligible.length) throw new Error(`No KIDB same-family revenue/expenditure pair reaches ${MIN_PEERS} peers: ${JSON.stringify(audits)}`)
  eligible.sort((a, b) => b.selected.year - a.selected.year || b.selected.peer_count - a.selected.peer_count || a.pair.family.localeCompare(b.pair.family))
  const chosen = eligible[0]
  if (eligible.length > 1 && eligible[1].selected.year === chosen.selected.year && eligible[1].selected.peer_count === chosen.selected.peer_count && eligible[1].pair.family === chosen.pair.family && eligible[1].pair.flow !== chosen.pair.flow) {
    throw new Error(`Ambiguous top KIDB fiscal pair: ${JSON.stringify(eligible.slice(0, 2))}`)
  }

  const pressureValues = chosen.selected.paired.map((row) => row.deficit_pressure_pct_gdp).sort((a, b) => a - b)
  const scored = chosen.selected.paired.map((row) => ({
    ...row,
    shadow_risk_score: midrankPercentile(pressureValues, row.deficit_pressure_pct_gdp),
  })).sort((a, b) => a.iso3.localeCompare(b.iso3))
  if (scored.some((row) => row.shadow_risk_score < 0 || row.shadow_risk_score > 100)) throw new Error("ADB fiscal-balance percentile outside 0..100")

  const methodology = {
    methodology_version: "adb-kidb-fiscal-balance-percentile-1.0.0-shadow",
    source_id: "adb_kidb_sdmx_v5",
    dataflow: chosen.pair.flow,
    revenue_indicator: chosen.pair.revenue.code,
    expenditure_indicator: chosen.pair.expenditure.code,
    indicator_family: chosen.pair.family,
    reference_year: chosen.selected.year,
    fiscal_balance_formula: "revenue_pct_gdp - expenditure_pct_gdp",
    risk_input: "max(0, expenditure_pct_gdp - revenue_pct_gdp)",
    score_rule: "midrank percentile of deficit pressure; larger deficit means higher shadow risk",
    minimum_peer_count: MIN_PEERS,
    cross_source_pooling: false,
    production_module_state_emitted: false,
    ppg_external_debt_used_in_score: false,
  }
  const methodologyHash = crypto.createHash("sha256").update(JSON.stringify(methodology)).digest("hex")

  const report = {
    schema_version: "geomacro-adb-kidb-sovereign-fiscal-shadow-6.0",
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
      fiscal_codelist_endpoint: discovery.codelistUrl,
      dataflow_registry_endpoint: discovery.registryUrl,
    },
    exact_series: {
      dataflow: DEBT_FLOW,
      indicator_code: DEBT_INDICATOR,
      label_verified: true,
      metadata_text: debtMetadata.text,
      source_concept: "public_and_publicly_guaranteed_long_term_external_debt",
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
      ppg_external_debt_is_evidence_only_in_this_methodology: true,
    },
    coverage_summary: {
      requested_kidb_economy_count: KIDB_ECONOMIES.length,
      observed_2022_2024_count: observed.length,
      latest_2024_count: observed2024.length,
      distinct_from_current_eurostat_accepted_count: observed.filter((row) => !row.already_eurostat_production_accepted).length,
      fiscal_shadow_peer_count: scored.length,
      fiscal_shadow_reference_year: chosen.selected.year,
      production_supported_country_count_added: 0,
    },
    fiscal_discovery: {
      candidates: discovery.candidates,
      flow_audit: discovery.flowAudit,
      pair_audits: audits.map((row) => ({ pair: row.pair, url: row.url, status: row.status, year_coverage: row.year_coverage, error: row.error ?? null })),
      selected_pair: chosen.pair,
    },
    shadow_methodology: methodology,
    shadow_methodology_hash: methodologyHash,
    shadow_distribution: {
      minimum_deficit_pressure_pct_gdp: pressureValues[0],
      p25_deficit_pressure_pct_gdp: Number(quantile(pressureValues, 0.25).toFixed(6)),
      median_deficit_pressure_pct_gdp: Number(quantile(pressureValues, 0.5).toFixed(6)),
      p75_deficit_pressure_pct_gdp: Number(quantile(pressureValues, 0.75).toFixed(6)),
      maximum_deficit_pressure_pct_gdp: pressureValues[pressureValues.length - 1],
    },
    shadow_countries: scored,
    coverage,
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report, null, 2))
  console.log(`PASS: ADB KIDB FISCAL-BALANCE SHADOW METHODOLOGY - ${scored.length} PEERS IN ${chosen.selected.year} - NO WRITES, NO PRODUCTION SCORING`)
  console.log("PASS: ADB EXACT PPG EXTERNAL-DEBT COVERAGE AUDIT COMPLETE - NO WRITES, NO SCORING")
}

main().catch((error) => {
  const report = {
    schema_version: "geomacro-adb-kidb-sovereign-fiscal-shadow-error-6.0",
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
