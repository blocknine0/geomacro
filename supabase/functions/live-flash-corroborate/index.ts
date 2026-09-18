import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const FLASH_INGEST_TOKEN = Deno.env.get("FLASH_INGEST_TOKEN") ?? ""
const SIGNAL_DB_MODE = Deno.env.get("SIGNAL_DB_MODE") === "true"

const db = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
)

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "than",
  "to", "of", "in", "on", "at", "for", "from", "by", "with",
  "as", "is", "are", "was", "were", "be", "been", "being",
  "it", "its", "this", "that", "these", "those", "says", "said",
  "say", "according", "after", "before", "over", "under", "into",
  "amid", "about", "around", "more", "new", "latest", "breaking",
  "update", "updates", "report", "reports", "reported", "live",
])

type Flash = {
  flash_id: string
  source_id: string
  source_channel: string | null
  published_at: string | null
  ingested_at: string
  headline: string
  body: string | null
  source_reliability: number | null
  source_reliability_bps: number | null
  verification_status: string
  signal_category: string
  source_version: number
  event_family_id: string | null
  material_update: boolean
  content_hash: string
}

type EventFamily = {
  family_id: string
  signal_category: "GEOPOLITICS" | "MACRO" | "CRITICAL_MINERALS"
  canonical_headline: string
  country_isos: string[] | null
  first_seen_at: string
  last_seen_at: string
  current_version: number
  current_status: "ACTIVE" | "RESOLVED"
  source_count: number
  independent_source_count: number
  last_material_update_at: string | null
  latest_update_reason: string | null
  latest_flash_id: string | null
  latest_content_hash: string | null
}

type StructuredEvent = {
  id: string
  title: string
  summary: string | null
  primary_country: string | null
  countries: string[] | null
  last_seen_at: string
  first_seen_at: string
  independent_source_count: number
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
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  )
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

function tokenSet(value: unknown) {
  const output = new Set<string>()

  for (const raw of normalize(value).split(" ")) {
    const token = raw.replace(
      /^[^a-z0-9]+|[^a-z0-9.%$+-]+$/g,
      "",
    )

    if (!token) continue
    if (STOPWORDS.has(token)) continue
    if (token.length < 3 && !/^\d/.test(token)) continue

    output.add(token)
  }

  return output
}

function similarity(left: unknown, right: unknown) {
  const a = tokenSet(left)
  const b = tokenSet(right)

  if (!a.size || !b.size) return 0

  let intersection = 0
  for (const item of a) {
    if (b.has(item)) intersection += 1
  }

  const union = a.size + b.size - intersection
  const jaccard = union ? intersection / union : 0
  const containment = intersection / Math.min(a.size, b.size)

  return Math.max(
    0,
    Math.min(
      1,
      0.62 * jaccard + 0.38 * containment,
    ),
  )
}

function secondsBetween(left: string | null, right: string | null) {
  if (!left || !right) return null

  const a = Date.parse(left)
  const b = Date.parse(right)

  if (Number.isNaN(a) || Number.isNaN(b)) return null

  return Math.round(Math.abs(a - b) / 1000)
}

function overlaps(left: Set<string>, right: Set<string>) {
  for (const item of left) {
    if (right.has(item)) return true
  }
  return false
}

function flashFamily(row: Flash) {
  if (row.source_id === "telegram_mtproto_flash") {
    return `telegram:${normalize(row.source_channel ?? "unknown").replace(/\s+/g, "-") || "unknown"}`
  }

  return row.source_id
}

function structuredCountries(row: StructuredEvent) {
  const values = [
    row.primary_country,
    ...(Array.isArray(row.countries) ? row.countries : []),
  ]

  return new Set(
    values
      .filter((value): value is string =>
        typeof value === "string" && /^[A-Z]{3}$/.test(value.trim().toUpperCase())
      )
      .map(value => value.trim().toUpperCase()),
  )
}

Deno.serve(async request => {
  if (request.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" })
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !FLASH_INGEST_TOKEN) {
    return jsonResponse(500, { ok: false, error: "server_not_configured" })
  }

  const token = request.headers.get("x-geomacro-flash-token") ?? ""
  if (token !== FLASH_INGEST_TOKEN) {
    return jsonResponse(401, { ok: false, error: "unauthorized" })
  }

  const cutoff = new Date(Date.now() - 120 * 60_000).toISOString()

  const flashResult = await db
    .from("live_flash_events")
    .select(
      "flash_id,source_id,source_channel,published_at,ingested_at,headline,body,source_reliability,source_reliability_bps,verification_status,signal_category,source_version,event_family_id,material_update,content_hash",
    )
    .gte("ingested_at", cutoff)
    .in("verification_status", ["UNVERIFIED", "CORROBORATING", "VERIFIED"])
    .order("ingested_at", { ascending: false })
    .limit(500)

  if (flashResult.error) {
    console.error(flashResult.error)
    return jsonResponse(500, { ok: false, error: "flash_query_failed" })
  }

  const flashes = (flashResult.data ?? []) as Flash[]
  if (!flashes.length) {
    return jsonResponse(200, { ok: true, processed: 0 })
  }

  const flashIds = flashes.map(row => row.flash_id)
  const countryByFlash = new Map<string, Set<string>>(
    flashIds.map(id => [id, new Set<string>()]),
  )

  for (let i = 0; i < flashIds.length; i += 250) {
    const countryResult = await db
      .from("live_flash_event_countries")
      .select("flash_id,country_iso3")
      .in("flash_id", flashIds.slice(i, i + 250))

    if (countryResult.error) {
      console.error(countryResult.error)
      return jsonResponse(500, { ok: false, error: "country_query_failed" })
    }

    for (const row of countryResult.data ?? []) {
      countryByFlash.get(row.flash_id)?.add(row.country_iso3)
    }
  }

  // The isolated signal project intentionally has no customer-facing
  // structured-intelligence table. Main production intelligence remains in
  // the authoritative project and is aligned through a controlled handoff.
  let structuredEvents: StructuredEvent[] = []

  if (!SIGNAL_DB_MODE) {
    const structuredResult = await db
      .from("live_structured_events")
      .select(
        "id,title,summary,primary_country,countries,last_seen_at,first_seen_at,independent_source_count",
      )
      .gte("last_seen_at", cutoff)
      .order("last_seen_at", { ascending: false })
      .limit(500)

    if (structuredResult.error) {
      console.error(structuredResult.error)
      return jsonResponse(500, { ok: false, error: "structured_query_failed" })
    }

    structuredEvents = (structuredResult.data ?? []) as StructuredEvent[]
  }

  const familyCutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  const familyResult = await db
    .from("live_flash_event_families")
    .select("family_id,signal_category,canonical_headline,country_isos,first_seen_at,last_seen_at,current_version,current_status,source_count,independent_source_count,last_material_update_at,latest_update_reason,latest_flash_id,latest_content_hash")
    .eq("current_status", "ACTIVE")
    .gte("last_seen_at", familyCutoff)
    .order("last_seen_at", { ascending: false })
    .limit(500)

  if (familyResult.error) {
    console.error(familyResult.error)
    return jsonResponse(500, { ok: false, error: "family_query_failed" })
  }

  const families = (familyResult.data ?? []) as EventFamily[]
  const familyMemberIds = new Map<string, Set<string>>()
  const familySourceFamilies = new Map<string, Set<string>>()

  for (const family of families) {
    familyMemberIds.set(family.family_id, new Set<string>())
    familySourceFamilies.set(family.family_id, new Set<string>())
  }

  const existingFamilyIds = families.map((family) => family.family_id)
  if (existingFamilyIds.length) {
    const memberResult = await db
      .from("live_flash_events")
      .select("flash_id,source_id,source_channel,event_family_id")
      .in("event_family_id", existingFamilyIds)
      .gte("ingested_at", familyCutoff)
      .limit(5000)

    if (memberResult.error) {
      console.error(memberResult.error)
      return jsonResponse(500, { ok: false, error: "family_members_query_failed" })
    }

    for (const member of memberResult.data ?? []) {
      const familyId = member.event_family_id
      if (!familyId) continue
      familyMemberIds.get(familyId)?.add(member.flash_id)
      familySourceFamilies.get(familyId)?.add(
        flashFamily({
          flash_id: member.flash_id,
          source_id: member.source_id,
          source_channel: member.source_channel,
        } as Flash),
      )
    }
  }

  const familyById = new Map(families.map((family) => [family.family_id, family]))
  let verified = 0
  let corroborating = 0
  let unverified = 0
  let edgesWritten = 0

  for (const flash of flashes) {
    const primaryCountries = countryByFlash.get(flash.flash_id) ?? new Set<string>()
    const primaryText = SIGNAL_DB_MODE
      ? `${flash.headline ?? ""}`
      : `${flash.headline ?? ""} ${flash.body ?? ""}`
    const primaryTime = flash.published_at ?? flash.ingested_at
    const primaryFamily = flashFamily(flash)

    const edges: Record<string, unknown>[] = []
    const corroboratingFamilies = new Set<string>()
    let maxSimilarity = 0
    let countryAgreement = false

    for (const other of flashes) {
      if (other.flash_id === flash.flash_id) continue

      const otherFamily = flashFamily(other)
      if (otherFamily === primaryFamily) continue

      const delta = secondsBetween(
        primaryTime,
        other.published_at ?? other.ingested_at,
      )

      if (delta === null || delta > 3600) continue

      const otherCountries = countryByFlash.get(other.flash_id) ?? new Set<string>()
      const countryOverlap = overlaps(primaryCountries, otherCountries)
      const score = similarity(
        primaryText,
        SIGNAL_DB_MODE
          ? `${other.headline ?? ""}`
          : `${other.headline ?? ""} ${other.body ?? ""}`,
      )

      if (!((countryOverlap && score >= 0.34) || score >= 0.58)) continue

      maxSimilarity = Math.max(maxSimilarity, score)
      countryAgreement ||= countryOverlap
      corroboratingFamilies.add(otherFamily)

      edges.push({
        flash_id: flash.flash_id,
        corroboration_kind: "FLASH",
        corroborating_flash_id: other.flash_id,
        structured_event_id: null,
        corroborating_source_id: otherFamily,
        similarity: Number(score.toFixed(5)),
        country_overlap: countryOverlap,
        time_delta_seconds: delta,
        relationship_method: "TOKEN_SIMILARITY_TIME_COUNTRY_V1",
      })
    }

    let bestStructured:
      | {
          event: StructuredEvent
          similarity: number
          countryOverlap: boolean
          delta: number
        }
      | null = null

    for (const event of structuredEvents) {
      const delta = secondsBetween(
        primaryTime,
        event.last_seen_at ?? event.first_seen_at,
      )

      if (delta === null || delta > 5400) continue

      const countryOverlap = overlaps(
        primaryCountries,
        structuredCountries(event),
      )

      const score = similarity(
        primaryText,
        `${event.title ?? ""} ${event.summary ?? ""}`,
      )

      if (!((countryOverlap && score >= 0.30) || score >= 0.55)) continue

      if (!bestStructured || score > bestStructured.similarity) {
        bestStructured = {
          event,
          similarity: score,
          countryOverlap,
          delta,
        }
      }
    }

    if (bestStructured) {
      maxSimilarity = Math.max(maxSimilarity, bestStructured.similarity)
      countryAgreement ||= bestStructured.countryOverlap
      corroboratingFamilies.add("gdelt_structured")

      edges.push({
        flash_id: flash.flash_id,
        corroboration_kind: "STRUCTURED_EVENT",
        corroborating_flash_id: null,
        structured_event_id: bestStructured.event.id,
        corroborating_source_id: "gdelt_structured",
        similarity: Number(bestStructured.similarity.toFixed(5)),
        country_overlap: bestStructured.countryOverlap,
        time_delta_seconds: bestStructured.delta,
        relationship_method: "STRUCTURED_EVENT_SIMILARITY_TIME_COUNTRY_V1",
      })
    }

    const resetResult = await db
      .from("live_flash_corroborations")
      .delete()
      .eq("flash_id", flash.flash_id)

    if (resetResult.error) {
      console.error(resetResult.error)
      return jsonResponse(500, { ok: false, error: "corroboration_reset_failed" })
    }

    if (edges.length) {
      const insertResult = await db
        .from("live_flash_corroborations")
        .insert(edges)

      if (insertResult.error) {
        console.error(insertResult.error)
        return jsonResponse(500, { ok: false, error: "corroboration_store_failed" })
      }

      edgesWritten += edges.length
    }

    const distinctSourceCount = 1 + corroboratingFamilies.size
    const structuredEvidenceCount = Number(
      bestStructured?.event.independent_source_count ?? 0,
    )

    const prior = Math.max(
      0,
      Math.min(
        10,
        Number(
          SIGNAL_DB_MODE
            ? (flash.source_reliability_bps ?? 5000) / 100
            : (flash.source_reliability ?? 50)
        ) * 0.10,
      ),
    )

    const verificationScore = Math.max(
      0,
      Math.min(
        100,
        prior +
          Math.min(35, corroboratingFamilies.size * 17.5) +
          maxSimilarity * 30 +
          (countryAgreement ? 10 : 0) +
          (bestStructured ? Math.min(20, 8 + structuredEvidenceCount * 4) : 0),
      ),
    )

    const strongStructuredMatch = Boolean(
      bestStructured &&
        bestStructured.similarity >= 0.38 &&
        bestStructured.event.independent_source_count >= 2,
    )

    const strongMultiSourceMatch =
      distinctSourceCount >= 3 && maxSimilarity >= 0.40

    let nextStatus = "UNVERIFIED"
    let reason = "No independent corroboration yet"

    if (
      corroboratingFamilies.size > 0 &&
      (strongStructuredMatch || strongMultiSourceMatch) &&
      verificationScore >= 65
    ) {
      nextStatus = "VERIFIED"
      reason = strongStructuredMatch
        ? "Matched an independently sourced structured event"
        : "Matched at least two independent fast sources"
    } else if (
      corroboratingFamilies.size > 0 &&
      verificationScore >= 35
    ) {
      nextStatus = "CORROBORATING"
      reason = "Independent matching evidence found; verification threshold not yet met"
    }

    const updateResult = await db
      .from("live_flash_events")
      .update({
        verification_status: nextStatus,
        verification_score: SIGNAL_DB_MODE
          ? null
          : Number(verificationScore.toFixed(3)),
        verification_score_bps: SIGNAL_DB_MODE
          ? Math.round(verificationScore * 100)
          : null,
        corroboration_count: edges.length,
        independent_source_count: distinctSourceCount,
        verified_at: nextStatus === "VERIFIED" ? new Date().toISOString() : null,
        verification_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("flash_id", flash.flash_id)

    if (updateResult.error) {
      console.error(updateResult.error)
      return jsonResponse(500, { ok: false, error: "verification_update_failed" })
    }

    // Canonical event family routing is deliberately downstream of source
    // verification. It deduplicates the same real-world event across
    // independent sources and increments the family version only for a
    // material source revision.
    if (
      flash.signal_category !== "UNCLASSIFIED" &&
      flash.signal_category !== undefined
    ) {
      const sourceCountries = countryByFlash.get(flash.flash_id) ?? new Set<string>()
      const candidates = [...familyById.values()].filter((family) => {
        if (family.signal_category !== flash.signal_category) return false
        const delta = secondsBetween(
          flash.published_at ?? flash.ingested_at,
          family.last_seen_at,
        )
        if (delta === null || delta > 6 * 60 * 60) return false
        const familyCountries = new Set(
          (family.country_isos ?? []).map((value) => String(value).toUpperCase()),
        )
        const countryOverlap = overlaps(sourceCountries, familyCountries)
        const score = similarity(
          flash.headline,
          family.canonical_headline,
        )
        return (countryOverlap && score >= 0.30) || score >= 0.58
      })

      let family = flash.event_family_id ? familyById.get(flash.event_family_id) : undefined

      if (!family && candidates.length) {
        family = candidates.reduce((best, candidate) => {
          const score = similarity(flash.headline, candidate.canonical_headline)
          if (!best) return { candidate, score } as unknown as EventFamily
          const bestScore = similarity(flash.headline, best.canonical_headline)
          return score > bestScore ? candidate : best
        }, undefined as EventFamily | undefined)
      }

      if (!family) {
        const countries = [...sourceCountries].sort()
        const createFamily = await db
          .from("live_flash_event_families")
          .insert({
            signal_category: flash.signal_category,
            canonical_headline: flash.headline,
            country_isos: countries,
            first_seen_at: flash.first_seen_at ?? flash.ingested_at,
            last_seen_at: flash.last_seen_at ?? flash.ingested_at,
            current_version: 1,
            current_status: "ACTIVE",
            source_count: 0,
            independent_source_count: 0,
            latest_flash_id: flash.flash_id,
            latest_content_hash: flash.content_hash,
          })
          .select("family_id,signal_category,canonical_headline,country_isos,first_seen_at,last_seen_at,current_version,current_status,source_count,independent_source_count,last_material_update_at,latest_update_reason,latest_flash_id,latest_content_hash")
          .single()

        if (createFamily.error || !createFamily.data) {
          console.error(createFamily.error)
          return jsonResponse(500, { ok: false, error: "family_create_failed" })
        }

        family = createFamily.data as EventFamily
        familyById.set(family.family_id, family)
        familyMemberIds.set(family.family_id, new Set<string>())
        familySourceFamilies.set(family.family_id, new Set<string>())
      }

      const members = familyMemberIds.get(family.family_id) ?? new Set<string>()
      const sources = familySourceFamilies.get(family.family_id) ?? new Set<string>()
      const sourceFamily = flashFamily(flash)
      const isNewMember = !members.has(flash.flash_id)

      if (isNewMember) {
        const memberInsert = await db
          .from("live_flash_event_family_members")
          .insert({
            family_id: family.family_id,
            flash_id: flash.flash_id,
            linked_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
          })

        if (memberInsert.error) {
          console.error(memberInsert.error)
          return jsonResponse(500, { ok: false, error: "family_member_store_failed" })
        }

        members.add(flash.flash_id)
        sources.add(sourceFamily)
        familyMemberIds.set(family.family_id, members)
        familySourceFamilies.set(family.family_id, sources)
      } else {
        sources.add(sourceFamily)
      }

      const familyCountries = new Set(
        (family.country_isos ?? []).map((value) => String(value).toUpperCase()),
      )
      for (const country of sourceCountries) familyCountries.add(country)

      const isMaterialFamilyUpdate = Boolean(
        flash.material_update &&
        family.latest_content_hash !== flash.content_hash,
      )
      const nextVersion = isMaterialFamilyUpdate
        ? family.current_version + 1
        : family.current_version

      const familyUpdate = await db
        .from("live_flash_event_families")
        .update({
          canonical_headline: isMaterialFamilyUpdate ? flash.headline : family.canonical_headline,
          country_isos: [...familyCountries].sort(),
          first_seen_at:
            new Date(family.first_seen_at).getTime() <= new Date(flash.first_seen_at ?? flash.ingested_at).getTime()
              ? family.first_seen_at
              : flash.first_seen_at ?? flash.ingested_at,
          last_seen_at:
            new Date(family.last_seen_at).getTime() >= new Date(flash.last_seen_at ?? flash.ingested_at).getTime()
              ? family.last_seen_at
              : flash.last_seen_at ?? flash.ingested_at,
          current_version: nextVersion,
          source_count: members.size,
          independent_source_count: sources.size,
          last_material_update_at: isMaterialFamilyUpdate
            ? (flash.last_seen_at ?? flash.ingested_at)
            : family.last_material_update_at,
          latest_update_reason: isMaterialFamilyUpdate
            ? flash.material_update_reason
            : family.latest_update_reason,
          latest_flash_id: flash.flash_id,
          latest_content_hash: flash.content_hash,
          updated_at: new Date().toISOString(),
        })
        .eq("family_id", family.family_id)

      if (familyUpdate.error) {
        console.error(familyUpdate.error)
        return jsonResponse(500, { ok: false, error: "family_update_failed" })
      }

      const flashFamilyUpdate = await db
        .from("live_flash_events")
        .update({
          event_family_id: family.family_id,
        })
        .eq("flash_id", flash.flash_id)

      if (flashFamilyUpdate.error) {
        console.error(flashFamilyUpdate.error)
        return jsonResponse(500, { ok: false, error: "flash_family_link_failed" })
      }

      family = {
        ...family,
        canonical_headline: isMaterialFamilyUpdate ? flash.headline : family.canonical_headline,
        country_isos: [...familyCountries].sort(),
        current_version: nextVersion,
        first_seen_at:
          new Date(family.first_seen_at).getTime() <= new Date(flash.first_seen_at ?? flash.ingested_at).getTime()
            ? family.first_seen_at
            : flash.first_seen_at ?? flash.ingested_at,
        last_seen_at:
          new Date(family.last_seen_at).getTime() >= new Date(flash.last_seen_at ?? flash.ingested_at).getTime()
            ? family.last_seen_at
            : flash.last_seen_at ?? flash.ingested_at,
        source_count: members.size,
        independent_source_count: sources.size,
        last_material_update_at: isMaterialFamilyUpdate
          ? (flash.last_seen_at ?? flash.ingested_at)
          : family.last_material_update_at,
        latest_update_reason: isMaterialFamilyUpdate
          ? flash.material_update_reason
          : family.latest_update_reason,
        latest_flash_id: flash.flash_id,
        latest_content_hash: flash.content_hash,
      }
      familyById.set(family.family_id, family)
    }
    if (nextStatus === "VERIFIED") verified += 1
    else if (nextStatus === "CORROBORATING") corroborating += 1
    else unverified += 1
  }

  return jsonResponse(200, {
    ok: true,
    processed: flashes.length,
    verified,
    corroborating,
    unverified,
    edges_written: edgesWritten,
    structured_events_seen: structuredEvents.length,
  })
})
