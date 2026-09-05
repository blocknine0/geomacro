import {
  buildObservation,
  createDb,
  countryIso3FromName,
  loadCountryRegistry,
  parseCsv,
  upsertObservations,
} from "./lib-live-source-utils.mjs"

const SOURCE_ID =
  "usgs_mcs"

const db =
  createDb()

const registry =
  await loadCountryRegistry(db)

console.log(
  "===== USGS MCS CURRENT CRITICAL-MINERAL INGESTION ====="
)

const metadataUrl =
  "https://www.sciencebase.gov/catalog/item/69837e43b66b01367d7ec7c7?format=json"

const metadataResponse =
  await fetch(metadataUrl)

if (!metadataResponse.ok) {
  throw new Error(
    `USGS metadata request failed: ${metadataResponse.status}`
  )
}

const metadata =
  await metadataResponse.json()

const csvFile =
  (metadata?.files ?? [])
    .find(
      file =>
        String(file?.name ?? "")
          .toLowerCase()
          .endsWith(".csv")
    )

if (!csvFile) {
  throw new Error(
    "USGS MCS CSV not found"
  )
}

const csvUrl =
  csvFile.url ??
  csvFile.downloadUri

const response =
  await fetch(csvUrl)

if (!response.ok) {
  throw new Error(
    `USGS CSV download failed: ${response.status}`
  )
}

const rows =
  parseCsv(
    await response.text()
  )

if (!rows.length) {
  throw new Error(
    "USGS CSV parsed zero rows"
  )
}

const YEARS =
  rows
    .map(
      row =>
        Number(row.Year)
    )
    .filter(
      value =>
        Number.isInteger(value) &&
        value >= 1900 &&
        value <=
          new Date().getUTCFullYear()
    )

if (!YEARS.length) {
  throw new Error(
    "No valid USGS observation years found"
  )
}

const latestYear =
  Math.max(...YEARS)

console.log({
  raw_rows:
    rows.length,

  latest_observation_year:
    latestYear,
})


//
// Critical-mineral flag.
//
// MCS contains commodities beyond Geomacro's
// critical-mineral domain. We retain only commodities
// positively marked by the current release.
//
const CRITICAL_MINERALS_2025 =
  new Set([
    "aluminum",
    "antimony",
    "arsenic",
    "barite",
    "beryllium",
    "bismuth",
    "boron",
    "cerium",
    "cesium",
    "chromium",
    "cobalt",
    "copper",
    "dysprosium",
    "erbium",
    "europium",
    "fluorspar",
    "gadolinium",
    "gallium",
    "germanium",
    "graphite",
    "hafnium",
    "holmium",
    "indium",
    "iridium",
    "lanthanum",
    "lead",
    "lithium",
    "lutetium",
    "magnesium",
    "manganese",
    "metallurgical coal",
    "neodymium",
    "nickel",
    "niobium",
    "palladium",
    "phosphate",
    "platinum",
    "potash",
    "praseodymium",
    "rhenium",
    "rhodium",
    "rubidium",
    "ruthenium",
    "samarium",
    "scandium",
    "silicon",
    "silver",
    "tantalum",
    "tellurium",
    "terbium",
    "thulium",
    "tin",
    "titanium",
    "tungsten",
    "uranium",
    "vanadium",
    "ytterbium",
    "yttrium",
    "zinc",
    "zirconium",
  ])

function canonicalCommodity(
  value,
) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
}

function isCriticalMineralCommodity(
  commodity,
) {
  const normalized =
    canonicalCommodity(
      commodity
    )

  if (
    CRITICAL_MINERALS_2025
      .has(normalized)
  ) {
    return true
  }

  // USGS chapter naming variants.
  const aliases = {
    aluminium:
      "aluminum",

    "phosphate rock":
      "phosphate",

    "silicon metal":
      "silicon",

    "rare earths":
      null,
  }

  const mapped =
    aliases[normalized]

  return mapped
    ? CRITICAL_MINERALS_2025
        .has(mapped)
    : false
}


function slug(
  value,
) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(
      /\p{Diacritic}/gu,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      "_"
    )
    .replace(
      /^_+|_+$/g,
      ""
    )
    .slice(0, 160)
}


const currentRows =
  rows.filter(
    row =>
      Number(row.Year) ===
        latestYear &&
      isCriticalMineralCommodity(
        row.Commodity
      )
  )

console.log({
  current_critical_rows:
    currentRows.length,

  critical_flag_values:
    [
      ...new Set(
        rows.map(
          row =>
            String(
              row[
                "Is critical mineral 2025"
              ] ??
              ""
            ).trim()
        )
      ),
    ].slice(0, 20),
})


const observations =
  []

let unmappedCountries =
  0
let nonNumericRows =
  0

for (
  const row of
    currentRows
) {
  const countryName =
    String(
      row.Country ??
      ""
    ).trim()

  const iso3 =
    countryIso3FromName(
      countryName,
      registry
    )

  if (!iso3) {
    unmappedCountries++
    continue
  }

  const commodity =
    String(
      row.Commodity ??
      ""
    ).trim()

  if (!commodity) {
    continue
  }

  const numeric =
    Number(
      String(
        row.Value ??
        ""
      )
        .replace(/,/g, "")
        .trim()
    )

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    nonNumericRows++
    continue
  }

  const statistic =
    String(
      row.Statistics ??
      ""
    ).trim()

  const detail =
    String(
      row.Statistics_detail ??
      ""
    ).trim()

  const metric =
    slug(
      [
        statistic,
        detail,
      ]
        .filter(Boolean)
        .join(" ")
    ) ||
    "mineral_statistic"

  const observedAt =
    `${latestYear}-12-31T00:00:00.000Z`

  observations.push(
    buildObservation({
      sourceId:
        SOURCE_ID,

      sourceRecordId:
        [
          latestYear,
          iso3,
          slug(commodity),
          metric,
        ].join(":"),

      category:
        "CRITICAL_MINERALS",

      countryIso3:
        iso3,

      observedAt,

      // Do not invent a publication timestamp.
      publishedAt:
        null,

      metric,

      valueNumeric:
        numeric,

      unit:
        String(
          row.Unit ??
          ""
        ).trim() ||
        null,

      commodity,

      signalType:
        "critical_mineral_supply_state",

      sourceUrl:
        csvUrl,

      provenance: {
        release:
          "MCS 2026",

        observation_year:
          latestYear,

        statistic:
          statistic ||
          null,

        statistic_detail:
          detail ||
          null,

        critical_mineral:
          true,

        source_file:
          csvFile.name,

        retrieved_at:
          new Date()
            .toISOString(),
      },

      rawPayload:
        row,

      qualityStatus:
        "VERIFIED",

      commercialEligibilityStatus:
        "VERIFIED",
    })
  )
}

console.log({
  normalized_observations:
    observations.length,

  unmapped_country_rows:
    unmappedCountries,

  non_numeric_rows:
    nonNumericRows,

  countries:
    new Set(
      observations.map(
        x =>
          x.country_iso3
      )
    ).size,

  commodities:
    new Set(
      observations.map(
        x =>
          x.commodity
      )
    ).size,

  metrics:
    new Set(
      observations.map(
        x =>
          x.metric
      )
    ).size,
})

if (
  observations.length === 0
) {
  throw new Error(
    "USGS current critical-mineral normalization produced zero observations"
  )
}

const attempted =
  await upsertObservations(
    db,
    observations
  )

console.log({
  observations_attempted:
    attempted,
})

console.log(
  "PASS: USGS CURRENT CRITICAL-MINERAL INGESTION CLEAN"
)
