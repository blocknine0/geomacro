import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const FLASH_INGEST_TOKEN = Deno.env.get("FLASH_INGEST_TOKEN") ?? ""

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}

function authorized(request: Request) {
  return Boolean(
    FLASH_INGEST_TOKEN &&
      request.headers.get("x-geomacro-flash-token") === FLASH_INGEST_TOKEN,
  )
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" })
  }

  if (!authorized(request)) {
    return jsonResponse(401, { ok: false, error: "unauthorized" })
  }

  const body = await request.json().catch(() => ({}))
  const limit = Math.max(
    1,
    Math.min(100, Number(body?.limit ?? 50) || 50),
  )

  const result = await db
    .from("live_flash_events")
    .select(
      "flash_id,source_id,source_record_id,published_at,ingested_at,headline,source_channel,source_url,event_type,verification_status,verification_score_bps,corroboration_count,independent_source_count,verified_at,verification_reason,content_hash,severity_bps,latitude_e6,longitude_e6",
    )
    .eq("verification_status", "VERIFIED")
    .gte("verification_score_bps", 6500)
    .gte("independent_source_count", 2)
    .order("verified_at", { ascending: true })
    .limit(limit)

  if (result.error) {
    console.error(result.error)
    return jsonResponse(500, { ok: false, error: "signal_query_failed" })
  }

  const flashes = result.data ?? []
  const ids = flashes.map((row) => row.flash_id)

  let countries: Record<string, string[]> = {}
  let corroborations: Record<string, unknown[]> = {}

  if (ids.length) {
    const countryResult = await db
      .from("live_flash_event_countries")
      .select("flash_id,country_iso3")
      .in("flash_id", ids)

    if (countryResult.error) {
      console.error(countryResult.error)
      return jsonResponse(500, { ok: false, error: "country_query_failed" })
    }

    for (const row of countryResult.data ?? []) {
      countries[row.flash_id] ??= []
      countries[row.flash_id].push(row.country_iso3)
    }

    const edgeResult = await db
      .from("live_flash_corroborations")
      .select(
        "id,flash_id,corroboration_kind,corroborating_flash_id,structured_event_id,corroborating_source_id,similarity,country_overlap,time_delta_seconds,relationship_method,created_at",
      )
      .in("flash_id", ids)

    if (edgeResult.error) {
      console.error(edgeResult.error)
      return jsonResponse(500, { ok: false, error: "corroboration_query_failed" })
    }

    for (const row of edgeResult.data ?? []) {
      corroborations[row.flash_id] ??= []
      corroborations[row.flash_id].push(row)
    }
  }

  return jsonResponse(200, {
    ok: true,
    schema_version: "telegram-signal-alignment-export-v1.0.0",
    source_project_ref: "qogpagklwbfdmrgnrhzi",
    raw_content_included: false,
    records: flashes.map((row) => ({
      ...row,
      countries: countries[row.flash_id] ?? [],
      corroboration_evidence: corroborations[row.flash_id] ?? [],
    })),
  })
})
