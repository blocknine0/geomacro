import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const STRUCTURAL_METHODOLOGY_STATUS =
  "EVIDENCE_ONLY_NOT_IN_GRI_V1_2" as const;

export type StructuralSubject =
  | {
      type: "country";
      country_iso3: string;
    }
  | {
      type: "corridor";
      origin_country_iso3: string;
      destination_country_iso3: string;
    };

export type StructuralObservation = {
  observation_id: string;
  source_id: string;
  source_record_id: string | null;
  dimension: string;
  country_iso3: string | null;
  partner_country_iso3: string | null;
  observed_at: string | null;
  published_at: string | null;
  metric: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  event_type: string | null;
  signal_type: string | null;
  source_url: string | null;
  parser_version: string | null;
  methodology_status: string | null;
  quality_status: string | null;
  provenance: unknown;
  normalized_hash: string;
  retrieved_at: string | null;
};

export type StructuralContext = {
  status: "AVAILABLE" | "UNAVAILABLE" | "NOT_CONFIGURED";
  methodology_status: typeof STRUCTURAL_METHODOLOGY_STATUS;
  subject: StructuralSubject;
  observations: StructuralObservation[];
  note: string;
};

let cachedHistoricalClient: SupabaseClient | null = null;

/**
 * Historical data is a separate private warehouse.
 *
 * IMPORTANT: never memoise a missing runtime configuration. Cloudflare-style
 * request environments can bind secrets after module evaluation. Only cache a
 * successfully-created client, mirroring the main app Supabase client rule.
 */
function getHistoricalClient(): SupabaseClient | null {
  if (cachedHistoricalClient) return cachedHistoricalClient;

  const url = process.env.HISTORICAL_SUPABASE_URL;
  const serviceKey = process.env.HISTORICAL_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) return null;

  cachedHistoricalClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedHistoricalClient;
}

const COLUMNS = [
  "observation_id",
  "source_id",
  "source_record_id",
  "dimension",
  "country_iso3",
  "partner_country_iso3",
  "observed_at",
  "published_at",
  "metric",
  "value_numeric",
  "value_text",
  "unit",
  "event_type",
  "signal_type",
  "source_url",
  "parser_version",
  "methodology_status",
  "quality_status",
  "provenance",
  "normalized_hash",
  "retrieved_at",
].join(",");

function normalizeIso3(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error(`Invalid ISO3 country code: ${value}`);
  }
  return normalized;
}

function normalizeSubject(subject: StructuralSubject): StructuralSubject {
  if (subject.type === "country") {
    return {
      type: "country",
      country_iso3: normalizeIso3(subject.country_iso3),
    };
  }

  const origin = normalizeIso3(subject.origin_country_iso3);
  const destination = normalizeIso3(subject.destination_country_iso3);
  if (origin === destination) {
    throw new Error("Structural corridor endpoints must be different countries");
  }

  return {
    type: "corridor",
    origin_country_iso3: origin,
    destination_country_iso3: destination,
  };
}

function rowTime(row: StructuralObservation): number {
  const value = row.observed_at ?? row.published_at ?? row.retrieved_at;
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Keep the newest observation for the same dimension/metric/country pair.
 * This is presentation/query compaction only; it is not scoring, weighting,
 * normalization or a GRI/GRO methodology step.
 */
export function latestStructuralObservations(
  rows: StructuralObservation[],
  limit = 12,
): StructuralObservation[] {
  const sorted = [...rows].sort((a, b) => rowTime(b) - rowTime(a));
  const seen = new Set<string>();
  const output: StructuralObservation[] = [];

  for (const row of sorted) {
    const key = [
      row.dimension,
      row.metric,
      row.country_iso3 ?? "",
      row.partner_country_iso3 ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(row);
    if (output.length >= limit) break;
  }

  return output;
}

async function fetchCountryRows(
  db: SupabaseClient,
  iso3: string,
): Promise<StructuralObservation[]> {
  const result = await db
    .from("commercial_structural_geopolitical_observations")
    .select(COLUMNS)
    .eq("country_iso3", iso3)
    .order("observed_at", { ascending: false, nullsFirst: false })
    .limit(80);

  if (result.error) throw result.error;
  return (result.data ?? []) as unknown as StructuralObservation[];
}

async function fetchDirectCorridorRows(
  db: SupabaseClient,
  origin: string,
  destination: string,
): Promise<StructuralObservation[]> {
  const [forward, reverse] = await Promise.all([
    db
      .from("commercial_structural_geopolitical_observations")
      .select(COLUMNS)
      .eq("country_iso3", origin)
      .eq("partner_country_iso3", destination)
      .order("observed_at", { ascending: false, nullsFirst: false })
      .limit(40),
    db
      .from("commercial_structural_geopolitical_observations")
      .select(COLUMNS)
      .eq("country_iso3", destination)
      .eq("partner_country_iso3", origin)
      .order("observed_at", { ascending: false, nullsFirst: false })
      .limit(40),
  ]);

  if (forward.error) throw forward.error;
  if (reverse.error) throw reverse.error;

  return [
    ...((forward.data ?? []) as unknown as StructuralObservation[]),
    ...((reverse.data ?? []) as unknown as StructuralObservation[]),
  ];
}

export async function loadStructuralContext(
  requestedSubject: StructuralSubject,
): Promise<StructuralContext> {
  const subject = normalizeSubject(requestedSubject);
  const db = getHistoricalClient();

  if (!db) {
    return {
      status: "NOT_CONFIGURED",
      methodology_status: STRUCTURAL_METHODOLOGY_STATUS,
      subject,
      observations: [],
      note:
        "Structural evidence is not configured in this runtime. Missing historical context is never converted to zero risk and does not alter GRI v1.2.",
    };
  }

  try {
    let rows: StructuralObservation[];

    if (subject.type === "country") {
      rows = await fetchCountryRows(db, subject.country_iso3);
    } else {
      const [originRows, destinationRows, directRows] = await Promise.all([
        fetchCountryRows(db, subject.origin_country_iso3),
        fetchCountryRows(db, subject.destination_country_iso3),
        fetchDirectCorridorRows(
          db,
          subject.origin_country_iso3,
          subject.destination_country_iso3,
        ),
      ]);
      rows = [...directRows, ...originRows, ...destinationRows];
    }

    const observations = latestStructuralObservations(rows, 12);

    return {
      status: observations.length > 0 ? "AVAILABLE" : "UNAVAILABLE",
      methodology_status: STRUCTURAL_METHODOLOGY_STATUS,
      subject,
      observations,
      note:
        observations.length > 0
          ? "These rows come only from the curated commercial structural view. They are provenance-first evidence context, not a hidden fourth GRI v1.2 domain or an undisclosed Risk Gate weight."
          : "No commercially eligible structural observations were found for this subject. Missing structural data is disclosed and is never interpreted as zero risk.",
    };
  } catch (error) {
    console.error("[structural-context] curated historical query failed", error);
    return {
      status: "UNAVAILABLE",
      methodology_status: STRUCTURAL_METHODOLOGY_STATUS,
      subject,
      observations: [],
      note:
        "Structural evidence could not be loaded from the curated historical interface. Geomacro does not substitute fabricated, stale, or zero-valued structural data.",
    };
  }
}
