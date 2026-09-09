import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? ""

const SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const FLASH_INGEST_TOKEN =
  Deno.env.get("FLASH_INGEST_TOKEN") ?? ""

const ALLOWED_SOURCE_IDS =
  new Set([
    "telegram_mtproto_flash",
    "aljazeera_rss",
    "federal_reserve_press_rss",
    "forexlive_rss",
    "mining_com_rss",
    "usgs_minerals_news_rss",
  ])

const ALLOWED_VERIFICATION_STATUSES =
  new Set([
    "UNVERIFIED",
    "CORROBORATING",
    "VERIFIED",
    "REJECTED",
  ])

const db =
  createClient(
    SUPABASE_URL,
    SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )

type CountryRow = {
  iso2: string
  iso3: string
  country_name: string
  aliases: string[] | null
  demonyms: string[] | null
}

type CountryMatch = {
  iso3: string
  confidence: number
  method: string
  matched: string
}

type RankedCountryMatch =
  CountryMatch & {
    rank: number
  }

type VerificationStatus =
  | "UNVERIFIED"
  | "CORROBORATING"
  | "VERIFIED"
  | "REJECTED"

type FlashPayload = {
  source_id?: string
  source_record_id?: string
  published_at?: string | null
  headline?: string
  body?: string | null
  source_channel?: string | null
  source_url?: string | null
  event_type?: string | null
  severity?: number | null
  source_reliability?: number | null
  verification_status?: VerificationStatus
  latitude?: number | null
  longitude?: number | null
  commodity_tags?: string[] | null
  country_iso3?: string | null
  related_country_iso3?: string[] | null
  raw_payload?: unknown
}

let countryCache:
  | {
      expiresAt: number
      rows: CountryRow[]
    }
  | null = null

function jsonResponse(
  status: number,
  body: unknown,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "Content-Type":
          "application/json",
        "Cache-Control":
          "no-store",
      },
    },
  )
}

function normalizeText(
  value: string,
) {
  return value
    .normalize("NFKD")
    .replace(
      /\p{Diacritic}/gu,
      "",
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim()
}

function clampScore(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null
  }

  const numeric =
    Number(value)

  if (!Number.isFinite(numeric)) {
    return null
  }

  return Math.max(
    0,
    Math.min(100, numeric),
  )
}

function clampCoordinate(
  value: unknown,
  minimum: number,
  maximum: number,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null
  }

  const numeric =
    Number(value)

  if (
    !Number.isFinite(numeric) ||
    numeric < minimum ||
    numeric > maximum
  ) {
    return null
  }

  return numeric
}

function cleanString(
  value: unknown,
  maxLength: number,
) {
  if (typeof value !== "string") {
    return null
  }

  const cleaned =
    value.trim()

  if (!cleaned) {
    return null
  }

  return cleaned.slice(
    0,
    maxLength,
  )
}

async function sha256Hex(
  value: string,
) {
  const bytes =
    new TextEncoder()
      .encode(value)

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      bytes,
    )

  return Array.from(
    new Uint8Array(digest),
  )
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("")
}

async function loadCountries() {
  const now =
    Date.now()

  if (
    countryCache &&
    countryCache.expiresAt > now
  ) {
    return countryCache.rows
  }

  const result =
    await db
      .from("live_country_registry")
      .select(
        "iso2,iso3,country_name,aliases,demonyms"
      )
      .eq("enabled", true)

  if (result.error) {
    throw result.error
  }

  const rows =
    (result.data ?? []) as CountryRow[]

  countryCache = {
    rows,
    expiresAt:
      now + 10 * 60 * 1000,
  }

  return rows
}

function explicitIsoMatches(
  payload: FlashPayload,
  rows: CountryRow[],
) {
  const allowed =
    new Set(
      rows.map(row => row.iso3)
    )

  const values = [
    payload.country_iso3,
    ...(Array.isArray(
      payload.related_country_iso3
    )
      ? payload.related_country_iso3
      : []),
  ]

  const seen =
    new Set<string>()

  const matches:
    CountryMatch[] = []

  for (const value of values) {
    if (typeof value !== "string") {
      continue
    }

    const iso3 =
      value.trim().toUpperCase()

    if (
      !/^[A-Z]{3}$/.test(iso3) ||
      !allowed.has(iso3) ||
      seen.has(iso3)
    ) {
      continue
    }

    seen.add(iso3)

    matches.push({
      iso3,
      confidence: 95,
      method:
        "SUPPLIED_ISO3_VALIDATED",
      matched:
        iso3,
    })
  }

  return matches
}

function inferUppercaseCountryAbbreviations(
  rawText: string,
  rows: CountryRow[],
) {
  const allowed =
    new Set(
      rows.map(row => row.iso3)
    )

  const matches:
    RankedCountryMatch[] = []

  // Keep this case-sensitive. Lowercase "us" is an English pronoun and must
  // never become a country signal. Remove the well-known sports tournament
  // phrase before testing so headlines such as "US Open quarterfinal" do not
  // create a USA attribution by themselves.
  const withoutUsOpen =
    rawText.replace(
      /(?:US|U\.S\.)\s+Open\b/g,
      "",
    )

  if (
    allowed.has("USA") &&
    /(?:^|[^A-Za-z0-9])(?:US|U\.S\.)(?=$|[^A-Za-z0-9])/.test(
      withoutUsOpen,
    )
  ) {
    matches.push({
      iso3: "USA",
      confidence: 90,
      method:
        "UPPERCASE_COUNTRY_ABBREVIATION",
      matched: "US/U.S.",
      // Keep abbreviation evidence below an explicit country name/demonym so
      // "Iran ... US sanctions" remains Iran-primary and USA-secondary.
      rank: 900,
    })
  }

  if (
    allowed.has("GBR") &&
    /(?:^|[^A-Za-z0-9])(?:UK|U\.K\.)(?=$|[^A-Za-z0-9])/.test(
      rawText,
    )
  ) {
    matches.push({
      iso3: "GBR",
      confidence: 90,
      method:
        "UPPERCASE_COUNTRY_ABBREVIATION",
      matched: "UK/U.K.",
      rank: 900,
    })
  }

  return matches
}

function inferCountries(
  rawText: string,
  rows: CountryRow[],
) {
  const text =
    ` ${normalizeText(rawText)} `

  const candidates:
    RankedCountryMatch[] = [
      ...inferUppercaseCountryAbbreviations(
        rawText,
        rows,
      ),
    ]

  for (const row of rows) {
    const values = [
      row.country_name,
      ...(row.aliases ?? []),
      ...(row.demonyms ?? []),
    ]

    for (const value of values) {
      if (typeof value !== "string") {
        continue
      }

      const normalized =
        normalizeText(value)

      // Very short aliases are handled separately with case-sensitive
      // abbreviation rules so ordinary prose cannot turn "us" into USA.
      if (normalized.length < 3) {
        continue
      }

      if (
        text.includes(
          ` ${normalized} `
        )
      ) {
        const rank =
          normalized.split(" ").length *
            1000 +
          normalized.length

        candidates.push({
          iso3:
            row.iso3,
          confidence:
            normalized ===
            normalizeText(
              row.country_name
            )
              ? 88
              : 78,
          method:
            "COUNTRY_REGISTRY_TEXT_MATCH",
          matched:
            value,
          rank,
        })
      }
    }
  }

  candidates.sort(
    (a, b) =>
      b.rank - a.rank
  )

  const seen =
    new Set<string>()

  const output:
    CountryMatch[] = []

  for (const candidate of candidates) {
    if (
      seen.has(candidate.iso3)
    ) {
      continue
    }

    seen.add(candidate.iso3)
    output.push({
      iso3:
        candidate.iso3,
      confidence:
        candidate.confidence,
      method:
        candidate.method,
      matched:
        candidate.matched,
    })
  }

  return output.slice(0, 8)
}

Deno.serve(async request => {
  if (request.method !== "POST") {
    return jsonResponse(
      405,
      {
        ok: false,
        error:
          "method_not_allowed",
      },
    )
  }

  if (
    !SUPABASE_URL ||
    !SERVICE_ROLE_KEY ||
    !FLASH_INGEST_TOKEN
  ) {
    return jsonResponse(
      500,
      {
        ok: false,
        error:
          "server_not_configured",
      },
    )
  }

  const token =
    request.headers.get(
      "x-geomacro-flash-token"
    ) ?? ""

  if (token !== FLASH_INGEST_TOKEN) {
    return jsonResponse(
      401,
      {
        ok: false,
        error:
          "unauthorized",
      },
    )
  }

  let payload: FlashPayload

  try {
    payload =
      await request.json()
  }
  catch {
    return jsonResponse(
      400,
      {
        ok: false,
        error:
          "invalid_json",
      },
    )
  }

  const sourceId =
    cleanString(
      payload.source_id,
      120,
    ) ?? "telegram_mtproto_flash"

  if (!ALLOWED_SOURCE_IDS.has(sourceId)) {
    return jsonResponse(
      400,
      {
        ok: false,
        error:
          "source_not_allowed",
      },
    )
  }

  const sourceRecordId =
    cleanString(
      payload.source_record_id,
      500,
    )

  const headline =
    cleanString(
      payload.headline,
      1200,
    )

  if (
    !sourceRecordId ||
    !headline
  ) {
    return jsonResponse(
      400,
      {
        ok: false,
        error:
          "source_record_id_and_headline_required",
      },
    )
  }

  const body =
    cleanString(
      payload.body,
      12000,
    )

  const sourceChannel =
    cleanString(
      payload.source_channel,
      300,
    )

  const sourceUrl =
    cleanString(
      payload.source_url,
      2000,
    )

  const publishedAt =
    cleanString(
      payload.published_at,
      80,
    )

  if (
    publishedAt &&
    Number.isNaN(
      Date.parse(publishedAt)
    )
  ) {
    return jsonResponse(
      400,
      {
        ok: false,
        error:
          "invalid_published_at",
      },
    )
  }

  const requestedVerification =
    payload.verification_status ??
    "UNVERIFIED"

  const verificationStatus =
    ALLOWED_VERIFICATION_STATUSES.has(
      requestedVerification
    )
      ? requestedVerification
      : "UNVERIFIED"

  const countries =
    await loadCountries()

  const explicit =
    explicitIsoMatches(
      payload,
      countries,
    )

  const inferred =
    explicit.length
      ? []
      : inferCountries(
          `${headline}\n${body ?? ""}`,
          countries,
        )

  const countryMatches =
    explicit.length
      ? explicit
      : inferred

  const stableIdentityHash =
    await sha256Hex(
      `${sourceId}:${sourceRecordId}`
    )

  const contentHash =
    await sha256Hex(
      JSON.stringify({
        source_id:
          sourceId,
        source_record_id:
          sourceRecordId,
        published_at:
          publishedAt,
        headline,
        body,
        source_channel:
          sourceChannel,
        source_url:
          sourceUrl,
      })
    )

  // Stable across edits. content_hash tracks the latest content separately.
  const flashId =
    `${sourceId}_${stableIdentityHash.slice(0, 32)}`

  const eventRow = {
    flash_id:
      flashId,
    source_id:
      sourceId,
    source_record_id:
      sourceRecordId,
    published_at:
      publishedAt,
    updated_at:
      new Date().toISOString(),
    headline,
    body,
    source_channel:
      sourceChannel,
    source_url:
      sourceUrl,
    event_type:
      cleanString(
        payload.event_type,
        200,
      ),
    severity:
      clampScore(
        payload.severity
      ),
    source_reliability:
      clampScore(
        payload.source_reliability
      ),
    verification_status:
      verificationStatus,
    latitude:
      clampCoordinate(
        payload.latitude,
        -90,
        90,
      ),
    longitude:
      clampCoordinate(
        payload.longitude,
        -180,
        180,
      ),
    commodity_tags:
      Array.isArray(
        payload.commodity_tags
      )
        ? payload.commodity_tags
            .filter(
              value =>
                typeof value ===
                "string"
            )
            .map(value =>
              value.trim()
            )
            .filter(Boolean)
            .slice(0, 30)
        : [],
    raw_payload:
      payload.raw_payload ??
      null,
    content_hash:
      contentHash,
  }

  const eventResult =
    await db
      .from("live_flash_events")
      .upsert(
        eventRow,
        {
          onConflict:
            "source_id,source_record_id",
        },
      )
      .select("flash_id")
      .single()

  if (eventResult.error) {
    console.error(
      "flash event upsert failed",
      eventResult.error,
    )

    return jsonResponse(
      500,
      {
        ok: false,
        error:
          "flash_store_failed",
      },
    )
  }

  const storedFlashId =
    eventResult.data.flash_id

  const deleteResult =
    await db
      .from(
        "live_flash_event_countries"
      )
      .delete()
      .eq(
        "flash_id",
        storedFlashId,
      )

  if (deleteResult.error) {
    console.error(
      "country attribution reset failed",
      deleteResult.error,
    )

    return jsonResponse(
      500,
      {
        ok: false,
        error:
          "country_attribution_reset_failed",
      },
    )
  }

  if (countryMatches.length) {
    const countryResult =
      await db
        .from(
          "live_flash_event_countries"
        )
        .insert(
          countryMatches.map(
            (match, index) => ({
              flash_id:
                storedFlashId,
              country_iso3:
                match.iso3,
              is_primary:
                index === 0,
              confidence:
                match.confidence,
              attribution_method:
                match.method,
            })
          )
        )

    if (countryResult.error) {
      console.error(
        "country attribution insert failed",
        countryResult.error,
      )

      return jsonResponse(
        500,
        {
          ok: false,
          error:
            "country_attribution_store_failed",
        },
      )
    }
  }

  return jsonResponse(
    200,
    {
      ok: true,
      flash_id:
        storedFlashId,
      source_id:
        sourceId,
      verification_status:
        verificationStatus,
      countries:
        countryMatches.map(
          (match, index) => ({
            iso3:
              match.iso3,
            primary:
              index === 0,
            confidence:
              match.confidence,
            method:
              match.method,
          })
        ),
      // No fast-wire source is allowed to bypass the structured verification
      // and commercial eligibility pipeline at this endpoint.
      scoring_eligible:
        false,
    },
  )
})
