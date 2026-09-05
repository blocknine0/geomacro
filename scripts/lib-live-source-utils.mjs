import { createHash } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

export function requireEnv(name) {
  const value =
    process.env[name]?.trim()

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`
    )
  }

  return value
}

export function createDb() {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv(
      "SUPABASE_SERVICE_ROLE_KEY"
    ),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}

export function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(
          ([a], [b]) =>
            a.localeCompare(b)
        )
        .map(
          ([key, item]) => [
            key,
            canonicalize(item),
          ]
        )
    )
  }

  return value
}

export function sha256(value) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize(value)
      )
    )
    .digest("hex")
}

export function normalizeIso3(value) {
  if (
    typeof value !== "string"
  ) {
    return null
  }

  const iso3 =
    value.trim().toUpperCase()

  return /^[A-Z]{3}$/.test(
    iso3
  )
    ? iso3
    : null
}

export async function loadCountryRegistry(
  db
) {
  const result = await db
    .from("live_country_registry")
    .select(
      "iso3,country_name,aliases,demonyms"
    )
    .eq(
      "enabled",
      true,
    )

  if (result.error) {
    throw result.error
  }

  const byIso3 =
    new Map()

  const byName =
    new Map()

  for (
    const row of
      result.data ?? []
  ) {
    byIso3.set(
      row.iso3,
      row
    )

    const values = [
      row.country_name,
      ...(row.aliases ?? []),
      ...(row.demonyms ?? []),
    ]

    for (
      const value of values
    ) {
      if (
        typeof value !==
        "string"
      ) {
        continue
      }

      const key =
        value
          .normalize("NFKD")
          .replace(
            /\p{Diacritic}/gu,
            ""
          )
          .trim()
          .toLowerCase()

      if (key) {
        byName.set(
          key,
          row.iso3
        )
      }
    }
  }

  return {
    rows:
      result.data ?? [],

    byIso3,
    byName,
  }
}

export function countryIso3FromName(
  name,
  registry,
) {
  if (
    typeof name !== "string"
  ) {
    return null
  }

  const key =
    name
      .normalize("NFKD")
      .replace(
        /\p{Diacritic}/gu,
        ""
      )
      .trim()
      .toLowerCase()

  return (
    registry.byName.get(key) ??
    null
  )
}

export async function upsertObservations(
  db,
  observations,
) {
  let attempted = 0

  for (
    let i = 0;
    i < observations.length;
    i += 250
  ) {
    const batch =
      observations.slice(
        i,
        i + 250
      )

    const result =
      await db
        .from(
          "live_external_observations"
        )
        .upsert(
          batch,
          {
            onConflict:
              "source_id,normalized_hash",

            ignoreDuplicates:
              true,
          }
        )

    if (result.error) {
      throw result.error
    }

    attempted +=
      batch.length
  }

  return attempted
}

export function buildObservation({
  sourceId,
  sourceRecordId,
  category,
  countryIso3,
  partnerCountryIso3 = null,
  observedAt = null,
  publishedAt = null,
  metric = null,
  valueNumeric = null,
  valueText = null,
  unit = null,
  commodity = null,
  eventType = null,
  signalType = null,
  sourceUrl = null,
  provenance = {},
  rawPayload,
  qualityStatus = "VERIFIED",
  commercialEligibilityStatus =
    "VERIFIED",
}) {
  const canonical = {
    source_id:
      sourceId,

    source_record_id:
      sourceRecordId,

    category,

    country_iso3:
      countryIso3,

    partner_country_iso3:
      partnerCountryIso3,

    observed_at:
      observedAt,

    published_at:
      publishedAt,

    metric,

    value_numeric:
      valueNumeric,

    value_text:
      valueText,

    unit,

    commodity,

    event_type:
      eventType,

    signal_type:
      signalType,

    source_url:
      sourceUrl,

    provenance,
  }

  const rawHash =
    sha256(rawPayload)

  const normalizedHash =
    sha256(canonical)

  return {
    observation_id:
      `${sourceId}_${normalizedHash.slice(0, 32)}`,

    ...canonical,

    raw_payload:
      rawPayload,

    raw_hash:
      rawHash,

    normalized_hash:
      normalizedHash,

    quality_status:
      qualityStatus,

    commercial_eligibility_status:
      commercialEligibilityStatus,
  }
}

export function parseCsv(text) {
  const rows = []

  let row = []
  let field = ""
  let quoted = false

  for (
    let i = 0;
    i < text.length;
    i++
  ) {
    const char =
      text[i]

    const next =
      text[i + 1]

    if (quoted) {
      if (
        char === '"' &&
        next === '"'
      ) {
        field += '"'
        i++
        continue
      }

      if (char === '"') {
        quoted = false
        continue
      }

      field += char
      continue
    }

    if (char === '"') {
      quoted = true
      continue
    }

    if (char === ",") {
      row.push(field)
      field = ""
      continue
    }

    if (
      char === "\n"
    ) {
      row.push(field)

      if (
        row.some(
          value =>
            value.length > 0
        )
      ) {
        rows.push(row)
      }

      row = []
      field = ""
      continue
    }

    if (
      char === "\r"
    ) {
      continue
    }

    field += char
  }

  if (
    field.length ||
    row.length
  ) {
    row.push(field)
    rows.push(row)
  }

  if (!rows.length) {
    return []
  }

  const headers =
    rows[0]
      .map(
        header =>
          String(header)
            .replace(
              /^\uFEFF/,
              ""
            )
            .trim()
      )

  return rows
    .slice(1)
    .map(
      values =>
        Object.fromEntries(
          headers.map(
            (
              header,
              index
            ) => [
              header,
              values[index] ??
                "",
            ]
          )
        )
    )
}
