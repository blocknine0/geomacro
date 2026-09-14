import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

const YEAR = 2026
const OUTPUT =
  process.env.ADB_FISCAL_DISCOVERY_OUTPUT ??
  "adb-key-indicators-fiscal-discovery.json"

const SAMPLE_COUNTRIES = [
  { iso3: "IND", slug: "india-key-indicators" },
  { iso3: "IDN", slug: "indonesia-key-indicators" },
  { iso3: "PHL", slug: "philippines-key-indicators" },
  { iso3: "PAK", slug: "pakistan-key-indicators" },
  { iso3: "BGD", slug: "bangladesh-key-indicators" },
  { iso3: "LKA", slug: "sri-lanka-key-indicators" },
]

const FISCAL_TERMS = [
  "government finance",
  "government debt",
  "public debt",
  "central government",
  "general government",
  "gross debt",
  "debt outstanding",
  "external debt",
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithRetry(url, options = {}) {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "user-agent": "Geomacro-ADB-Key-Indicators-Fiscal-Discovery/1.0",
          ...(options.headers ?? {}),
        },
      })
      if (response.ok) return response
      lastError = new Error(`HTTP ${response.status} for ${url}`)
      if (response.status < 500 && response.status !== 429) throw lastError
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt === 3) throw lastError
    }
    await sleep(500 * 2 ** (attempt - 1))
  }
  throw lastError ?? new Error(`ADB request failed for ${url}`)
}

function decodeEntities(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
}

function visibleText(html) {
  return decodeEntities(
    String(html)
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  )
}

function extractXlsxResource(pageUrl, html) {
  const anchors = []
  const pattern = /<a\b[^>]*href=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(pattern)) {
    const label = visibleText(match[3])
    if (
      label.toLowerCase().includes(`key indicators ${YEAR}`) &&
      label.toLowerCase().includes("xlsx")
    ) {
      anchors.push({
        label,
        url: new URL(decodeEntities(match[2]), pageUrl).toString(),
      })
    }
  }
  if (anchors.length !== 1) {
    throw new Error(
      `Expected exactly one ${YEAR} XLSX resource on ${pageUrl}; found ${anchors.length}`,
    )
  }
  return anchors[0]
}

function unzipText(file, member) {
  try {
    return execFileSync("unzip", ["-p", file, member], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return ""
  }
}

function workbookSheets(workbookXml) {
  return [...workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"/gi)].map(
    (match) => decodeEntities(match[1]),
  )
}

function sharedStringValues(sharedStringsXml) {
  if (!sharedStringsXml) return []
  return sharedStringsXml
    .split(/<\/si>/i)
    .map((chunk) => visibleText(chunk))
    .filter(Boolean)
}

function fiscalMatches(values) {
  const matches = []
  for (const value of values) {
    const lower = value.toLowerCase()
    const terms = FISCAL_TERMS.filter((term) => lower.includes(term))
    if (terms.length) matches.push({ value: value.slice(0, 280), terms })
    if (matches.length >= 40) break
  }
  return matches
}

async function auditCountry(country, tempDir) {
  const pageUrl = `https://data.adb.org/dataset/${country.slug}`
  const page = await fetchWithRetry(pageUrl)
  const html = await page.text()
  const pageText = visibleText(html)
  const licencePresent = pageText.includes("Creative Commons Attribution 3.0 IGO")
  if (!licencePresent) {
    throw new Error(`Exact CC BY 3.0 IGO marker missing on ${pageUrl}`)
  }

  const resource = extractXlsxResource(pageUrl, html)
  const response = await fetchWithRetry(resource.url, {
    headers: {
      accept:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream;q=0.9,*/*;q=0.1",
    },
  })
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length < 1024 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error(`${country.iso3} ${YEAR} resource is not a valid XLSX ZIP payload`)
  }

  const file = path.join(tempDir, `${country.iso3}.xlsx`)
  fs.writeFileSync(file, bytes)
  const workbookXml = unzipText(file, "xl/workbook.xml")
  if (!workbookXml) throw new Error(`${country.iso3} workbook.xml could not be read`)
  const sharedStringsXml = unzipText(file, "xl/sharedStrings.xml")
  const sheets = workbookSheets(workbookXml)
  const sharedStrings = sharedStringValues(sharedStringsXml)
  const vocabulary = fiscalMatches([...sheets, ...sharedStrings])

  return {
    iso3: country.iso3,
    dataset_page: pageUrl,
    licence: "CC BY 3.0 IGO",
    licence_marker_verified: true,
    resource_label: resource.label,
    resource_url: resource.url,
    resource_sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    resource_bytes: bytes.length,
    workbook_sheet_count: sheets.length,
    workbook_sheets: sheets,
    fiscal_vocabulary_matches: vocabulary,
    fiscal_vocabulary_detected: vocabulary.length > 0,
  }
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "geomacro-adb-fiscal-"))
  try {
    const countries = []
    const failures = []
    for (const country of SAMPLE_COUNTRIES) {
      try {
        countries.push(await auditCountry(country, tempDir))
      } catch (error) {
        failures.push({
          iso3: country.iso3,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const fiscalVocabularyCountries = countries.filter(
      (row) => row.fiscal_vocabulary_detected,
    )
    const report = {
      schema_version: "geomacro-adb-key-indicators-fiscal-discovery-1.0",
      generated_at: new Date().toISOString(),
      source_candidate: "adb_key_indicators_2026",
      publisher: "Asian Development Bank / ERDI",
      exact_dataset_family: `Key Indicators ${YEAR}`,
      writes_performed: false,
      production_activation_allowed: false,
      scoring_changed: false,
      commercial_boundary: {
        status: "EXACT_DATASET_LICENCE_MUST_BE_VERIFIED_PER_PAGE",
        required_licence: "Creative Commons Attribution 3.0 IGO",
        raw_redistribution_default: false,
        attribution_required: true,
      },
      methodology_boundary: {
        discovery_only: true,
        debt_definition_harmonised: false,
        cross_source_value_pooling_allowed: false,
        note:
          "Workbook vocabulary discovery does not prove a comparable sovereign-debt metric. Exact table definition, government sector, unit, valuation and coverage must be parsed before shadow scoring.",
      },
      sample: {
        requested_country_count: SAMPLE_COUNTRIES.length,
        resource_verified_country_count: countries.length,
        fiscal_vocabulary_country_count: fiscalVocabularyCountries.length,
        failure_count: failures.length,
      },
      countries,
      failures,
    }

    fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n")
    console.log(JSON.stringify(report, null, 2))

    if (failures.length) {
      console.error(`ADB discovery had ${failures.length} fail-closed country failures`)
      process.exit(2)
    }
    if (fiscalVocabularyCountries.length === 0) {
      console.error("ADB discovery found no fiscal/debt vocabulary in verified workbooks")
      process.exit(3)
    }
    console.log("PASS: ADB KEY INDICATORS FISCAL DISCOVERY COMPLETE - NO WRITES")
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
