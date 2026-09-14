import crypto from "node:crypto"
import fs from "node:fs"

const OUTPUT =
  process.env.ADB_PPG_GDP_SHADOW_OUTPUT ??
  "adb-ppg-gdp-methodology-shadow.json"
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function request(url, { accept = "application/json", attempts = 3 } = {}) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          accept,
          "user-agent":
            "Geomacro-ADB-PPG-GDP-Shadow/1.0 (+https://geomacro.live)",
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
  return Object.values(object ?? {})
    .filter((value) => typeof value === "string")
    .join(" | ")
}

function objectCode(object) {
  for (const key of ["code", "id", "value", "key"]) {
    const value = object?.[key]
    if (typeof value === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(value)) {
      return value
    }
  }
  return null
}

function findExactCode(payload, code, labelPattern) {
  let match = null
  walkObjects(payload, (object) => {
    if (match) return
    const values = Object.values(object ?? {}).filter((value) => typeof value === "string")
    if (!values.includes(code)) return
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
  const normalized = headers.map((value) =>
    String(value).trim().toUpperCase().replaceAll(" ", "_"),
  )
  for (const candidate of candidates) {
    const index = normalized.indexOf(candidate)
    if (index >= 0) return index
  }
  return -1
}

function parseObservations(csvText) {
  const csv = parseCsv(csvText)
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
  return csv
    .slice(1)
    .map((row) => ({
      economy_code: String(row[economyIndex] ?? "").trim().toUpperCase(),
      indicator:
        indicatorIndex >= 0
          ? String(row[indicatorIndex] ?? "").trim().toUpperCase()
          : null,
      time_period: String(row[timeIndex] ?? "").trim(),
      value: Number(row[valueIndex]),
      unit:
        unitIndex >= 0 ? String(row[unitIndex] ?? "").trim().toUpperCase() || null : null,
      unit_multiplier:
        unitMultIndex >= 0 ? String(row[unitMultIndex] ?? "").trim() || null : null,
    }))
    .filter((row) => row.economy_code && row.time_period && Number.isFinite(row.value))
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
  if (row.unit !== "USD") {
    throw new Error(
      `Expected USD unit for ${row.indicator ?? "series"}/${row.economy_code}, got ${row.unit}`,
    )
  }
  return row.value * multiplierFactor(row.unit_multiplier)
}

function midrankPercentile(values, value) {
  const less = values.filter((candidate) => candidate < value).length
  const equal = values.filter((candidate) => candidate === value).length
  return Number((((less + 0.5 * equal) / values.length) * 100).toFixed(4))
}

function quantile(sorted, q) {
  if (!sorted.length) return null
  const index = (sorted.length - 1) * q
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

async function main() {
  const economyCodes = KIDB_ECONOMIES.map((row) => row.kidb).join("+")
  const economyMap = new Map(KIDB_ECONOMIES.map((row) => [row.kidb, row.iso3]))

  const debtIndicatorsUrl = `${API}/dataflow/indicators/${DEBT_FLOW}`
  const debtIndicators = await (await request(debtIndicatorsUrl)).json()
  const debtMetadata = findExactCode(
    debtIndicators,
    DEBT_INDICATOR,
    /public and publicly guaranteed/i,
  )
  if (!debtMetadata) {
    throw new Error(`${DEBT_INDICATOR} exact PPG debt metadata missing from ${DEBT_FLOW}`)
  }

  await sleep(RATE_DELAY_MS)
  const gdpIndicatorsUrl = `${API}/dataflow/indicators/${GDP_FLOW}`
  const gdpIndicators = await (await request(gdpIndicatorsUrl)).json()
  const gdpCandidates = findGdpCandidates(gdpIndicators)
  if (!gdpCandidates.length) {
    throw new Error("KIDB DF_NA returned no GDP at current prices candidates")
  }

  await sleep(RATE_DELAY_MS)
  const candidateCodes = gdpCandidates.map((row) => row.code).join("+")
  const probeUrl = `${API}/v5/sdmx/data/ADB,${GDP_FLOW}/A.${candidateCodes}.PHI?startPeriod=${TARGET_PERIOD}&endPeriod=${TARGET_PERIOD}&format=sdmx-csv`
  const probeRows = parseObservations(
    await (
      await request(probeUrl, {
        accept: "text/csv,application/vnd.sdmx.data+csv,*/*;q=0.2",
      })
    ).text(),
  )
  const candidateEvidence = gdpCandidates.map((candidate) => {
    const rows = probeRows.filter((row) => row.indicator === candidate.code)
    return {
      ...candidate,
      observation_count: rows.length,
      units: [...new Set(rows.map((row) => row.unit).filter(Boolean))].sort(),
      unit_multipliers: [
        ...new Set(rows.map((row) => row.unit_multiplier).filter((value) => value != null)),
      ].sort(),
    }
  })
  const usdCandidates = candidateEvidence.filter(
    (row) => row.observation_count > 0 && row.units.length === 1 && row.units[0] === "USD",
  )
  if (usdCandidates.length !== 1) {
    throw new Error(
      `Expected exactly one USD GDP-at-current-prices candidate; got ${usdCandidates.map((row) => row.code).join(",") || "none"}`,
    )
  }
  const gdpIndicator = usdCandidates[0].code

  await sleep(RATE_DELAY_MS)
  const debtUrl = `${API}/v5/sdmx/data/ADB,${DEBT_FLOW}/A.${DEBT_INDICATOR}.${economyCodes}?startPeriod=${TARGET_PERIOD}&endPeriod=${TARGET_PERIOD}&format=sdmx-csv`
  const debtRows = parseObservations(
    await (
      await request(debtUrl, {
        accept: "text/csv,application/vnd.sdmx.data+csv,*/*;q=0.2",
      })
    ).text(),
  ).filter(
    (row) =>
      (row.indicator == null || row.indicator === DEBT_INDICATOR) &&
      row.time_period === TARGET_PERIOD,
  )

  await sleep(RATE_DELAY_MS)
  const gdpUrl = `${API}/v5/sdmx/data/ADB,${GDP_FLOW}/A.${gdpIndicator}.${economyCodes}?startPeriod=${TARGET_PERIOD}&endPeriod=${TARGET_PERIOD}&format=sdmx-csv`
  const gdpRows = parseObservations(
    await (
      await request(gdpUrl, {
        accept: "text/csv,application/vnd.sdmx.data+csv,*/*;q=0.2",
      })
    ).text(),
  ).filter(
    (row) =>
      (row.indicator == null || row.indicator === gdpIndicator) &&
      row.time_period === TARGET_PERIOD,
  )

  const debtByEconomy = new Map(debtRows.map((row) => [row.economy_code, row]))
  const gdpByEconomy = new Map(gdpRows.map((row) => [row.economy_code, row]))
  const paired = []
  for (const economy of KIDB_ECONOMIES) {
    const debt = debtByEconomy.get(economy.kidb)
    const gdp = gdpByEconomy.get(economy.kidb)
    if (!debt || !gdp) continue
    const debtUsd = normalizeUsd(debt)
    const gdpUsd = normalizeUsd(gdp)
    if (!(debtUsd >= 0) || !(gdpUsd > 0)) continue
    const ratioPct = (debtUsd / gdpUsd) * 100
    if (!Number.isFinite(ratioPct) || ratioPct < 0 || ratioPct > 1000) {
      throw new Error(`Implausible PPG debt/GDP ratio for ${economy.kidb}: ${ratioPct}`)
    }
    paired.push({
      kidb: economy.kidb,
      iso3: economy.iso3,
      period: TARGET_PERIOD,
      ppg_external_debt_usd: debtUsd,
      gdp_current_usd: gdpUsd,
      ppg_external_debt_pct_gdp: Number(ratioPct.toFixed(6)),
      debt_unit_multiplier: debt.unit_multiplier,
      gdp_unit_multiplier: gdp.unit_multiplier,
    })
  }

  if (paired.length < MIN_PEERS) {
    throw new Error(
      `ADB same-source PPG debt/GDP peer universe too small: ${paired.length} < ${MIN_PEERS}`,
    )
  }

  const ratioValues = paired
    .map((row) => row.ppg_external_debt_pct_gdp)
    .sort((a, b) => a - b)
  const scored = paired
    .map((row) => ({
      ...row,
      shadow_risk_score: midrankPercentile(
        ratioValues,
        row.ppg_external_debt_pct_gdp,
      ),
    }))
    .sort((a, b) => a.iso3.localeCompare(b.iso3))

  const methodologyPayload = {
    methodology_version: "adb-ppg-external-debt-gdp-percentile-1.0.0-shadow",
    source_id: "adb_kidb_sdmx",
    period: TARGET_PERIOD,
    numerator: {
      dataflow: DEBT_FLOW,
      indicator: DEBT_INDICATOR,
      concept: "public_and_publicly_guaranteed_long_term_external_debt",
    },
    denominator: {
      dataflow: GDP_FLOW,
      indicator: gdpIndicator,
      concept: "gdp_at_current_prices_usd",
    },
    peer_universe: "same-source KIDB economies with both numerator and denominator in the same period",
    score_rule: "midrank percentile of PPG external debt as percent of GDP; higher ratio means higher shadow risk",
    minimum_peer_count: MIN_PEERS,
    cross_source_pooling: false,
    production_module_state_emitted: false,
  }
  const methodologyHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(methodologyPayload))
    .digest("hex")

  const report = {
    schema_version: "geomacro-adb-ppg-gdp-shadow-1.0",
    generated_at: new Date().toISOString(),
    writes_performed: false,
    production_activation_allowed: false,
    production_module_state_emitted: false,
    scoring_changed: false,
    commercial_boundary: {
      status: "KIDB_COMMERCIAL_REUSE_ALLOWED_WITH_ATTRIBUTION",
      exact_terms_url: "https://kidb.adb.org/terms",
      data_library_terms_url: "https://data.adb.org/terms-use-data",
      third_party_content_excluded: true,
      raw_redistribution_default: false,
    },
    source_contract: {
      api: API,
      documented_rate_limit: "20 queries/minute",
      enforced_inter_request_delay_ms: RATE_DELAY_MS,
      target_period: TARGET_PERIOD,
      debt_metadata: debtMetadata,
      gdp_candidate_probe_url: probeUrl,
      gdp_candidates: candidateEvidence,
      selected_gdp_indicator: gdpIndicator,
      debt_query_url: debtUrl,
      gdp_query_url: gdpUrl,
    },
    methodology: methodologyPayload,
    methodology_hash: methodologyHash,
    coverage: {
      kidb_economy_count: KIDB_ECONOMIES.length,
      debt_2024_economy_count: debtByEconomy.size,
      gdp_2024_economy_count: gdpByEconomy.size,
      paired_peer_count: scored.length,
      iso3_crosswalk_count: scored.filter((row) => economyMap.has(row.kidb)).length,
    },
    distribution: {
      minimum_pct_gdp: ratioValues[0],
      p25_pct_gdp: Number(quantile(ratioValues, 0.25).toFixed(6)),
      median_pct_gdp: Number(quantile(ratioValues, 0.5).toFixed(6)),
      p75_pct_gdp: Number(quantile(ratioValues, 0.75).toFixed(6)),
      maximum_pct_gdp: ratioValues[ratioValues.length - 1],
    },
    countries: scored,
    claim_boundary: {
      sovereign_registry_not_yet_cross_checked: true,
      risk_gate_support_not_implied: true,
      direct_replacement_for_wdi_or_eurostat_debt: false,
      same_source_ratio_only: true,
      next_required_step:
        "Cross-check paired ISO3 rows against the production sovereign registry and run an end-to-end country-review shadow census. Only then may a guarded alternate sovereign_fiscal module state be proposed.",
    },
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report, null, 2))
  console.log(
    `PASS: ADB PPG/GDP SHADOW METHODOLOGY PROOF - ${scored.length} same-source peers, NO WRITES, NO PRODUCTION SCORING`,
  )
}

main().catch((error) => {
  const report = {
    schema_version: "geomacro-adb-ppg-gdp-shadow-error-1.0",
    generated_at: new Date().toISOString(),
    writes_performed: false,
    production_activation_allowed: false,
    production_module_state_emitted: false,
    scoring_changed: false,
    error: error instanceof Error ? error.message : String(error),
  }
  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
})
