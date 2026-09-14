import fs from "node:fs"

const OUTPUT = process.env.ADB_FISCAL_DISCOVERY_OUTPUT ?? "adb-key-indicators-fiscal-discovery.json"
const API = "https://kidb.adb.org/api"
const RATE_DELAY_MS = 3200
const FLOW_ID = "DF_EXT"
const INDICATOR_CODE = "DT_DOD_DPPG_CD"

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
          "user-agent": "Geomacro-ADB-KIDB-SDMX-Coverage/3.0 (+https://geomacro.live)",
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

function findExactIndicator(payload) {
  let match = null
  walkObjects(payload, (object) => {
    if (match) return
    const code = [object?.id, object?.code, object?.value, object?.key].find(
      (value) => value === INDICATOR_CODE,
    )
    if (!code) return
    const text = primitiveText(object)
    if (!/public and publicly guaranteed/i.test(text)) return
    match = { code: INDICATOR_CODE, text: text.slice(0, 2000), raw: object }
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

async function main() {
  const indicatorsUrl = `${API}/dataflow/indicators/${FLOW_ID}`
  const indicatorsPayload = await (await request(indicatorsUrl)).json()
  const target = findExactIndicator(indicatorsPayload)
  if (!target) {
    throw new Error(`${INDICATOR_CODE} is not the exact Public and publicly guaranteed series in ${FLOW_ID}`)
  }

  await sleep(RATE_DELAY_MS)
  const economyCodes = KIDB_ECONOMIES.map((row) => row.kidb).join("+")
  const dataUrl = `${API}/v5/sdmx/data/ADB,${FLOW_ID}/A.${INDICATOR_CODE}.${economyCodes}?startPeriod=2022&endPeriod=2024&format=sdmx-csv`
  const response = await request(dataUrl, {
    accept: "text/csv,application/vnd.sdmx.data+csv,*/*;q=0.2",
  })
  const csv = parseCsv(await response.text())
  if (csv.length < 2) throw new Error("ADB KIDB exact PPG debt query returned no observations")

  const headers = csv[0]
  const economyIndex = headerIndex(headers, ["ECONOMY_CODE", "REF_AREA", "REFERENCE_AREA"])
  const timeIndex = headerIndex(headers, ["TIME_PERIOD", "TIME"])
  const valueIndex = headerIndex(headers, ["OBS_VALUE", "OBSERVATION_VALUE"])
  const unitIndex = headerIndex(headers, ["UNIT_MEASURE", "UNIT", "UNIT_MEASURE_CODE"])
  const unitMultIndex = headerIndex(headers, ["UNIT_MULT", "UNIT_MULTIPLIER"])
  if ([economyIndex, timeIndex, valueIndex].some((index) => index < 0)) {
    throw new Error(`KIDB SDMX-CSV missing required columns: ${headers.join(",")}`)
  }

  const observations = csv
    .slice(1)
    .map((row) => ({
      economy_code: String(row[economyIndex] ?? "").trim(),
      time_period: String(row[timeIndex] ?? "").trim(),
      value: Number(row[valueIndex]),
      unit: unitIndex >= 0 ? String(row[unitIndex] ?? "").trim() || null : null,
      unit_multiplier: unitMultIndex >= 0 ? String(row[unitMultIndex] ?? "").trim() || null : null,
    }))
    .filter((row) => row.economy_code && row.time_period && Number.isFinite(row.value))

  const latestByEconomy = new Map()
  for (const observation of observations) {
    const current = latestByEconomy.get(observation.economy_code)
    if (!current || observation.time_period > current.time_period) {
      latestByEconomy.set(observation.economy_code, observation)
    }
  }

  const coverage = KIDB_ECONOMIES.map((economy) => {
    const latest = latestByEconomy.get(economy.kidb) ?? null
    return {
      ...economy,
      observed: Boolean(latest),
      latest,
      latest_is_2024: latest?.time_period === "2024",
      already_eurostat_production_accepted: CURRENT_EUROSTAT_ACCEPTED.has(economy.iso3),
    }
  })
  const observed = coverage.filter((row) => row.observed)
  const observed2024 = coverage.filter((row) => row.latest_is_2024)
  const distinctFromEurostat = observed.filter((row) => !row.already_eurostat_production_accepted)
  const units = [...new Set(observations.map((row) => row.unit).filter(Boolean))].sort()
  const multipliers = [...new Set(observations.map((row) => row.unit_multiplier).filter(Boolean))].sort()

  const report = {
    schema_version: "geomacro-adb-kidb-ppg-external-debt-coverage-3.0",
    generated_at: new Date().toISOString(),
    source_candidate: "adb_kidb_sdmx_v5",
    publisher: "Asian Development Bank / Key Indicators Database",
    writes_performed: false,
    production_activation_allowed: false,
    scoring_changed: false,
    api_contract: {
      documentation_url: "https://kidb.adb.org/api",
      indicator_endpoint: indicatorsUrl,
      data_endpoint: dataUrl,
      version: "v5",
      documented_rate_limit: "20 queries/minute",
      enforced_inter_request_delay_ms: RATE_DELAY_MS,
    },
    exact_series: {
      dataflow: FLOW_ID,
      indicator_code: INDICATOR_CODE,
      label_verified: true,
      metadata_text: target.text,
      source_concept: "public_and_publicly_guaranteed_long_term_external_debt",
      units,
      unit_multipliers: multipliers,
    },
    commercial_boundary: {
      status: "REVIEWED_ADB_KEY_INDICATORS_DATA_LIBRARY_CC_BY_3_0_IGO_BOUNDARY",
      rights_reference_urls: [
        "https://data.adb.org/terms-use-data",
        "https://data.adb.org/dataset/india-key-indicators",
      ],
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
      next_required_step: "Define and test a separately versioned external-public-debt vulnerability methodology, then cross-check covered economies against the production sovereign registry before shadow scoring.",
    },
    coverage_summary: {
      requested_kidb_economy_count: KIDB_ECONOMIES.length,
      observed_2022_2024_count: observed.length,
      latest_2024_count: observed2024.length,
      distinct_from_current_eurostat_accepted_count: distinctFromEurostat.length,
      production_supported_country_count_added: 0,
    },
    coverage,
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report, null, 2))
  if (target.code !== INDICATOR_CODE) process.exit(2)
  if (observed.length < 20) {
    console.error(`ADB exact PPG debt coverage has only ${observed.length} observed economies; minimum discovery threshold is 20`)
    process.exit(3)
  }
  console.log("PASS: ADB EXACT PPG EXTERNAL-DEBT COVERAGE AUDIT COMPLETE - NO WRITES, NO SCORING")
}

main().catch((error) => {
  const report = {
    schema_version: "geomacro-adb-kidb-ppg-external-debt-error-3.0",
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
