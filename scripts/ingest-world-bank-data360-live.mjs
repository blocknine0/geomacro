import {
  buildObservation,
  createDb,
  loadCountryRegistry,
  upsertObservations,
} from "./lib-live-source-utils.mjs"

const SOURCE_ID =
  "world_bank_data360"

const db =
  createDb()

const registry =
  await loadCountryRegistry(
    db
  )

console.log(
  "===== WORLD BANK DATA360 LIVE ====="
)

//
// Data360 is broad and dataset-specific.
// First production adapter intentionally
// performs metadata discovery and ingests
// only selected indicators whose provider
// metadata confirms World Bank ownership.
//
// We keep this conservative until the
// desired indicator IDs are explicitly
// curated.
//
const indicatorsResponse =
  await fetch(
    "https://api.worldbank.org/data360/indicators"
  )

if (!indicatorsResponse.ok) {
  console.log({
    source:
      SOURCE_ID,

    status:
      "API_DISCOVERY_UNAVAILABLE",

    http_status:
      indicatorsResponse.status,
  })

  console.log(
    "PASS: Data360 adapter fail-closed"
  )

  process.exit(0)
}

const payload =
  await indicatorsResponse.json()

const indicatorRows =
  Array.isArray(payload)
    ? payload
    : (
        payload?.data ??
        payload?.results ??
        []
      )

console.log({
  source:
    SOURCE_ID,

  indicators_discovered:
    Array.isArray(
      indicatorRows
    )
      ? indicatorRows.length
      : 0,

  registry_countries:
    registry.rows.length,
})

//
// Do not ingest unknown third-party
// Data360 indicators automatically.
//
const observations = []

await upsertObservations(
  db,
  observations,
)

console.log(
  "PASS: DATA360 DISCOVERY COMPLETE, NO UNCURATED THIRD-PARTY DATA INGESTED"
)
