import {
  buildObservation,
  createDb,
  loadCountryRegistry,
  normalizeIso3,
  upsertObservations,
} from "./lib-live-source-utils.mjs"

const SOURCE_ID =
  "unhcr_refugee_statistics"

const db =
  createDb()

const registry =
  await loadCountryRegistry(db)

console.log(
  "===== UNHCR CURRENT DISPLACEMENT INGESTION ====="
)


//
// 1. Discover candidate years.
//
// IMPORTANT:
// /years can contain future/planning years.
// Never assume Math.max(years) has actual population rows.
//
const yearsResponse =
  await fetch(
    "https://api.unhcr.org/population/v1/years"
  )

if (!yearsResponse.ok) {
  throw new Error(
    `UNHCR years endpoint failed: ${yearsResponse.status}`
  )
}

const yearsJson =
  await yearsResponse.json()

const yearItems =
  yearsJson?.items ??
  yearsJson?.data ??
  []

const candidateYears =
  [
    ...new Set(
      yearItems
        .map(item =>
          Number(
            item?.year ??
            item?.value ??
            item
          )
        )
        .filter(
          value =>
            Number.isInteger(value) &&
            value > 1900
        )
    ),
  ]
    .sort(
      (a, b) =>
        b - a
    )

if (!candidateYears.length) {
  throw new Error(
    "UNHCR year candidates unavailable"
  )
}

console.log({
  newest_listed_years:
    candidateYears.slice(0, 6),
})


//
// 2. Probe newest years until one actually contains rows.
//
async function fetchPopulationYear(
  year,
) {
  const limit =
    10000

  let page =
    1

  let maxPages =
    1

  const rows =
    []

  do {
    const url =
      new URL(
        "https://api.unhcr.org/population/v1/population/"
      )

    url.searchParams.set(
      "yearFrom",
      String(year)
    )

    url.searchParams.set(
      "yearTo",
      String(year)
    )

    url.searchParams.set(
      "coo_all",
      "true"
    )

    url.searchParams.set(
      "coa_all",
      "true"
    )

    url.searchParams.set(
      "limit",
      String(limit)
    )

    url.searchParams.set(
      "page",
      String(page)
    )

    const response =
      await fetch(
        url,
        {
          headers: {
            Accept:
              "application/json",
          },
        }
      )

    if (!response.ok) {
      return {
        year,
        rows: [],
        maxPages: 0,
        url:
          url.toString(),
        http_status:
          response.status,
      }
    }

    const json =
      await response.json()

    const items =
      Array.isArray(
        json?.items
      )
        ? json.items
        : []

    rows.push(
      ...items
    )

    maxPages =
      Number(
        json?.maxPages ??
        json?.pagination?.maxPages ??
        json?.pagination?.pages ??
        1
      ) || 1

    page += 1
  }
  while (
    page <= maxPages
  )

  return {
    year,
    rows,
    maxPages,
    url:
      `https://api.unhcr.org/population/v1/population/?yearFrom=${year}&yearTo=${year}&coo_all=true&coa_all=true`,
    http_status:
      200,
  }
}


let selected =
  null

for (
  const year of
    candidateYears.slice(0, 10)
) {
  const probe =
    await fetchPopulationYear(
      year
    )

  console.log({
    probe_year:
      year,

    rows:
      probe.rows.length,

    http_status:
      probe.http_status,
  })

  if (
    probe.rows.length > 0
  ) {
    selected =
      probe

    break
  }
}

if (!selected) {
  throw new Error(
    "No UNHCR year with actual population rows found"
  )
}

const latestYear =
  selected.year

const rows =
  selected.rows

console.log({
  selected_data_year:
    latestYear,

  api_rows:
    rows.length,

  pages:
    selected.maxPages,
})


//
// 3. Normalize country codes.
// coo_iso is expected to be ISO3.
// Fail closed on codes outside Geomacro registry.
//
const byOrigin =
  new Map()

function numberValue(
  value,
) {
  const numeric =
    Number(value)

  return Number.isFinite(
    numeric
  )
    ? numeric
    : 0
}

let invalidCountryRows =
  0

for (const row of rows) {
  const iso3 =
    normalizeIso3(
      row?.coo_iso
    )

  if (
    !iso3 ||
    !registry.byIso3.has(
      iso3
    )
  ) {
    invalidCountryRows +=
      1

    continue
  }

  const current =
    byOrigin.get(
      iso3
    ) ?? {
      iso3,
      refugees: 0,
      asylum_seekers: 0,
      idps: 0,
      stateless: 0,
      oip: 0,
      bilateral_rows: 0,
    }

  current.refugees +=
    numberValue(
      row?.refugees
    )

  current.asylum_seekers +=
    numberValue(
      row?.asylum_seekers
    )

  current.idps +=
    numberValue(
      row?.idps
    )

  current.stateless +=
    numberValue(
      row?.stateless
    )

  current.oip +=
    numberValue(
      row?.oip
    )

  current.bilateral_rows +=
    1

  byOrigin.set(
    iso3,
    current
  )
}

console.log({
  valid_origin_countries:
    byOrigin.size,

  invalid_or_unmapped_rows:
    invalidCountryRows,
})


//
// 4. Store country-level derived structured observations.
//
// These are Geomacro normalized aggregates.
// Raw source identity remains internal provenance.
//
const observedAt =
  `${latestYear}-12-31T00:00:00.000Z`

const observations =
  []

for (
  const item of
    byOrigin.values()
) {
  const total =
    item.refugees +
    item.asylum_seekers +
    item.idps +
    item.stateless +
    item.oip

  const metrics = [
    [
      "forced_displacement_total",
      total,
    ],
    [
      "refugees_origin",
      item.refugees,
    ],
    [
      "asylum_seekers_origin",
      item.asylum_seekers,
    ],
    [
      "internally_displaced",
      item.idps,
    ],
    [
      "stateless_population",
      item.stateless,
    ],
  ]

  for (
    const [
      metric,
      value,
    ] of metrics
  ) {
    observations.push(
      buildObservation({
        sourceId:
          SOURCE_ID,

        sourceRecordId:
          `${latestYear}:${item.iso3}:${metric}`,

        category:
          "GEOPOLITICS",

        countryIso3:
          item.iso3,

        observedAt,

        publishedAt:
          observedAt,

        metric,

        valueNumeric:
          value,

        unit:
          "persons",

        signalType:
          "forced_displacement_pressure",

        // Internal DB provenance only.
        // Customer-facing serialization strips it.
        sourceUrl:
          selected.url,

        provenance: {
          dataset:
            "UNHCR Refugee Population Statistics",

          data_year:
            latestYear,

          bilateral_rows:
            item.bilateral_rows,

          aggregation:
            "origin-country aggregate",

          licence:
            "CC BY 4.0",

          retrieved_at:
            new Date()
              .toISOString(),
        },

        rawPayload:
          item,

        qualityStatus:
          "VERIFIED",

        commercialEligibilityStatus:
          "VERIFIED",
      })
    )
  }
}

const attempted =
  await upsertObservations(
    db,
    observations
  )

console.log({
  selected_data_year:
    latestYear,

  countries_covered:
    byOrigin.size,

  observations_attempted:
    attempted,
})

if (
  byOrigin.size < 100
) {
  throw new Error(
    `UNHCR country coverage unexpectedly low: ${byOrigin.size}`
  )
}

console.log(
  "PASS: UNHCR CURRENT DISPLACEMENT INGESTION CLEAN"
)
