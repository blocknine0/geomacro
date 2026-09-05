import {
  createDb,
} from "./lib-live-source-utils.mjs"

const db =
  createDb()

const PAGE_SIZE =
  1000

const rows =
  []

for (
  let from = 0;
  ;
  from += PAGE_SIZE
) {
  const result =
    await db
      .from(
        "live_external_observations"
      )
      .select(`
        observation_id,
        source_id,
        category,
        country_iso3,
        metric,
        commodity,
        observed_at,
        quality_status,
        commercial_eligibility_status
      `)
      .range(
        from,
        from +
          PAGE_SIZE -
          1
      )

  if (result.error) {
    throw result.error
  }

  const page =
    result.data ?? []

  rows.push(...page)

  if (
    page.length <
    PAGE_SIZE
  ) {
    break
  }
}

const bySource =
  new Map()

const byCategory =
  new Map()

const allCountries =
  new Set()

for (const row of rows) {
  if (
    row.country_iso3
  ) {
    allCountries.add(
      row.country_iso3
    )
  }

  const source =
    bySource.get(
      row.source_id
    ) ?? {
      rows: 0,
      countries:
        new Set(),
      metrics:
        new Set(),
      commodities:
        new Set(),
    }

  source.rows++

  if (
    row.country_iso3
  ) {
    source.countries.add(
      row.country_iso3
    )
  }

  if (row.metric) {
    source.metrics.add(
      row.metric
    )
  }

  if (row.commodity) {
    source.commodities.add(
      row.commodity
    )
  }

  bySource.set(
    row.source_id,
    source
  )

  const category =
    byCategory.get(
      row.category
    ) ?? {
      rows: 0,
      countries:
        new Set(),
    }

  category.rows++

  if (
    row.country_iso3
  ) {
    category.countries.add(
      row.country_iso3
    )
  }

  byCategory.set(
    row.category,
    category
  )
}

console.log(
  "===== LIVE EXTERNAL DATA AUDIT ====="
)

console.log({
  actual_rows:
    rows.length,

  global_unique_countries:
    allCountries.size,
})


console.log(
  "\n===== BY SOURCE ====="
)

console.table(
  [
    ...bySource.entries(),
  ]
    .map(
      ([source_id, x]) => ({
        source_id,

        rows:
          x.rows,

        countries:
          x.countries.size,

        metrics:
          x.metrics.size,

        commodities:
          x.commodities.size,
      })
    )
    .sort(
      (a, b) =>
        b.rows -
        a.rows
    )
)


console.log(
  "\n===== BY CATEGORY ====="
)

console.table(
  [
    ...byCategory.entries(),
  ]
    .map(
      ([category, x]) => ({
        category,

        rows:
          x.rows,

        countries:
          x.countries.size,
      })
    )
)


for (
  const requiredCategory of [
    "MACRO",
    "GEOPOLITICS",
    "CRITICAL_MINERALS",
  ]
) {
  if (
    !byCategory.has(
      requiredCategory
    )
  ) {
    throw new Error(
      `Missing live category: ${requiredCategory}`
    )
  }
}

console.log(
  "PASS: ALL THREE LIVE DATA CATEGORIES PRESENT"
)
