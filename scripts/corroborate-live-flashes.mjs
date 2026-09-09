import {
  createDb,
} from "./lib-live-source-utils.mjs"

const LOOKBACK_MINUTES =
  Math.max(
    30,
    Math.min(
      360,
      Number(
        process.env.FLASH_CORROBORATION_LOOKBACK_MINUTES ??
          "120"
      ) || 120
    )
  )

const FLASH_WINDOW_SECONDS =
  60 * 60

const STRUCTURED_WINDOW_SECONDS =
  90 * 60

const db =
  createDb()

const STOPWORDS =
  new Set([
    "the", "a", "an", "and", "or", "but", "if", "then", "than",
    "to", "of", "in", "on", "at", "for", "from", "by", "with",
    "as", "is", "are", "was", "were", "be", "been", "being",
    "it", "its", "this", "that", "these", "those", "says", "said",
    "say", "according", "after", "before", "over", "under", "into",
    "amid", "about", "around", "more", "new", "latest", "breaking",
    "update", "updates", "report", "reports", "reported", "live",
  ])

function normalize(
  value,
) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(
      /\p{Diacritic}/gu,
      ""
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9.%$+-]+/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim()
}

function tokens(
  value,
) {
  const output =
    new Set()

  for (
    const token of
      normalize(value).split(" ")
  ) {
    if (!token) {
      continue
    }

    const cleaned =
      token.replace(
        /^[^a-z0-9]+|[^a-z0-9.%$+-]+$/g,
        ""
      )

    if (!cleaned) {
      continue
    }

    if (
      STOPWORDS.has(cleaned) ||
      (
        cleaned.length < 3 &&
        !/^\d/.test(cleaned)
      )
    ) {
      continue
    }

    output.add(cleaned)
  }

  return output
}

function textSimilarity(
  left,
  right,
) {
  const a =
    tokens(left)

  const b =
    tokens(right)

  if (
    a.size === 0 ||
    b.size === 0
  ) {
    return 0
  }

  let intersection =
    0

  for (const item of a) {
    if (b.has(item)) {
      intersection += 1
    }
  }

  const union =
    a.size + b.size - intersection

  const jaccard =
    union > 0
      ? intersection / union
      : 0

  const containment =
    intersection /
    Math.min(a.size, b.size)

  return Math.max(
    0,
    Math.min(
      1,
      0.62 * jaccard +
        0.38 * containment
    )
  )
}

function secondsBetween(
  left,
  right,
) {
  if (!left || !right) {
    return null
  }

  const a =
    Date.parse(left)

  const b =
    Date.parse(right)

  if (
    Number.isNaN(a) ||
    Number.isNaN(b)
  ) {
    return null
  }

  return Math.round(
    Math.abs(a - b) / 1000
  )
}

function overlaps(
  left,
  right,
) {
  if (
    !left?.size ||
    !right?.size
  ) {
    return false
  }

  for (const item of left) {
    if (right.has(item)) {
      return true
    }
  }

  return false
}

function flashFamily(
  row,
) {
  if (
    row.source_id ===
    "telegram_mtproto_flash"
  ) {
    const channel =
      normalize(
        row.source_channel ??
          "unknown"
      )
        .replace(/\s+/g, "-")

    return `telegram:${channel || "unknown"}`
  }

  return row.source_id
}

function eventCountrySet(
  row,
) {
  const values = [
    row.primary_country,
    ...(Array.isArray(row.countries)
      ? row.countries
      : []),
  ]

  return new Set(
    values
      .filter(
        value =>
          typeof value === "string" &&
          /^[A-Z]{3}$/.test(
            value.trim().toUpperCase()
          )
      )
      .map(
        value =>
          value.trim().toUpperCase()
      )
  )
}

const cutoff =
  new Date(
    Date.now() -
      LOOKBACK_MINUTES *
        60_000
  ).toISOString()

console.log(
  "===== LIVE FLASH CORROBORATION ====="
)

console.log({
  lookback_minutes:
    LOOKBACK_MINUTES,
  cutoff,
})

const flashResult =
  await db
    .from("live_flash_events")
    .select(
      "flash_id,source_id,source_record_id,source_channel,published_at,ingested_at,headline,body,source_reliability,verification_status"
    )
    .gte(
      "ingested_at",
      cutoff
    )
    .in(
      "verification_status",
      [
        "UNVERIFIED",
        "CORROBORATING",
        "VERIFIED",
      ]
    )
    .order(
      "ingested_at",
      {
        ascending: false,
      }
    )
    .limit(2000)

if (flashResult.error) {
  throw flashResult.error
}

const flashes =
  flashResult.data ?? []

if (!flashes.length) {
  console.log(
    "PASS: no recent flashes to corroborate"
  )
  process.exit(0)
}

const flashIds =
  flashes.map(
    row =>
      row.flash_id
  )

const countryByFlash =
  new Map(
    flashIds.map(
      id => [
        id,
        new Set(),
      ]
    )
  )

for (
  let i = 0;
  i < flashIds.length;
  i += 500
) {
  const result =
    await db
      .from(
        "live_flash_event_countries"
      )
      .select(
        "flash_id,country_iso3"
      )
      .in(
        "flash_id",
        flashIds.slice(
          i,
          i + 500
        )
      )

  if (result.error) {
    throw result.error
  }

  for (const row of result.data ?? []) {
    const set =
      countryByFlash.get(
        row.flash_id
      )

    if (set) {
      set.add(
        row.country_iso3
      )
    }
  }
}

const structuredResult =
  await db
    .from(
      "live_structured_events"
    )
    .select(
      "id,title,summary,primary_country,countries,last_seen_at,first_seen_at,independent_source_count,evidence_count,confidence"
    )
    .gte(
      "last_seen_at",
      cutoff
    )
    .order(
      "last_seen_at",
      {
        ascending: false,
      }
    )
    .limit(1500)

if (structuredResult.error) {
  throw structuredResult.error
}

const structuredEvents =
  structuredResult.data ?? []

let processed =
  0

let verified =
  0

let corroborating =
  0

let unverified =
  0

let edgesWritten =
  0

for (const flash of flashes) {
  const primaryCountries =
    countryByFlash.get(
      flash.flash_id
    ) ?? new Set()

  const primaryText =
    `${flash.headline ?? ""} ${flash.body ?? ""}`

  const primaryTime =
    flash.published_at ??
    flash.ingested_at

  const primaryFamily =
    flashFamily(flash)

  const edges =
    []

  const corroboratingFamilies =
    new Set()

  let maxSimilarity =
    0

  let countryAgreement =
    false

  for (const other of flashes) {
    if (
      other.flash_id ===
      flash.flash_id
    ) {
      continue
    }

    const otherFamily =
      flashFamily(other)

    if (
      otherFamily ===
      primaryFamily
    ) {
      continue
    }

    const delta =
      secondsBetween(
        primaryTime,
        other.published_at ??
          other.ingested_at
      )

    if (
      delta === null ||
      delta > FLASH_WINDOW_SECONDS
    ) {
      continue
    }

    const otherCountries =
      countryByFlash.get(
        other.flash_id
      ) ?? new Set()

    const countryOverlap =
      overlaps(
        primaryCountries,
        otherCountries
      )

    const similarity =
      textSimilarity(
        primaryText,
        `${other.headline ?? ""} ${other.body ?? ""}`
      )

    const accepted =
      (
        countryOverlap &&
        similarity >= 0.34
      ) ||
      similarity >= 0.58

    if (!accepted) {
      continue
    }

    maxSimilarity =
      Math.max(
        maxSimilarity,
        similarity
      )

    countryAgreement ||=
      countryOverlap

    corroboratingFamilies.add(
      otherFamily
    )

    edges.push({
      flash_id:
        flash.flash_id,
      corroboration_kind:
        "FLASH",
      corroborating_flash_id:
        other.flash_id,
      structured_event_id:
        null,
      corroborating_source_id:
        otherFamily,
      similarity:
        Number(
          similarity.toFixed(5)
        ),
      country_overlap:
        countryOverlap,
      time_delta_seconds:
        delta,
      relationship_method:
        "TOKEN_SIMILARITY_TIME_COUNTRY_V1",
    })
  }

  let bestStructured =
    null

  for (const event of structuredEvents) {
    const delta =
      secondsBetween(
        primaryTime,
        event.last_seen_at ??
          event.first_seen_at
      )

    if (
      delta === null ||
      delta > STRUCTURED_WINDOW_SECONDS
    ) {
      continue
    }

    const eventCountries =
      eventCountrySet(event)

    const countryOverlap =
      overlaps(
        primaryCountries,
        eventCountries
      )

    const similarity =
      textSimilarity(
        primaryText,
        `${event.title ?? ""} ${event.summary ?? ""}`
      )

    const accepted =
      (
        countryOverlap &&
        similarity >= 0.30
      ) ||
      similarity >= 0.55

    if (!accepted) {
      continue
    }

    if (
      !bestStructured ||
      similarity >
        bestStructured.similarity
    ) {
      bestStructured = {
        event,
        similarity,
        countryOverlap,
        delta,
      }
    }
  }

  if (bestStructured) {
    const event =
      bestStructured.event

    maxSimilarity =
      Math.max(
        maxSimilarity,
        bestStructured.similarity
      )

    countryAgreement ||=
      bestStructured.countryOverlap

    corroboratingFamilies.add(
      "gdelt_structured"
    )

    edges.push({
      flash_id:
        flash.flash_id,
      corroboration_kind:
        "STRUCTURED_EVENT",
      corroborating_flash_id:
        null,
      structured_event_id:
        event.id,
      corroborating_source_id:
        "gdelt_structured",
      similarity:
        Number(
          bestStructured.similarity
            .toFixed(5)
        ),
      country_overlap:
        bestStructured.countryOverlap,
      time_delta_seconds:
        bestStructured.delta,
      relationship_method:
        "STRUCTURED_EVENT_SIMILARITY_TIME_COUNTRY_V1",
    })
  }

  const resetResult =
    await db
      .from(
        "live_flash_corroborations"
      )
      .delete()
      .eq(
        "flash_id",
        flash.flash_id
      )

  if (resetResult.error) {
    throw resetResult.error
  }

  if (edges.length) {
    const insertResult =
      await db
        .from(
          "live_flash_corroborations"
        )
        .insert(edges)

    if (insertResult.error) {
      throw insertResult.error
    }

    edgesWritten +=
      edges.length
  }

  const baseReliability =
    Number(
      flash.source_reliability ??
        50
    )

  const distinctSourceCount =
    1 +
    corroboratingFamilies.size

  const structuredEvidenceCount =
    Number(
      bestStructured?.event
        ?.independent_source_count ??
        0
    )

  const sourceDiversityScore =
    Math.min(
      35,
      corroboratingFamilies.size *
        17.5
    )

  const similarityScore =
    maxSimilarity * 30

  const countryScore =
    countryAgreement
      ? 10
      : 0

  const structuredScore =
    bestStructured
      ? Math.min(
          20,
          8 +
            structuredEvidenceCount * 4
        )
      : 0

  const priorScore =
    Math.max(
      0,
      Math.min(
        10,
        baseReliability * 0.10
      )
    )

  const verificationScore =
    Math.max(
      0,
      Math.min(
        100,
        priorScore +
          sourceDiversityScore +
          similarityScore +
          countryScore +
          structuredScore
      )
    )

  const independentlyCorroborated =
    corroboratingFamilies.size > 0

  const strongStructuredMatch =
    Boolean(
      bestStructured &&
      bestStructured.similarity >= 0.38 &&
      Number(
        bestStructured.event
          .independent_source_count ??
          0
      ) >= 2
    )

  const strongMultiSourceMatch =
    distinctSourceCount >= 3 &&
    maxSimilarity >= 0.40

  let nextStatus =
    "UNVERIFIED"

  let reason =
    "No independent corroboration yet"

  if (
    independentlyCorroborated &&
    (
      strongStructuredMatch ||
      strongMultiSourceMatch
    ) &&
    verificationScore >= 65
  ) {
    nextStatus =
      "VERIFIED"

    reason =
      strongStructuredMatch
        ? "Matched an independently sourced structured event"
        : "Matched at least two independent fast sources"
  }
  else if (
    independentlyCorroborated &&
    verificationScore >= 35
  ) {
    nextStatus =
      "CORROBORATING"

    reason =
      "Independent matching evidence found; verification threshold not yet met"
  }

  const updateResult =
    await db
      .from(
        "live_flash_events"
      )
      .update({
        verification_status:
          nextStatus,
        verification_score:
          Number(
            verificationScore.toFixed(3)
          ),
        corroboration_count:
          edges.length,
        independent_source_count:
          distinctSourceCount,
        verified_at:
          nextStatus === "VERIFIED"
            ? new Date()
                .toISOString()
            : null,
        verification_reason:
          reason,
        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "flash_id",
        flash.flash_id
      )

  if (updateResult.error) {
    throw updateResult.error
  }

  processed += 1

  if (nextStatus === "VERIFIED") {
    verified += 1
  }
  else if (
    nextStatus ===
    "CORROBORATING"
  ) {
    corroborating += 1
  }
  else {
    unverified += 1
  }
}

console.log({
  flashes_seen:
    flashes.length,
  structured_events_seen:
    structuredEvents.length,
  processed,
  verified,
  corroborating,
  unverified,
  corroboration_edges_written:
    edgesWritten,
})

console.log(
  "PASS: LIVE FLASH CORROBORATION CLEAN"
)
