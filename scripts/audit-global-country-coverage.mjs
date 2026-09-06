import {
  createClient,
} from "@supabase/supabase-js"

const url =
  process.env.SUPABASE_URL?.trim()

const key =
  process.env
    .SUPABASE_SERVICE_ROLE_KEY
    ?.trim()

if (!url || !key) {
  throw new Error(
    "Missing Supabase service credentials"
  )
}

const db =
  createClient(
    url,
    key,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )

const now =
  new Date()

const cutoff =
  new Date(
    now.getTime() -
    72 * 60 * 60 * 1000
  )
    .toISOString()

console.log(
  "========================================"
)

console.log(
  " GEOMACRO GLOBAL COUNTRY COVERAGE AUDIT"
)

console.log(
  "========================================"
)

const registry =
  await db
    .from(
      "live_country_registry"
    )
    .select(
      "iso3,country_name,aliases,demonyms"
    )
    .order(
      "iso3"
    )

if (registry.error) {
  throw registry.error
}

const evidence =
  await db
    .from(
      "live_structured_event_evidence"
    )
    .select(`
      event_id,
      country_iso3,
      country_confidence,
      country_method,
      evidence_published_at,
      source_domain
    `)
    .gte(
      "evidence_published_at",
      cutoff
    )
    .limit(
      50000
    )

if (evidence.error) {
  throw evidence.error
}

const eventRows =
  await db
    .from(
      "live_structured_events"
    )
    .select(`
      id,
      primary_country,
      countries,
      last_seen_at
    `)
    .gte(
      "last_seen_at",
      cutoff
    )
    .limit(
      50000
    )

if (eventRows.error) {
  throw eventRows.error
}

const byCountry =
  new Map()

for (
  const country of
    registry.data ?? []
) {
  byCountry.set(
    country.iso3,
    {
      iso3:
        country.iso3,

      country_name:
        country.country_name,

      evidence:
        0,

      events:
        new Set(),

      sources:
        new Set(),

      latest:
        null,

      confidence_sum:
        0,

      confidence_count:
        0,

      methods:
        new Map(),
    },
  )
}

for (
  const row of
    evidence.data ?? []
) {
  const iso =
    row.country_iso3

  if (
    !iso ||
    !byCountry.has(iso)
  ) {
    continue
  }

  const item =
    byCountry.get(iso)

  item.evidence += 1

  if (row.event_id) {
    item.events.add(
      row.event_id
    )
  }

  if (row.source_domain) {
    item.sources.add(
      row.source_domain
    )
  }

  if (
    typeof row
      .country_confidence ===
      "number"
  ) {
    item.confidence_sum +=
      row.country_confidence

    item.confidence_count += 1
  }

  const method =
    row.country_method ??
    "unknown"

  item.methods.set(
    method,
    (
      item.methods.get(
        method
      ) ?? 0
    ) + 1,
  )

  if (
    row.evidence_published_at &&
    (
      !item.latest ||
      row.evidence_published_at >
        item.latest
    )
  ) {
    item.latest =
      row.evidence_published_at
  }
}

for (
  const row of
    eventRows.data ?? []
) {
  const countries =
    new Set([
      row.primary_country,
      ...(
        Array.isArray(
          row.countries
        )
          ? row.countries
          : []
      ),
    ])

  for (
    const iso of countries
  ) {
    if (
      !iso ||
      !byCountry.has(iso)
    ) {
      continue
    }

    byCountry
      .get(iso)
      .events.add(
        row.id
      )
  }
}

function statusFor(
  item,
) {
  if (
    item.evidence === 0 &&
    item.events.size === 0
  ) {
    return "NO_CURRENT_SIGNAL"
  }

  if (
    item.evidence === 0 &&
    item.events.size > 0
  ) {
    return "SPARSE"
  }

  if (
    item.events.size === 0
  ) {
    return "SPARSE"
  }

  if (
    item.evidence >= 8 &&
    item.events.size >= 3 &&
    item.sources.size >= 4
  ) {
    return "FULL"
  }

  if (
    item.evidence >= 3 &&
    item.events.size >= 2 &&
    item.sources.size >= 2
  ) {
    return "PARTIAL"
  }

  return "SPARSE"
}

const rows =
  [
    ...byCountry.values(),
  ]
    .map(
      item => ({
        iso3:
          item.iso3,

        country:
          item.country_name,

        status:
          statusFor(item),

        evidence:
          item.evidence,

        events:
          item.events.size,

        sources:
          item.sources.size,

        avg_confidence:
          item.confidence_count
            ? Math.round(
                (
                  item
                    .confidence_sum /
                  item
                    .confidence_count
                ) *
                  100
              ) /
              100
            : null,

        latest:
          item.latest,
      })
    )
    .sort(
      (a, b) =>
        b.evidence -
        a.evidence ||
        a.iso3.localeCompare(
          b.iso3
        )
    )

const statusCounts =
  rows.reduce(
    (acc, row) => {
      acc[row.status] =
        (
          acc[
            row.status
          ] ?? 0
        ) + 1

      return acc
    },
    {},
  )

const attributedEvidence =
  (
    evidence.data ?? []
  )
    .filter(
      row =>
        row.country_iso3
    )

const unknownEvidence =
  (
    evidence.data ?? []
  )
    .filter(
      row =>
        !row.country_iso3
    )

console.log({
  registry_countries:
    registry.data?.length ?? 0,

  countries_with_signal:
    rows.filter(
      row =>
        row.status !==
        "NO_CURRENT_SIGNAL"
    ).length,

  countries_without_signal:
    rows.filter(
      row =>
        row.status ===
        "NO_CURRENT_SIGNAL"
    ).length,

  status_counts:
    statusCounts,

  evidence_last_72h:
    evidence.data?.length ?? 0,

  attributed_evidence:
    attributedEvidence.length,

  unknown_evidence:
    unknownEvidence.length,

  attribution_rate_pct:
    evidence.data?.length
      ? Math.round(
          (
            attributedEvidence.length /
            evidence.data.length
          ) *
            10000
        ) /
        100
      : 0,
})

console.log(
  "\n===== COUNTRIES WITH SIGNAL ====="
)

console.table(
  rows.filter(
    row =>
      row.status !==
      "NO_CURRENT_SIGNAL"
  )
)

console.log(
  "\n===== TOP NO-SIGNAL COUNTRIES ====="
)

console.table(
  rows
    .filter(
      row =>
        row.status ===
        "NO_CURRENT_SIGNAL"
    )
    .slice(
      0,
      50
    )
)

console.log(
  "\n===== ATTRIBUTION METHODS ====="
)

const methods =
  new Map()

for (
  const row of
    evidence.data ?? []
) {
  const method =
    row.country_method ??
    "unknown"

  methods.set(
    method,
    (
      methods.get(
        method
      ) ?? 0
    ) + 1
  )
}

console.table(
  [
    ...methods.entries(),
  ]
    .map(
      ([method, count]) => ({
        method,
        count,
      })
    )
    .sort(
      (a, b) =>
        b.count -
        a.count
    )
)

console.log(
  "\nGLOBAL COUNTRY COVERAGE AUDIT COMPLETE"
)
