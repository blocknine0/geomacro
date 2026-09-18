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

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9.%$+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokens(value: unknown) {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length >= 3),
  )
}

function similarity(left: unknown, right: unknown) {
  const a = tokens(left)
  const b = tokens(right)
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const item of a) if (b.has(item)) intersection += 1
  const union = a.size + b.size - intersection
  const jaccard = union ? intersection / union : 0
  const containment = intersection / Math.min(a.size, b.size)
  return Math.max(0, Math.min(1, 0.62 * jaccard + 0.38 * containment))
}

function countryOverlap(left: string[], right: string[]) {
  const rightSet = new Set(right)
  return left.some((item) => rightSet.has(item))
}

function sha256Hex(value: string) {
  return crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  ).then((buffer) =>
    Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(""),
  )
}

function canonicalEnvelope(record: any, match: any) {
  return JSON.stringify({
    schema_version: "telegram-main-alignment-envelope-v1.0.0",
    policy_version: "telegram-main-alignment-v1.0.0",
    signal_project_ref: record.source_project_ref,
    signal_flash_id: record.flash_id,
    signal_content_hash: record.content_hash,
    verification_status: record.verification_status,
    verification_score_bps: record.verification_score_bps,
    corroboration_count: record.corroboration_count,
    independent_source_count: record.independent_source_count,
    corroboration_evidence: record.corroboration_evidence ?? [],
    main_structured_event_id: match?.event?.id ?? null,
    match_score_bps: match ? Math.round(match.score * 10000) : 0,
    matched_country_iso3: match?.country ?? null,
    alignment_status: match ? "ALIGNED" : "QUARANTINED",
    quarantine_reason: match ? null : "no_authoritative_structured_event_match",
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

  const input = await request.json().catch(() => ({}))
  const records = Array.isArray(input?.records) ? input.records.slice(0, 100) : []

  if (!records.length) {
    return jsonResponse(200, { ok: true, processed: 0, aligned: 0, quarantined: 0 })
  }

  const eventResult = await db
    .from("live_structured_events")
    .select("id,title,summary,primary_country,countries,last_seen_at,first_seen_at,independent_source_count")
    .gte(
      "last_seen_at",
      new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    )
    .order("last_seen_at", { ascending: false })
    .limit(1500)

  if (eventResult.error) {
    console.error(eventResult.error)
    return jsonResponse(500, { ok: false, error: "structured_event_query_failed" })
  }

  const events = eventResult.data ?? []
  let aligned = 0
  let quarantined = 0

  for (const record of records) {
    if (
      record.source_project_ref !== "qogpagklwbfdmrgnrhzi" ||
      record.verification_status !== "VERIFIED" ||
      Number(record.verification_score_bps) < 6500 ||
      Number(record.independent_source_count) < 2 ||
      !/^[a-f0-9]{64}$/.test(String(record.content_hash ?? ""))
    ) {
      continue
    }

    const signalTime = Date.parse(record.published_at ?? record.ingested_at ?? "")
    let best: any = null

    for (const event of events) {
      const eventTime = Date.parse(event.last_seen_at ?? event.first_seen_at ?? "")
      if (Number.isNaN(signalTime) || Number.isNaN(eventTime)) continue
      const delta = Math.abs(signalTime - eventTime) / 1000
      if (delta > 5400) continue

      const countries = Array.isArray(event.countries) ? event.countries : []
      const overlap = countryOverlap(record.countries ?? [], countries.concat(
        event.primary_country ? [event.primary_country] : [],
      ))
      const score = similarity(
        record.headline,
        `${event.title ?? ""} ${event.summary ?? ""}`,
      )

      if (!((overlap && score >= 0.30) || score >= 0.55)) continue

      if (!best || score > best.score) {
        best = {
          event,
          score,
          country: overlap
            ? (record.countries ?? []).find((iso: string) =>
                countries.concat(event.primary_country ? [event.primary_country] : []).includes(iso),
              ) ?? null
            : null,
        }
      }
    }

    const envelope = canonicalEnvelope(record, best)
    const alignmentSha = await sha256Hex(envelope)

    const insertResult = await db
      .from("telegram_signal_alignment")
      .insert({
        signal_project_ref: record.source_project_ref,
        signal_flash_id: record.flash_id,
        signal_content_hash: record.content_hash,
        source_channel: record.source_channel ?? null,
        source_url: record.source_url ?? null,
        published_at: record.published_at ?? null,
        verification_status: "VERIFIED",
        verification_score_bps: Number(record.verification_score_bps),
        corroboration_count: Number(record.corroboration_count ?? 0),
        independent_source_count: Number(record.independent_source_count),
        verification_reason: record.verification_reason ?? null,
        corroboration_evidence: record.corroboration_evidence ?? [],
        main_structured_event_id: best?.event?.id ?? null,
        match_score_bps: best ? Math.round(best.score * 10000) : 0,
        matched_country_iso3: best?.country ?? null,
        alignment_policy_version: "telegram-main-alignment-v1.0.0",
        alignment_status: best ? "ALIGNED" : "QUARANTINED",
        quarantine_reason: best ? null : "no_authoritative_structured_event_match",
        alignment_sha256: alignmentSha,
      })
      .select("id,alignment_status")
      .single()

    if (insertResult.error) {
      if (insertResult.error.code === "23505") continue
      console.error(insertResult.error)
      return jsonResponse(500, { ok: false, error: "alignment_write_failed" })
    }

    if (insertResult.data?.alignment_status === "ALIGNED") aligned += 1
    else quarantined += 1
  }

  return jsonResponse(200, {
    ok: true,
    processed: records.length,
    aligned,
    quarantined,
    raw_content_stored: false,
  })
})
