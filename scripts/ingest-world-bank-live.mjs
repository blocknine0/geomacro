import {
  createHash,
} from "node:crypto"

import {
  createClient,
} from "@supabase/supabase-js"

import {
  assertCommercialEligibilityAllowed,
} from "./commercial-source-policy.mjs"

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
)

const SOURCE_ID =
  "world_bank_indicators"

const COMMERCIAL_ELIGIBILITY_STATUS =
  assertCommercialEligibilityAllowed(
    SOURCE_ID,
    "VERIFIED",
  )

// World Bank indicator codes can be published through multiple API sources.
// Commercial provenance therefore pins the exact reviewed catalogue instead
// of treating an indicator code as sufficient licence identity.
const WORLD_BANK_API_SOURCE_ID =
  "2"
const WORLD_BANK_DATASET_NAME =
  "World Development Indicators"
const WORLD_BANK_DATASET_LICENCE =
  "CC BY 4.0"
const WORLD_BANK_DATASET_TERMS_URL =
  "https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets"

const INDICATORS = [
  { id: "SP.POP.TOTL", metric: "population_total", unit: "persons" },
  { id: "FP.CPI.TOTL.ZG", metric: "inflation_consumer_prices_annual_pct", unit: "percent" },
  { id: "NY.GDP.MKTP.KD.ZG", metric: "real_gdp_growth_annual_pct", unit: "percent" },
  { id: "SL.UEM.TOTL.ZS", metric: "unemployment_total_pct", unit: "percent" },
  { id: "NE.TRD.GNFS.ZS", metric: "trade_pct_gdp", unit: "percent_of_gdp" },
  { id: "GC.DOD.TOTL.GD.ZS", metric: "central_government_debt_pct_gdp", unit: "percent_of_gdp" },
]

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)])
    )
  }
  return value
}

function sha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")
}

const registry = await db
  .from("live_country_registry")
  .select("iso3,country_name")
if (registry.error) throw registry.error

const countryResponse = await fetch(
  `https://api.worldbank.org/v2/country?format=json&source=${WORLD_BANK_API_SOURCE_ID}&per_page=400`
)
if (!countryResponse.ok) {
  throw new Error(`World Bank country request failed: ${countryResponse.status}`)
}

const countryJson = await countryResponse.json()
const wbCountries = Array.isArray(countryJson) ? countryJson[1] ?? [] : []
const iso2ToIso3 = new Map()
for (const country of wbCountries) {
  const iso2 = country?.iso2Code
  const iso3 = country?.id
  if (
    typeof iso2 === "string" &&
    typeof iso3 === "string" &&
    /^[A-Z]{2}$/.test(iso2) &&
    /^[A-Z]{3}$/.test(iso3)
  ) {
    iso2ToIso3.set(iso2, iso3)
  }
}

const registryIso3 = new Set((registry.data ?? []).map((row) => row.iso3))
let inserted = 0
let skipped = 0

for (const indicator of INDICATORS) {
  console.log(`Fetching ${indicator.id} from WDI source ${WORLD_BANK_API_SOURCE_ID}...`)

  const url =
    `https://api.worldbank.org/v2/country/all/indicator/${indicator.id}` +
    `?format=json&source=${WORLD_BANK_API_SOURCE_ID}&per_page=20000&mrnev=1`
  const response = await fetch(url)
  if (!response.ok) {
    console.log({ indicator: indicator.id, source_id: WORLD_BANK_API_SOURCE_ID, status: response.status })
    continue
  }

  const json = await response.json()
  const rows = Array.isArray(json) ? json[1] ?? [] : []
  const observations = []

  for (const row of rows) {
    if (row?.value === null || row?.value === undefined) {
      skipped++
      continue
    }

    const iso3 = iso2ToIso3.get(row?.country?.id)
    if (!iso3 || !/^[A-Z]{3}$/.test(iso3) || !registryIso3.has(iso3)) {
      skipped++
      continue
    }

    const year = String(row.date)
    const publishedAt = /^\d{4}$/.test(year)
      ? `${year}-12-31T00:00:00.000Z`
      : null

    const canonical = {
      source_id: SOURCE_ID,
      source_record_id: `${WORLD_BANK_API_SOURCE_ID}:${indicator.id}:${iso3}:${year}`,
      category: "MACRO",
      country_iso3: iso3,
      observed_at: publishedAt,
      published_at: publishedAt,
      metric: indicator.metric,
      value_numeric: Number(row.value),
      unit: indicator.unit,
      source_url: url,
      provenance: {
        provider: "World Bank",
        dataset: WORLD_BANK_DATASET_NAME,
        world_bank_api_source_id: WORLD_BANK_API_SOURCE_ID,
        indicator_id: indicator.id,
        indicator_name: row?.indicator?.value ?? null,
        country_name: row?.country?.value ?? null,
        source_note:
          "Latest available World Development Indicators observation from the explicitly pinned World Bank API source",
        licence: WORLD_BANK_DATASET_LICENCE,
        licence_reference: WORLD_BANK_DATASET_TERMS_URL,
        retrieved_at: new Date().toISOString(),
      },
    }

    const rawHash = sha256(row)
    const normalizedHash = sha256(canonical)
    observations.push({
      observation_id: `wb_${normalizedHash.slice(0, 32)}`,
      ...canonical,
      raw_payload: row,
      raw_hash: rawHash,
      normalized_hash: normalizedHash,
      quality_status: "VERIFIED",
      commercial_eligibility_status:
        COMMERCIAL_ELIGIBILITY_STATUS,
    })
  }

  for (let i = 0; i < observations.length; i += 250) {
    const batch = observations.slice(i, i + 250)
    const result = await db
      .from("live_external_observations")
      .upsert(batch, {
        onConflict: "source_id,normalized_hash",
        ignoreDuplicates: true,
      })
    if (result.error) throw result.error
    inserted += batch.length
  }
}

console.log({
  source: SOURCE_ID,
  dataset: WORLD_BANK_DATASET_NAME,
  world_bank_api_source_id: WORLD_BANK_API_SOURCE_ID,
  attempted_observations: inserted,
  skipped,
})

const summary = await db
  .from("live_external_observations")
  .select("country_iso3,metric")
  .eq("source_id", SOURCE_ID)
  .limit(50000)
if (summary.error) throw summary.error

const countries = new Set((summary.data ?? []).map((row) => row.country_iso3).filter(Boolean))
const metrics = new Set((summary.data ?? []).map((row) => row.metric).filter(Boolean))
console.log({
  persisted_rows: summary.data?.length ?? 0,
  countries_covered: countries.size,
  metrics: [...metrics].sort(),
})
console.log("PASS: WORLD BANK LIVE MACRO INGESTION COMPLETE")
