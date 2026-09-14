import fs from "node:fs"

const OUTPUT = process.env.ADB_FISCAL_DISCOVERY_OUTPUT ?? "adb-key-indicators-fiscal-discovery.json"
const API = "https://kidb.adb.org/api"
const RATE_DELAY_MS = 3200
const SAMPLE_ECONOMIES = [
  { iso3: "IND", kidb: "IND" },
  { iso3: "IDN", kidb: "INO" },
  { iso3: "PHL", kidb: "PHI" },
  { iso3: "PAK", kidb: "PAK" },
  { iso3: "BGD", kidb: "BAN" },
  { iso3: "LKA", kidb: "SRI" },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function request(url, { accept = "application/json", attempts = 3 } = {}) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          accept,
          "user-agent": "Geomacro-ADB-KIDB-SDMX-Discovery/2.1 (+https://geomacro.live)",
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

function primitiveStrings(object) {
  if (!object || typeof object !== "object" || Array.isArray(object)) return []
  return Object.entries(object)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => ({ key, value }))
}

function walkObjects(node, visit) {
  if (!node || typeof node !== "object") return
  if (!Array.isArray(node)) visit(node)
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") walkObjects(value, visit)
  }
}

function labelText(object) {
  return primitiveStrings(object).map(({ value }) => value).join(" | ")
}

function objectCode(object) {
  for (const key of ["id", "code", "value", "key"]) {
    const value = object?.[key]
    if (typeof value === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(value)) return value
  }
  for (const { value } of primitiveStrings(object)) {
    if (/^[A-Z][A-Z0-9_]{2,63}$/.test(value) && !value.startsWith("DF_")) return value
  }
  return null
}

function findPpgDebtObjects(payload) {
  const rows = []
  const seen = new Set()
  walkObjects(payload, (object) => {
    const text = labelText(object)
    if (!/public[^|]{0,100}publicly guaranteed/i.test(text)) return
    const code = objectCode(object)
    if (!code || seen.has(code)) return
    seen.add(code)
    rows.push({ code, text: text.slice(0, 1600), raw: object })
  })
  return rows
}

function findFlowIds(payloadText) {
  return [...new Set(payloadText.match(/DF_[A-Z0-9_]+/g) ?? [])].sort()
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
  const dataflowResponse = await request(`${API}/v5/sdmx/structure/dataflow/all/all/+?format=sdmx-json`)
  const dataflowText = await dataflowResponse.text()
  const flowIds = findFlowIds(dataflowText)
  if (!flowIds.length) throw new Error("KIDB v5 dataflow registry returned no DF_* identifiers")

  await sleep(RATE_DELAY_MS)
  const codelistResponse = await request(`${API}/v5/sdmx/structure/codelist/ADB/CL_KIDB_INDICATORS/+?format=sdmx-json`)
  const codelist = JSON.parse(await codelistResponse.text())
  const codelistCandidates = findPpgDebtObjects(codelist)

  let owningFlow = null
  let targetIndicator = null
  const flowAudit = []
  for (const flowId of flowIds) {
    await sleep(RATE_DELAY_MS)
    const url = `${API}/dataflow/indicators/${encodeURIComponent(flowId)}`
    let payload
    try {
      payload = await (await request(url)).json()
    } catch (error) {
      flowAudit.push({ flow_id: flowId, status: "ERROR", error: error instanceof Error ? error.message : String(error) })
      continue
    }
    const matches = findPpgDebtObjects(payload)
    flowAudit.push({
      flow_id: flowId,
      status: "OK",
      public_guaranteed_matches: matches.map((row) => ({ code: row.code, text: row.text })),
    })
    if (matches.length) {
      owningFlow = flowId
      targetIndicator = matches[0]
      break
    }
  }

  if (!owningFlow || !targetIndicator) {
    const report = {
      schema_version: "geomacro-adb-kidb-fiscal-discovery-2.1",
      generated_at: new Date().toISOString(),
      source_candidate: "adb_kidb_sdmx_v5",
      writes_performed: false,
      production_activation_allowed: false,
      scoring_changed: false,
      api_contract: {
        documentation_url: "https://kidb.adb.org/api",
        base_url: API,
        version: "v5",
        documented_rate_limit: "20 queries/minute",
        enforced_inter_request_delay_ms: RATE_DELAY_MS,
        discovered_dataflow_count: flowIds.length,
      },
      codelist_public_guaranteed_candidates: codelistCandidates.map((row) => ({ code: row.code, text: row.text })),
      owning_flow: null,
      target_indicator: null,
      flow_audit: flowAudit,
      fail_closed_reason: "No exact public/publicly-guaranteed external-debt series could be mapped to an owning KIDB dataflow.",
    }
    fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
    console.log(JSON.stringify(report, null, 2))
    process.exit(2)
  }

  const economyCodes = SAMPLE_ECONOMIES.map((row) => row.kidb).join("+")
  await sleep(RATE_DELAY_MS)
  const dataUrl = `${API}/v5/sdmx/data/ADB,${owningFlow}/A.${targetIndicator.code}.${economyCodes}?startPeriod=2022&endPeriod=2024&format=sdmx-csv`
  const dataResponse = await request(dataUrl, {
    accept: "text/csv,application/vnd.sdmx.data+csv,*/*;q=0.2",
  })
  const csvText = await dataResponse.text()
  const csv = parseCsv(csvText)
  if (csv.length < 2) throw new Error("KIDB PPG external-debt sample query returned no observations")

  const headers = csv[0]
  const economyIndex = headerIndex(headers, ["ECONOMY_CODE", "REF_AREA", "REFERENCE_AREA"])
  const timeIndex = headerIndex(headers, ["TIME_PERIOD", "TIME"])
  const valueIndex = headerIndex(headers, ["OBS_VALUE", "OBSERVATION_VALUE"])
  const unitIndex = headerIndex(headers, ["UNIT_MEASURE", "UNIT", "UNIT_MEASURE_CODE"])
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
    }))
    .filter((row) => row.economy_code && row.time_period && Number.isFinite(row.value))

  const observedEconomies = [...new Set(observations.map((row) => row.economy_code))].sort()
  const units = [...new Set(observations.map((row) => row.unit).filter(Boolean))].sort()
  const sampleCoverage = SAMPLE_ECONOMIES.map((country) => ({
    ...country,
    observed: observedEconomies.includes(country.kidb),
    latest:
      observations
        .filter((row) => row.economy_code === country.kidb)
        .sort((a, b) => b.time_period.localeCompare(a.time_period))[0] ?? null,
  }))

  const report = {
    schema_version: "geomacro-adb-kidb-fiscal-discovery-2.1",
    generated_at: new Date().toISOString(),
    source_candidate: "adb_kidb_sdmx_v5",
    publisher: "Asian Development Bank / Key Indicators Database",
    writes_performed: false,
    production_activation_allowed: false,
    scoring_changed: false,
    api_contract: {
      documentation_url: "https://kidb.adb.org/api",
      base_url: API,
      version: "v5",
      documented_rate_limit: "20 queries/minute",
      enforced_inter_request_delay_ms: RATE_DELAY_MS,
      discovered_dataflow_count: flowIds.length,
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
      source_concept: "public_and_publicly_guaranteed_long_term_external_debt",
      not_equivalent_to_wdi_central_government_debt: true,
      not_equivalent_to_eurostat_general_government_debt: true,
      debt_definition_harmonised: false,
      cross_source_value_pooling_allowed: false,
      direct_sovereign_fiscal_fallback_allowed: false,
      next_required_step: "Establish an independently versioned external-public-debt vulnerability methodology and full-country peer coverage before any Risk Gate module state is emitted.",
    },
    codelist_public_guaranteed_candidates: codelistCandidates.map((row) => ({ code: row.code, text: row.text })),
    owning_flow: owningFlow,
    target_indicator: { code: targetIndicator.code, text: targetIndicator.text },
    sample_query: {
      url: dataUrl,
      requested_economy_count: SAMPLE_ECONOMIES.length,
      observed_economy_count: observedEconomies.length,
      observation_count: observations.length,
      units,
      coverage: sampleCoverage,
    },
    flow_audit: flowAudit,
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report, null, 2))
  if (observedEconomies.length === 0) process.exit(3)
  console.log("PASS: ADB KIDB SDMX FISCAL DISCOVERY COMPLETE - NO WRITES, NO SCORING")
}

main().catch((error) => {
  const report = {
    schema_version: "geomacro-adb-kidb-fiscal-discovery-error-2.1",
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
