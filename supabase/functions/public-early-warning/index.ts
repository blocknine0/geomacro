import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const CONTRACT_VERSION = "public-early-warning-edge-v1"
const CEWS_METHOD_VERSION = "cews-v0.1.0-provisional"
const PUBLIC_POLICY_VERSION = "public-alert-policy-v1"
const PUBLIC_STATUSES = ["WARNING", "CRITICAL"]
const MAX_LIMIT = 25

const CORE_PUBLIC_FIELDS = [
  "schema_version",
  "content_type",
  "alert_key",
  "visibility",
  "country_iso3",
  "country_name",
  "country_timezone",
  "event_family",
  "event_title",
  "primary_cause",
  "status",
  "cews_score",
  "methodology_version",
  "methodology_calibrated",
  "confidence",
  "independent_evidence_count",
  "official_source_present",
  "transmission_channels",
  "market_relevance",
  "detected_at_utc",
  "detected_at_local",
  "published_at_utc",
  "public_url",
  "public_eligible",
  "public_policy_version",
  "evidence_hash",
  "calculation_hash",
] as const

const OPTIONAL_MARKET_IMPACT_FIELDS = [
  "market_impact",
  "market_impact_methodology_version",
  "market_impact_calibrated",
  "market_impact_hash",
] as const

const CORE_PUBLIC_SELECT = CORE_PUBLIC_FIELDS.join(",")
const EXTENDED_PUBLIC_SELECT = [
  ...CORE_PUBLIC_FIELDS,
  ...OPTIONAL_MARKET_IMPACT_FIELDS,
].join(",")

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function headers(cache = false) {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": cache
      ? "public, max-age=15, s-maxage=30, stale-while-revalidate=60"
      : "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type, accept",
    "x-content-type-options": "nosniff",
  }
}

function json(status: number, body: unknown, cache = false) {
  return new Response(JSON.stringify(body), {
    status,
    headers: headers(cache),
  })
}

function normalizeCountry(value: string | null) {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("invalid_country")
  return normalized
}

function normalizeLimit(value: string | null) {
  if (!value) return 20
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw new Error("invalid_limit")
  }
  return parsed
}

function buildPublicQuery(select: string, country: string | null, limit: number) {
  let query = db
    .from("early_warning_alerts")
    .select(select)
    .eq("visibility", "public")
    .eq("public_eligible", true)
    .eq("content_type", "early_warning")
    .eq("methodology_version", CEWS_METHOD_VERSION)
    .eq("methodology_calibrated", false)
    .eq("public_policy_version", PUBLIC_POLICY_VERSION)
    .not("published_at_utc", "is", null)
    .in("status", PUBLIC_STATUSES)
    .order("published_at_utc", { ascending: false })
    .limit(limit)

  if (country) query = query.eq("country_iso3", country)
  return query
}

function withLegacyMarketImpactDefaults(row: Record<string, unknown>) {
  return {
    ...row,
    market_impact: null,
    market_impact_methodology_version: null,
    market_impact_calibrated: false,
    market_impact_hash: null,
  }
}

async function handle(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: headers(false) })
  }
  if (request.method !== "GET") {
    return json(405, { ok: false, code: "method_not_allowed" })
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(503, { ok: false, code: "feed_unavailable" })
  }

  const url = new URL(request.url)
  let country: string | null
  let limit: number
  try {
    country = normalizeCountry(url.searchParams.get("country"))
    limit = normalizeLimit(url.searchParams.get("limit"))
  } catch (error) {
    return json(400, {
      ok: false,
      code: error instanceof Error ? error.message : "invalid_query",
    })
  }

  const extended = await buildPublicQuery(EXTENDED_PUBLIC_SELECT, country, limit)
  if (!extended.error) {
    return json(200, {
      ok: true,
      contract_version: CONTRACT_VERSION,
      degraded: false,
      degraded_reason: null,
      filters: { country, limit },
      rows: extended.data ?? [],
    }, true)
  }

  console.warn(
    "[public-early-warning] optional extended feed read failed; retrying core bounded feed",
    extended.error.message,
  )

  const core = await buildPublicQuery(CORE_PUBLIC_SELECT, country, limit)
  if (core.error) {
    console.error("[public-early-warning] bounded core feed read failed", core.error.message)
    return json(503, { ok: false, code: "feed_unavailable" })
  }

  const rows = (core.data ?? []).map((row) =>
    withLegacyMarketImpactDefaults(row as Record<string, unknown>)
  )

  return json(200, {
    ok: true,
    contract_version: CONTRACT_VERSION,
    degraded: true,
    degraded_reason: "optional_market_impact_extension_unavailable",
    filters: { country, limit },
    rows,
  }, true)
}

Deno.serve(handle)
