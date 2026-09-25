// Structural boundary keeps the same loader testable in Node and deployable in Deno.
type WindowQuery = PromiseLike<{
  data: Record<string, unknown>[] | null
  error: unknown
  count: number | null
}> & {
  eq(column: string, value: string): WindowQuery
  gte(column: string, value: string): WindowQuery
  lte(column: string, value: string): WindowQuery
  in(column: string, values: string[]): WindowQuery
  order(column: string, options: { ascending: boolean }): WindowQuery
  limit(count: number): WindowQuery
}
type WindowClient = {
  from(table: string): {
    select(columns: string, options: { count: "exact" }): WindowQuery
  }
}

export const COUNTRY_WINDOW_LIMIT = 600
export const COUNTRY_BATCH_SIZE = 120
export const COUNTRY_FLASH_SELECT = "flash_id,source_id,source_channel,published_at,ingested_at,headline,body,source_reliability,verification_status,signal_category,source_version,event_family_id,material_update,material_update_reason,content_hash,first_seen_at,last_seen_at,last_material_update_at"

/** Country replay must include peers still awaiting verification. A 90-minute
 * ingestion queue permanently strands older rows when corroboration arrives late.
 * Scan a bounded, country-scoped six-hour corpus; page over all IDs, not the mutable
 * verification-status subset, so updates in one batch cannot skip the next batch.
 */
export async function loadCountryCorroborationWindow(
  db: WindowClient,
  iso3: string,
  asOf: string,
  offset: number,
) {
  const cutoff = new Date(Date.parse(asOf) - 6 * 3_600_000).toISOString()
  const result = await db.from("live_flash_events")
    .select(`${COUNTRY_FLASH_SELECT},live_flash_event_countries!inner(country_iso3)`, { count: "exact" })
    .eq("live_flash_event_countries.country_iso3", iso3)
    .gte("last_seen_at", cutoff)
    .lte("last_seen_at", asOf)
    .in("verification_status", ["UNVERIFIED", "CORROBORATING", "VERIFIED"])
    .order("flash_id", { ascending: true })
    .limit(COUNTRY_WINDOW_LIMIT)

  if (result.error) throw result.error
  if (result.count === null || result.count > COUNTRY_WINDOW_LIMIT) {
    throw new Error("country_corroboration_window_overflow: refusing a truncated evidence corpus")
  }
  const flashes = (result.data ?? []).map((row: Record<string, unknown>) => {
    const { live_flash_event_countries: _countryLinks, ...flash } = row
    return flash
  })
  if (flashes.length !== result.count) {
    throw new Error("country_corroboration_window_incomplete")
  }
  const end = offset + COUNTRY_BATCH_SIZE
  return {
    flashes,
    candidates: flashes.slice(offset, end).filter(row => row.verification_status !== "VERIFIED"),
    nextOffset: end < flashes.length ? end : null,
    asOf,
  }
}
