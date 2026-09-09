import {
  buildObservation,
  createDb,
  loadCountryRegistry,
  normalizeIso3,
  requireEnv,
  upsertObservations,
} from "./lib-live-source-utils.mjs"

const SOURCE_ID =
  "reliefweb"

const API_URL =
  "https://api.reliefweb.int/v2/reports"

const appname =
  requireEnv("RELIEFWEB_APPNAME")

const requestedLimit =
  Number(
    process.env.RELIEFWEB_MAX_REPORTS ??
      "250"
  )

const limit =
  Number.isInteger(requestedLimit)
    ? Math.min(
        1000,
        Math.max(1, requestedLimit)
      )
    : 250

const db =
  createDb()

const registry =
  await loadCountryRegistry(db)

console.log(
  "===== RELIEFWEB V2 CURRENT REPORT INGESTION ====="
)

const endpoint =
  new URL(API_URL)

endpoint.searchParams.set(
  "appname",
  appname
)

// One API call per run. The latest preset keeps this ingestion comfortably
// below ReliefWeb's daily request quota when scheduled hourly.
const response =
  await fetch(
    endpoint,
    {
      method: "POST",
      headers: {
        Accept:
          "application/json",
        "Content-Type":
          "application/json",
      },
      body:
        JSON.stringify({
          preset:
            "latest",
          profile:
            "list",
          limit,
          fields: {
            include: [
              "id",
              "title",
              "country.iso3",
              "country.name",
              "country.primary",
              "primary_country.iso3",
              "primary_country.name",
              "date.created",
              "date.changed",
              "date.original",
              "source.name",
              "source.shortname",
              "url",
              "url_alias",
              "disaster.name",
              "disaster.glide",
              "disaster_type.name",
              "theme.name",
            ],
          },
        }),
    }
  )

if (!response.ok) {
  const detail =
    await response
      .text()
      .catch(() => "")

  throw new Error(
    `ReliefWeb V2 request failed: ${response.status} ${detail.slice(0, 500)}`
  )
}

const json =
  await response.json()

const rows =
  Array.isArray(json?.data)
    ? json.data
    : []

console.log({
  api_rows:
    rows.length,
  requested_limit:
    limit,
})

const observations =
  []

let unmappedCountryRows =
  0

let reportsWithoutCountry =
  0

for (const item of rows) {
  const fields =
    item?.fields ?? {}

  const reportId =
    String(
      item?.id ??
        fields?.id ??
        ""
    ).trim()

  if (!reportId) {
    continue
  }

  const countries =
    Array.isArray(fields?.country)
      ? fields.country
      : []

  if (!countries.length) {
    reportsWithoutCountry +=
      1
    continue
  }

  const title =
    typeof fields?.title === "string"
      ? fields.title.trim()
      : null

  const publishedAt =
    fields?.date?.original ??
    fields?.date?.created ??
    null

  const changedAt =
    fields?.date?.changed ??
    null

  const sourceNames =
    Array.isArray(fields?.source)
      ? fields.source
          .map(source =>
            source?.shortname ??
            source?.name
          )
          .filter(Boolean)
      : []

  const disasterNames =
    Array.isArray(fields?.disaster)
      ? fields.disaster
          .map(disaster =>
            disaster?.name
          )
          .filter(Boolean)
      : []

  const disasterTypes =
    Array.isArray(
      fields?.disaster_type
    )
      ? fields.disaster_type
          .map(type =>
            type?.name
          )
          .filter(Boolean)
      : []

  const themes =
    Array.isArray(fields?.theme)
      ? fields.theme
          .map(theme =>
            theme?.name
          )
          .filter(Boolean)
      : []

  const sourceUrl =
    fields?.url_alias ??
    fields?.url ??
    null

  for (const country of countries) {
    const iso3 =
      normalizeIso3(
        country?.iso3
      )

    if (
      !iso3 ||
      !registry.byIso3.has(iso3)
    ) {
      unmappedCountryRows +=
        1
      continue
    }

    const compactRawPayload = {
      reliefweb_report_id:
        reportId,
      title,
      country: {
        iso3,
        name:
          country?.name ??
          null,
        primary:
          Boolean(
            country?.primary
          ),
      },
      published_at:
        publishedAt,
      changed_at:
        changedAt,
      source_names:
        sourceNames,
      disaster_names:
        disasterNames,
      disaster_types:
        disasterTypes,
      themes,
      source_url:
        sourceUrl,
    }

    observations.push(
      buildObservation({
        sourceId:
          SOURCE_ID,
        sourceRecordId:
          `${reportId}:${iso3}`,
        category:
          "GEOPOLITICS",
        countryIso3:
          iso3,
        observedAt:
          publishedAt,
        publishedAt:
          publishedAt,
        metric:
          "humanitarian_report_signal",
        valueText:
          title,
        eventType:
          disasterTypes.length
            ? disasterTypes.join(" | ")
            : "humanitarian_report",
        signalType:
          "humanitarian_policy_context",
        sourceUrl,
        provenance: {
          dataset:
            "ReliefWeb API V2 reports",
          reliefweb_report_id:
            reportId,
          reliefweb_changed_at:
            changedAt,
          original_sources:
            sourceNames,
          disaster_names:
            disasterNames,
          themes,
          retrieval_profile:
            "latest/list metadata only",
          retrieved_at:
            new Date()
              .toISOString(),
          rights_note:
            "Original partner content can carry third-party copyright. Raw report bodies are intentionally not stored by this adapter.",
        },
        rawPayload:
          compactRawPayload,
        qualityStatus:
          "VERIFIED",
        commercialEligibilityStatus:
          "DERIVED_ONLY",
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
  reports_seen:
    rows.length,
  reports_without_country:
    reportsWithoutCountry,
  unmapped_country_rows:
    unmappedCountryRows,
  observations_attempted:
    attempted,
  countries_covered:
    new Set(
      observations.map(
        item =>
          item.country_iso3
      )
    ).size,
})

console.log(
  "PASS: RELIEFWEB V2 CURRENT REPORT INGESTION CLEAN"
)
