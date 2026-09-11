import { requireRiskSupabase } from "./risk-supabase.server";

export type TestnetSeveritySubject =
  | { type: "country"; country_iso3: string }
  | { type: "corridor"; origin_country_iso3: string; destination_country_iso3: string };

export type TestnetSeverityEvent = {
  event_id: string;
  event_type: string | null;
  primary_country: string | null;
  countries: string[];
  severity: number;
  confidence: number | null;
  direction: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  structure_version: string | null;
};

function iso3(value: string) {
  return value.trim().toUpperCase();
}

function countriesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map(iso3).filter((item) => /^[A-Z]{3}$/.test(item));
}

function touches(row: Record<string, unknown>, subject: TestnetSeveritySubject) {
  const primary = row.primary_country ? iso3(String(row.primary_country)) : null;
  const countries = countriesOf(row.countries);
  const all = new Set(primary ? [primary, ...countries] : countries);

  if (subject.type === "country") return all.has(iso3(subject.country_iso3));

  const origin = iso3(subject.origin_country_iso3);
  const destination = iso3(subject.destination_country_iso3);
  return all.has(origin) || all.has(destination);
}

export async function loadTestnetLiveSeverity(subject: TestnetSeveritySubject) {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_structured_events")
    .select("id,event_type,primary_country,countries,severity,confidence,direction,first_seen_at,last_seen_at,structure_version")
    .not("severity", "is", null)
    .order("last_seen_at", { ascending: false })
    .limit(200);

  if (result.error) throw result.error;

  const events = ((result.data ?? []) as Record<string, unknown>[])
    .filter((row) => touches(row, subject))
    .slice(0, 12)
    .map((row): TestnetSeverityEvent => ({
      event_id: String(row.id ?? ""),
      event_type: row.event_type == null ? null : String(row.event_type),
      primary_country: row.primary_country == null ? null : iso3(String(row.primary_country)),
      countries: countriesOf(row.countries),
      severity: Number(row.severity),
      confidence: row.confidence == null ? null : Number(row.confidence),
      direction: row.direction == null ? null : String(row.direction),
      first_seen_at: row.first_seen_at == null ? null : String(row.first_seen_at),
      last_seen_at: row.last_seen_at == null ? null : String(row.last_seen_at),
      structure_version: row.structure_version == null ? null : String(row.structure_version),
    }))
    .filter((row) => Number.isFinite(row.severity) && row.severity >= 0 && row.severity <= 100);

  const maxSeverity = events.length ? Math.max(...events.map((row) => row.severity)) : null;
  const latestSeverity = events[0]?.severity ?? null;

  return {
    scale: "0-100" as const,
    latest_severity: latestSeverity,
    max_recent_severity: maxSeverity,
    events,
    source_table: "live_structured_events" as const,
  };
}
