import crypto from "node:crypto"
import fs from "node:fs"

const OUTPUT = process.env.ADB_FISCAL_DISCOVERY_OUTPUT ?? "adb-key-indicators-fiscal-discovery.json"
const API = "https://kidb.adb.org/api"
const RATE_DELAY_MS = 3200
const DEBT_FLOW = "DF_EXT"
const DEBT_INDICATOR = "DT_DOD_DPPG_CD"
const TARGET_PERIOD = "2024"
const QUERY_START_PERIOD = "2022"
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
          "user-agent": "Geomacro-ADB-KIDB-Fiscal-Proof/5.0 (+https://geomacro.live)",
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
    if (match) return
    if (!Object.values(object ?? {}).includes(code)) return
    const text = primitiveText(object)
    if (labelPattern && !labelPattern.test(text)) return
    match = { code, text: text.slice(0, 2200) }
  })
  return match
}

function findUsdSizeCandidates(payload) {
  const candidates = new Map()
  walkObjects(payload, (object) => {
    const code = directCode(object)
    if (!code) return
    const text = primitiveText(object)
    const normalized = text.replace(/\s+/g, " ")
    let concept = null
    let priority = 99
    if (/Gross Domestic Product\s*\(current \$ million\)/i.test(normalized)) {
      concept = "gdp_current_usd"
      priority = 1
    } else if (/GDP.*current (?:US )?dollar/i.test(normalized) && !/per capita/i.test(normalized)) {
      concept = "gdp_current_usd"
      priority = 2
    } else if (/Gross National Income\s*\(current \$ million\)/i.test(normalized)) {
      concept = "gni_current_usd"
      priority = 3
    } else if (/GNI.*current (?:US )?dollar/i.test(normalized) && !/per capita/i.test(normalized)) {
      concept = "gni_current_usd"
      priority = 4
    }
    if (!concept) return
    const existing = candidates.get(code)
    const row = { code, concept, priority, text: normalized.slice(0, 2200) }
    if (!existing || priority < existing.priority) candidates.set(code, row)
  })
  return [...candidates.values()].sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code))
}

function flowIdsFromRegistry(text) {
  return [...new Set(text.match(/DF_[A-Z0-9_]+/g) ?? [])].sort()
}

function indicatorCodesFromFlow(payload) {
  const codes = new Set()
  if (Array.isArray(payload)) {
    for (const row of payload) {
      if (typeof row?.code === "string") codes.add(row.code)
    }
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
  if (/^\s*</.test(text)) {
    throw new Error(`KIDB returned XML/error payload instead of SDMX-CSV: ${text.slice(0, 500).replace(/\s+/g, " ")}`)
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

async function discoverDenominator() {
  await sleep(RATE_DELAY_MS)
  const codelistUrl = `${API}/v5/sdmx/structure/codelist/ADB/CL_KIDB_INDICATORS/+?format=sdmx-json`
  const codelist = JSON.parse(await (await request(codelistUrl)).text())
  const candidates = findUsdSizeCandidates(codelist)
  if (!candidates.length) {
    throw new Error("KIDB indicator codelist has no exact current-US-dollar GDP/GNI size candidate")
  }

  await sleep(RATE_DELAY_MS)
  const registryUrl = `${API}/v5/sdmx/structure/dataflow/all/all/+?format=sdmx-json`
  const registryText = await (await request(registryUrl)).text()
  const flows = flowIdsFromRegistry(registryText)
  if (!flows.length) throw new Error("KIDB dataflow registry returned no DF_* identifiers")

  const candidateByCode = new Map(candidates.map((row) => [row.code, row]))
  const flowAudit = []
  const owners = []
  const orderedFlows = ["DF_NA", ...flows.filter((flow) => flow !== "DF_NA")]
  for (const flow of orderedFlows) {
    await sleep(RATE_DELAY_MS)
    try {
      const payload = await (await request(`${API}/dataflow/indicators/${flow}`)).json()
      const codes = indicatorCodesFromFlow(payload)
      const matches = [...candidateByCode.keys()].filter((code) => codes.has(code))
      flowAudit.push({ flow, status: "OK", matches })
      for (const code of matches) owners.push({ flow, ...candidateByCode.get(code) })
      if (owners.some((row) => row.priority === 1)) break
    } catch (error) {
      flowAudit.push({ flow, status: "ERROR", error: error instanceof Error ? error.message : String(error) })
    }
  }
  if (!owners.length) {
    throw new Error(`KIDB current-US-dollar denominator candidates have no owning dataflow: ${JSON.stringify(candidates)}`)
  }

  const orderedOwners = owners.sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code))
  const evidence = []
  for (const candidate of orderedOwners) {
    await sleep(RATE_DELAY_MS)
    const probeUrl = `${API}/v5/sdmx/data/ADB,${candidate.flow}/A.${candidate.code}.PHI?startPeriod=${QUERY_START_PERIOD}&endPeriod=${TARGET_PERIOD}&format=sdmx-csv`
    try {
      const rows = parseObservations(
        await (await request(probeUrl, { accept: "text/csv,*/*;q=0.2" })).text(),
        candidate.code,
      ).filter((row) => row.indicator === candidate.code)
      const latest = rows.sort((a, b) => b.time_period.localeCompare(a.time_period))[0] ?? null
      evidence.push({
        ...candidate,
        probe_url: probeUrl,
        status: "OK",
        latest,
        units: [...new Set(rows.map((row) => row.unit).filter(Boolean))].sort(),
        unit_multipliers: [...new Set(rows.map((row) => row.unit_multiplier).filter((value) => value != null))].sort(),
      })
    } catch (error) {
      evidence.push({ ...candidate, probe_url: probeUrl, status: "FAIL_CLOSED", error: error instanceof Error ? error.message : String(error) })
    }
  }

  const usable = evidence.filter((row) => row.status === "OK" && row.latest?.time_period === TARGET_PERIOD && row.units?.length === 1 && row.units[0] === "USD")
  if (!usable.length) {
    throw new Error(`No exact KIDB current-US-dollar GDP/GNI denominator has 2024 USD evidence: ${JSON.stringify(evidence)}`)
  }
  usable.sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code))
  const bestPriority = usable[0].priority
  const best = usable.filter((row) => row.priority === bestPriority)
  if (best.length !== 1) {
    throw new Error(`Ambiguous KIDB denominator at best priority ${bestPriority}: ${JSON.stringify(best)}`)
  }
  return { selected: best[0], candidates, evidence, flowAudit, codelistUrl, registryUrl }
}

async function main() {
  const economyCodes = KIDB_ECONOMIES.map((row) => row.kidb).join("+")

  const debtIndicatorsUrl = `${API}/dataflow/indicators/${DEBT_FLOW}`
  const debtIndicators = await (await request(debtIndicatorsUrl)).json()
  const debtMetadata = findExactCode(debtIndicators, DEBT_INDICATOR, /public and publicly guaranteed/i)
  if (!debtMetadata) throw new Error(`${DEBT_INDICATOR} exact PPG series missing from ${DEBT_FLOW}`)

  await sleep(RATE_DELAY_MS)
  const debtHistoryUrl = `${API}/v5/sdmx/data/ADB,${DEBT_FLOW}/A.${DEBT_INDICATOR}.${economyCodes}?startPeriod=${QUERY_START_PERIOD}&endPeriod=${TARGET_PERIOD}&format=sdmx-csv`
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

  const denominatorDiscovery = await discoverDenominator()
  const denominator = denominatorDiscovery.selected

  await sleep(RATE_DELAY_MS)
  const denominatorUrl = `${API}/v5/sdmx/data/ADB,${denominator.flow}/A.${denominator.code}.${economyCodes}?startPeriod=${QUERY_START_PERIOD}&endPeriod=${TARGET_PERIOD}&format=sdmx-csv`
  const denominatorRows = parseObservations(
    await (await request(denominatorUrl, { accept: "text/csv,*/*;q=0.2" })).text(),
    denominator.code,
  ).filter((row) => row.time_period === TARGET_PERIOD)
  const denominatorByEconomy = new Map(denominatorRows.map((row) => [row.economy_code, row]))

  const peers = []
  for (const economy of KIDB_ECONOMIES) {
    const debt = latestDebt.get(economy.kidb)
    const size = denominatorByEconomy.get(economy.kidb)
    if (!debt || debt.time_period !== TARGET_PERIOD || !size) continue
    const debtUsd = normalizeUsd(debt)
    const sizeUsd = normalizeUsd(size)
    if (!(sizeUsd > 0) || debtUsd < 0) continue
    const ratio = (debtUsd / sizeUsd) * 100
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1000) {
      throw new Error(`Implausible PPG debt/${denominator.concept} ratio for ${economy.iso3}: ${ratio}`)
    }
    peers.push({
      kidb: economy.kidb,
      iso3: economy.iso3,
      period: TARGET_PERIOD,
      ppg_external_debt_usd: debtUsd,
      denominator_usd: sizeUsd,
      denominator_concept: denominator.concept,
      ppg_external_debt_pct_denominator: Number(ratio.toFixed(6)),
    })
  }
  if (peers.length < MIN_PEERS) throw new Error(`Same-source ADB peer universe too small: ${peers.length} < ${MIN_PEERS}`)

  const ratios = peers.map((row) => row.ppg_external_debt_pct_denominator).sort((a, b) => a - b)
  const scored = peers.map((row) => ({
    ...row,
    shadow_risk_score: midrankPercentile(ratios, row.ppg_external_debt_pct_denominator),
  })).sort((a, b) => a.iso3.localeCompare(b.iso3))
  if (scored.some((row) => row.shadow_risk_score < 0 || row.shadow_risk_score > 100)) {
    throw new Error("ADB shadow percentile produced score outside 0..100")
  }

  const methodology = {
    methodology_version: "adb-ppg-external-debt-size-percentile-1.0.0-shadow",
    numerator: { dataflow: DEBT_FLOW, indicator: DEBT_INDICATOR, concept: "public_and_publicly_guaranteed_long_term_external_debt" },
    denominator: { dataflow: denominator.flow, indicator: denominator.code, concept: denominator.concept },
    period: TARGET_PERIOD,
    peer_universe: "same-source KIDB economies with same-period numerator and denominator",
    score_rule: `midrank percentile of PPG external debt as percent of ${denominator.concept}; higher ratio means higher risk`,
    minimum_peer_count: MIN_PEERS,
    cross_source_pooling: false,
    production_module_state_emitted: false,
  }
  const methodologyHash = crypto.createHash("sha256").update(JSON.stringify(methodology)).digest("hex")

  const report = {
    schema_version: "geomacro-adb-kidb-ppg-fiscal-shadow-5.0",
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
      denominator_codelist_endpoint: denominatorDiscovery.codelistUrl,
      dataflow_registry_endpoint: denominatorDiscovery.registryUrl,
      denominator_data_endpoint: denominatorUrl,
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
    denominator_discovery: {
      selected: denominator,
      candidates: denominatorDiscovery.candidates,
      probe_evidence: denominatorDiscovery.evidence,
      flow_audit: denominatorDiscovery.flowAudit,
    },
    shadow_methodology: methodology,
    shadow_methodology_hash: methodologyHash,
    shadow_distribution: {
      minimum_pct: ratios[0],
      p25_pct: Number(quantile(ratios, 0.25).toFixed(6)),
      median_pct: Number(quantile(ratios, 0.5).toFixed(6)),
      p75_pct: Number(quantile(ratios, 0.75).toFixed(6)),
      maximum_pct: ratios[ratios.length - 1],
    },
    shadow_countries: scored,
    coverage,
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report, null, 2))
  console.log(`PASS: ADB EXACT PPG COVERAGE + SAME-SOURCE SIZE SHADOW METHODOLOGY - ${scored.length} PEERS - NO WRITES, NO PRODUCTION SCORING`)
  console.log("PASS: ADB EXACT PPG EXTERNAL-DEBT COVERAGE AUDIT COMPLETE - NO WRITES, NO SCORING")
}

main().catch((error) => {
  const report = {
    schema_version: "geomacro-adb-kidb-ppg-fiscal-shadow-error-5.0",
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
