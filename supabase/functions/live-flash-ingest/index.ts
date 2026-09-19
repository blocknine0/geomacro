import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.2.3"

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? ""

const SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const FLASH_INGEST_TOKEN =
  Deno.env.get("FLASH_INGEST_TOKEN") ?? ""

const GITHUB_OIDC_ISSUER =
  "https://token.actions.githubusercontent.com"

const GITHUB_OIDC_AUDIENCE =
  "https://geomacro.live/actions/live-flash-rss"

const GITHUB_OIDC_REPOSITORY =
  "blocknine0/geomacro"

const GITHUB_OIDC_WORKFLOW_REFS = new Set([
  "blocknine0/geomacro/.github/workflows/testnet-rss-live-runner.yml@refs/heads/main",
  "blocknine0/geomacro/.github/workflows/deploy-country-flash-supabase.yml@refs/heads/main",
])

const GITHUB_OIDC_JWKS_URL =
  "https://token.actions.githubusercontent.com/.well-known/jwks"

const GITHUB_OIDC_HEADER =
  "x-geomacro-github-oidc-token"

const GITHUB_OIDC_JWKS =
  createRemoteJWKSet(
    new URL(GITHUB_OIDC_JWKS_URL),
  )

const GITHUB_OIDC_WORKFLOW_FILES = new Set([
  "testnet-rss-live-runner.yml",
  "deploy-country-flash-supabase.yml",
])

const GITHUB_OIDC_ALLOWED_EVENTS = new Set([
  "push",
  "schedule",
  "workflow_dispatch",
  "workflow_run",
])

const SIGNAL_DB_MODE =
  Deno.env.get("SIGNAL_DB_MODE") === "true"

const ALLOWED_SOURCE_IDS =
  new Set([
    "telegram_mtproto_flash",
    "aljazeera_rss",
    "bbc_world_rss",
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
  signal_category?: string | null
  source_channel?: string | null
  source_channel_key?: string | null
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

async function verifyGitHubActionsOidc(
  request: Request,
) {
  const customHeaderToken =
    (
      request.headers.get(
        GITHUB_OIDC_HEADER,
      ) ?? ""
    ).trim()

  const authorization =
    (
      request.headers.get(
        "authorization",
      ) ?? ""
    ).trim()

  const bearerMatch =
    authorization.match(
      /^Bearer\s+(.+)$/i,
    )

  const token =
    customHeaderToken ||
    bearerMatch?.[1]?.trim() ||
    ""

  if (!token) return false

  try {
    const { payload } =
      await jwtVerify(
        token,
        GITHUB_OIDC_JWKS,
        {
          issuer:
            GITHUB_OIDC_ISSUER,
          audience:
            GITHUB_OIDC_AUDIENCE,
          algorithms: ["RS256"],
        },
      )

    if (
      payload.repository !==
        GITHUB_OIDC_REPOSITORY ||
      payload.ref !==
        "refs/heads/main" ||
      typeof payload.event_name !==
        "string" ||
      !GITHUB_OIDC_ALLOWED_EVENTS.has(
        payload.event_name,
      )
    ) {
      return false
    }

    const workflowRef =
      typeof payload.job_workflow_ref ===
        "string"
        ? payload.job_workflow_ref
        : typeof payload.workflow_ref ===
            "string"
          ? payload.workflow_ref
          : ""

    const workflowRefAuthorized =
      GITHUB_OIDC_WORKFLOW_REFS.has(
        workflowRef,
      )

    const workflowFileAuthorized =
      typeof payload.workflow ===
        "string" &&
      GITHUB_OIDC_WORKFLOW_FILES.has(
        payload.workflow,
      )

    return (
      workflowRefAuthorized ||
      workflowFileAuthorized
    )
  } catch {
    return false
  }
}
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

const SIGNAL_CATEGORIES = [
  "GEOPOLITICS",
  "MACRO",
  "CRITICAL_MINERALS",
] as const

type SignalCategory = (typeof SIGNAL_CATEGORIES)[number]

const CATEGORY_KEYWORDS: Record<SignalCategory, string[]> = {
  GEOPOLITICS: [
    "war", "attack", "strike", "missile", "military", "troops",
    "border", "invasion", "ceasefire", "airstrike", "drone", "coup",
    "protest", "sanctions", "tariff", "diplomatic", "embassy", "hostage",
    "terror", "conflict", "navy", "weapon", "nuclear", "security",
  ],
  MACRO: [
    "fed", "fomc", "interest rate", "rates", "inflation", "cpi", "ppi",
    "gdp", "jobs", "payrolls", "unemployment", "employment",
    "central bank", "ecb", "boj", "boe", "pmi", "retail sales",
    "yield", "bond", "treasury", "currency", "forex", "fx",
    "recession", "default", "debt", "fiscal", "monetary",
    "capital flows", "trade balance",
  ],
  CRITICAL_MINERALS: [
    "critical mineral", "critical minerals", "rare earth", "lithium",
    "cobalt", "nickel", "graphite", "manganese", "copper", "gallium",
    "germanium", "tungsten", "vanadium", "chromium", "antimony",
    "beryllium", "niobium", "tantalum", "tin", "uranium", "mineral mine",
    "mineral supply", "ore concentrate", "refinery", "refining capacity",
    "mineral export",
  ],
}

function normalizeSignalCategory(value: unknown): SignalCategory | "UNCLASSIFIED" {
  const normalized = String(value ?? "").trim().toUpperCase()
  return SIGNAL_CATEGORIES.includes(normalized as SignalCategory)
    ? (normalized as SignalCategory)
    : "UNCLASSIFIED"
}

function categoryFromEventType(value: unknown): SignalCategory | "UNCLASSIFIED" {
  const normalized = String(value ?? "").trim().toUpperCase()
  if (normalized.startsWith("GEOPOLITICS")) return "GEOPOLITICS"
  if (normalized.startsWith("MACRO")) return "MACRO"
  if (normalized.startsWith("CRITICAL_MINERALS")) return "CRITICAL_MINERALS"
  return "UNCLASSIFIED"
}

function classifySignalCategory(
  explicitCategory: unknown,
  eventType: unknown,
  headline: string,
  body: string | null,
  sourceDomains: string[] | null,
): SignalCategory | "UNCLASSIFIED" {
  const explicit = normalizeSignalCategory(explicitCategory)
  if (explicit !== "UNCLASSIFIED") return explicit

  const eventTypeCategory = categoryFromEventType(eventType)
  if (eventTypeCategory !== "UNCLASSIFIED") return eventTypeCategory

  const text = normalizeText((headline + " " + (body ?? "")).slice(0, 18000))
  const scores = SIGNAL_CATEGORIES.map((category) => {
    let score = 0
    for (const keyword of CATEGORY_KEYWORDS[category]) {
      if (text.includes(normalizeText(keyword))) score += 1
    }
    return { category, score }
  }).sort((a, b) => b.score - a.score)

  const top = scores[0]
  const second = scores[1]
  if (top && top.score >= 2 && top.score >= (second?.score ?? 0) + 1) return top.category

  const domainCategories = (Array.isArray(sourceDomains) ? sourceDomains : [])
    .map((value) => normalizeSignalCategory(value))
    .filter((value): value is SignalCategory => value !== "UNCLASSIFIED")
  return new Set(domainCategories).size === 1 ? domainCategories[0] : "UNCLASSIFIED"
}

function headlineTokens(value: string) {
  return normalizeText(value).split(" ").filter((token) => token.length >= 3)
}

function headlineSimilarity(left: string, right: string) {
  const a = new Set(headlineTokens(left))
  const b = new Set(headlineTokens(right))
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection += 1
  const union = a.size + b.size - intersection
  return union ? intersection / union : 0
}

function numberSignature(value: string) {
  return Array.from(normalizeText(value).matchAll(/\b\d+(?:\.\d+)?(?:%|bps)?\b/g))
    .map((match) => match[0])
    .sort()
    .join("|")
}

function materialEditChange(previousHeadline: string, nextHeadline: string) {
  if (numberSignature(previousHeadline) !== numberSignature(nextHeadline)) {
    return { material: true, reason: "numeric_fact_changed" }
  }
  if (headlineSimilarity(previousHeadline, nextHeadline) < 0.92) {
    return { material: true, reason: "headline_materially_changed" }
  }
  return { material: false, reason: "minor_or_formatting_edit" }
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

function fractionalHundredths(value: unknown) {
  const numeric = clampScore(value)
  return numeric === null ? null : Math.round(numeric * 100)
}

function coordinateMicrodegrees(
  value: unknown,
  minimum: number,
  maximum: number,
) {
  const numeric = clampCoordinate(value, minimum, maximum)
  return numeric === null ? null : Math.round(numeric * 1_000_000)
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

type ApprovedTelegramChannel = {
  channel_key: string
  display_name: string
  official_status: string
  rights_status: string
  source_reliability: number
  enabled: boolean
  manual_review_status: string
  domains: string[] | null
}

function normalizeTelegramChannelKey(
  value: unknown,
) {
  const cleaned =
    cleanString(value, 64)
      ?.replace(/^@+/, "")
      .toLowerCase() ??
    null

  if (
    !cleaned ||
    !/^[a-z0-9_]{5,32}$/.test(cleaned)
  ) {
    return null
  }

  return cleaned
}

async function loadApprovedTelegramChannel(
  channelKey: string,
) {
  const result =
    await db
      .from("live_telegram_channel_registry")
      .select(
        "channel_key,display_name,official_status,rights_status,source_reliability,enabled,manual_review_status,domains"
      )
      .eq(
        "channel_key",
        channelKey,
      )
      .maybeSingle()

  if (result.error) {
    throw result.error
  }

  const channel =
    result.data as
      | ApprovedTelegramChannel
      | null

  if (
    !channel ||
    channel.enabled !== true ||
    channel.manual_review_status !==
      "APPROVED"
  ) {
    return null
  }

  return channel
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

  if (SIGNAL_DB_MODE) {
    return []
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
    SIGNAL_DB_MODE
      ? null
      : new Set(
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
      (!SIGNAL_DB_MODE && !allowed?.has(iso3)) ||
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
    !SERVICE_ROLE_KEY
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

  const staticTokenAuthorized =
    Boolean(FLASH_INGEST_TOKEN) &&
    (
      (
        request.headers.get(
          "x-geomacro-flash-token",
        ) ?? ""
      ) === FLASH_INGEST_TOKEN
    )

  const githubOidcAuthorized =
    await verifyGitHubActionsOidc(
      request,
    )

  if (
    !staticTokenAuthorized &&
    !githubOidcAuthorized
  ) {
    return jsonResponse(
      401,
      {
        ok: false,
        error:
          "unauthorized",
      },
    )
  }

  if (
    githubOidcAuthorized &&
    ![
      "aljazeera_rss",
      "bbc_world_rss",
      "federal_reserve_press_rss",
      "forexlive_rss",
      "usgs_minerals_news_rss",
    ].includes(sourceId)
  ) {
    return jsonResponse(
      403,
      {
        ok: false,
        error:
          "github_oidc_source_not_allowed",
      },
    )
  }

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

  let telegramChannel:
    | ApprovedTelegramChannel
    | null = null

  if (
    sourceId ===
      "telegram_mtproto_flash"
  ) {
    const channelKey =
      normalizeTelegramChannelKey(
        payload.source_channel_key
      )

    if (!channelKey) {
      return jsonResponse(
        400,
        {
          ok: false,
          error:
            "telegram_public_channel_key_required",
        },
      )
    }

    const expectedPrefix =
      `https://t.me/${channelKey}/`

    if (
      !sourceUrl ||
      !sourceUrl
        .toLowerCase()
        .startsWith(
          expectedPrefix
        )
    ) {
      return jsonResponse(
        400,
        {
          ok: false,
          error:
            "telegram_public_source_url_required",
        },
      )
    }

    telegramChannel =
      await loadApprovedTelegramChannel(
        channelKey
      )

    if (!telegramChannel) {
      return jsonResponse(
        403,
        {
          ok: false,
          error:
            "telegram_channel_not_approved",
          channel_key:
            channelKey,
        },
      )
    }
  }

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

  const signalCategory = classifySignalCategory(
    payload.signal_category,
    payload.event_type,
    headline,
    body,
    telegramChannel?.domains ?? null,
  )
  const requestedVerification =
    payload.verification_status ??
    "UNVERIFIED"

  const verificationStatus =
    sourceId ===
      "telegram_mtproto_flash"
      ? "UNVERIFIED"
      : ALLOWED_VERIFICATION_STATUSES.has(
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

  const existingResult =
    await db
      .from("live_flash_events")
      .select("flash_id,content_hash,source_version,first_seen_at,last_material_update_at,event_family_id,headline")
      .eq("source_id", sourceId)
      .eq("source_record_id", sourceRecordId)
      .maybeSingle()

  if (existingResult.error) {
    console.error("existing flash lookup failed", existingResult.error)
    return jsonResponse(500, {
      ok: false,
      error: "flash_existing_lookup_failed",
    })
  }
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
        source_channel_key:
          telegramChannel?.channel_key ??
          null,
        source_url:
          sourceUrl,
      })
    )

  // Stable across edits. content_hash tracks the latest content separately.
  const flashId =
    `${sourceId}_${stableIdentityHash.slice(0, 32)}`

  const nowIso = new Date().toISOString()
  const previous = existingResult.data as {
    flash_id: string
    content_hash: string
    source_version: number
    first_seen_at: string | null
    last_material_update_at: string | null
    event_family_id: string | null
    headline: string
  } | null

  if (previous && previous.content_hash === contentHash) {
    const versionCheck = await db
      .from("live_flash_event_versions")
      .select("id")
      .eq("flash_id", previous.flash_id)
      .eq("source_version", previous.source_version)
      .maybeSingle()

    if (versionCheck.error) {
      return jsonResponse(500, { ok: false, error: "flash_version_lookup_failed" })
    }

    if (!versionCheck.data) {
      const repair = await db
        .from("live_flash_event_versions")
        .insert({
          flash_id: previous.flash_id,
          event_family_id: previous.event_family_id,
          source_version: previous.source_version,
          captured_at: nowIso,
          published_at: publishedAt,
          headline,
          content_hash: contentHash,
          signal_category: signalCategory,
          material_update: false,
          material_update_reason: "idempotent_version_repair",
        })

      if (repair.error) {
        return jsonResponse(500, { ok: false, error: "flash_version_repair_failed" })
      }
    }

    return jsonResponse(200, {
      ok: true,
      duplicate: true,
      unchanged: true,
      flash_id: previous.flash_id,
      source_id: sourceId,
      signal_category: signalCategory,
      event_version: previous.source_version,
      material_update: false,
      verification_status: "UNCHANGED",
      scoring_eligible: false,
    })
  }

  const sourceVersion = previous
    ? Number(previous.source_version ?? 1) + 1
    : 1
  const editAssessment = previous
    ? materialEditChange(previous.headline, headline)
    : { material: false, reason: "initial_source_record" }
  const materialUpdate = Boolean(previous && editAssessment.material)
  const materialUpdateReason = previous ? editAssessment.reason : "initial_source_record"
  const eventRow = {
    flash_id:
      flashId,
    signal_category:
      signalCategory,
    source_version:
      sourceVersion,
    material_update:
      materialUpdate,
    material_update_reason:
      materialUpdateReason,
    first_seen_at:
      previous?.first_seen_at ?? nowIso,
    last_seen_at:
      nowIso,
    last_material_update_at:
      materialUpdate ? nowIso : (previous?.last_material_update_at ?? null),
    event_family_id:
      previous?.event_family_id ?? null,
    source_id:
      sourceId,
    source_record_id:
      sourceRecordId,
    published_at:
      publishedAt,
    updated_at:
      new Date().toISOString(),
    // The signal project is a compact hot index. Keep only a bounded
    // headline; full body/raw payload is never persisted here.
    headline:
      SIGNAL_DB_MODE
        ? headline.slice(0, 512)
        : headline,
    body:
      null,
    source_channel:
      sourceChannel
        ? sourceChannel.slice(0, 120)
        : null,
    source_url:
      sourceUrl
        ? sourceUrl.slice(0, 512)
        : null,
    event_type:
      cleanString(
        payload.event_type,
        SIGNAL_DB_MODE ? 80 : 200,
      ),
    severity:
      SIGNAL_DB_MODE
        ? null
        : clampScore(payload.severity),
    source_reliability:
      SIGNAL_DB_MODE
        ? null
        : telegramChannel
          ? clampScore(
              telegramChannel.source_reliability
            )
          : clampScore(
              payload.source_reliability
            ),
    verification_status:
      verificationStatus,
    latitude:
      SIGNAL_DB_MODE
        ? null
        : clampCoordinate(
            payload.latitude,
            -90,
            90,
          ),
    longitude:
      SIGNAL_DB_MODE
        ? null
        : clampCoordinate(
            payload.longitude,
            -180,
            180,
          ),
    severity_bps:
      SIGNAL_DB_MODE
        ? fractionalHundredths(payload.severity)
        : undefined,
    source_reliability_bps:
      SIGNAL_DB_MODE
        ? fractionalHundredths(
            telegramChannel?.source_reliability ??
            payload.source_reliability
          )
        : undefined,
    latitude_e6:
      SIGNAL_DB_MODE
        ? coordinateMicrodegrees(payload.latitude, -90, 90)
        : undefined,
    longitude_e6:
      SIGNAL_DB_MODE
        ? coordinateMicrodegrees(payload.longitude, -180, 180)
        : undefined,
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


  const versionInsert = await db
    .from("live_flash_event_versions")
    .insert({
      flash_id: storedFlashId,
      event_family_id: previous?.event_family_id ?? null,
      source_version: sourceVersion,
      captured_at: nowIso,
      published_at: publishedAt,
      headline,
      content_hash: contentHash,
      signal_category: signalCategory,
      material_update: materialUpdate,
      material_update_reason: materialUpdateReason,
    })

  if (versionInsert.error) {
    console.error("flash version insert failed", versionInsert.error)
    return jsonResponse(500, { ok: false, error: "flash_version_store_failed" })
  }
  return jsonResponse(
    200,
    {
      ok: true,
      flash_id:
        storedFlashId,
      signal_category:
        signalCategory,
      event_version:
        sourceVersion,
      material_update:
        materialUpdate,
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
