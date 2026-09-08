import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AgenticDemoRequest,
  DemoStructuralContext,
  DemoStructuralObservation,
} from "./agentic-demo-contract";

let cachedHistoricalClient: SupabaseClient | null | undefined;

function getHistoricalClient(): SupabaseClient | null {
  if (cachedHistoricalClient !== undefined) return cachedHistoricalClient;

  const url = process.env.HISTORICAL_SUPABASE_URL;
  const serviceKey = process.env.HISTORICAL_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    cachedHistoricalClient = null;
    return null;
  }

  cachedHistoricalClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedHistoricalClient;
}

type StructuralRow = {
  observation_id: string;
  source_id: string;
  dimension: string;
  country_iso3: string | null;
  partner_country_iso3: string | null;
  observed_at: string | null;
  published_at: string | null;
  metric: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  signal_type: string | null;
  source_url: string | null;
  normalized_hash: string;
};

const COLUMNS = [
  "observation_id",
  "source_id",
  "dimension",
  "country_iso3",
  "partner_country_iso3",
  "observed_at",
  "published_at",
  "metric",
  "value_numeric",
  "value_text",
  "unit",
  "signal_type",
  "source_url",
  "normalized_hash",
].join(",");

function latestPerKey(rows: StructuralRow[], limit: number): DemoStructuralObservation[] {
  const sorted = [...rows].sort((a, b) => {
    const at = Date.parse(a.observed_at ?? a.published_at ?? "1970-01-01T00:00:00Z");
    const bt = Date.parse(b.observed_at ?? b.published_at ?? "1970-01-01T00:00:00Z");
    return bt - at;
  });

  const seen = new Set<string>();
  const out: DemoStructuralObservation[] = [];

  for (const row of sorted) {
    const key = [
      row.dimension,
      row.metric,
      row.country_iso3 ?? "",
      row.partner_country_iso3 ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }

  return out;
}

async function fetchCountryRows(db: SupabaseClient, iso3: string) {
  const { data, error } = await db
    .from("commercial_structural_geopolitical_observations")
    .select(COLUMNS)
    .eq("country_iso3", iso3)
    .order("observed_at", { ascending: false, nullsFirst: false })
    .limit(80);

  if (error) throw error;
  return (data ?? []) as unknown as StructuralRow[];
}

async function fetchDirectCorridorRows(
  db: SupabaseClient,
  origin: string,
  destination: string,
) {
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
    ...((forward.data ?? []) as unknown as StructuralRow[]),
    ...((reverse.data ?? []) as unknown as StructuralRow[]),
  ];
}

export async function loadStructuralContext(
  request: AgenticDemoRequest,
): Promise<DemoStructuralContext> {
  const db = getHistoricalClient();

  if (!db) {
    return {
      status: "NOT_CONFIGURED",
      methodology_status: "EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
      observations: [],
      note:
        "Structural evidence is not configured in this runtime. Risk Gate continues to use its signed current Risk Object; no missing structural observation is treated as zero risk.",
    };
  }

  try {
    let rows: StructuralRow[] = [];

    if (request.subject.type === "country") {
      rows = await fetchCountryRows(db, request.subject.country_iso3);
    } else {
      const [originRows, destinationRows, directRows] = await Promise.all([
        fetchCountryRows(db, request.subject.origin_country_iso3),
        fetchCountryRows(db, request.subject.destination_country_iso3),
        fetchDirectCorridorRows(
          db,
          request.subject.origin_country_iso3,
          request.subject.destination_country_iso3,
        ),
      ]);
      rows = [...directRows, ...originRows, ...destinationRows];
    }

    const observations = latestPerKey(rows, 12);

    return {
      status: observations.length > 0 ? "AVAILABLE" : "UNAVAILABLE",
      methodology_status: "EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
      observations,
      note:
        observations.length > 0
          ? "Structural observations are provenance-first evidence context only. They are displayed separately and are not a hidden fourth input to GRI v1.2 or an undisclosed Risk Gate weight."
          : "No commercially eligible structural observations were found for this demo subject. Missing structural data is disclosed and is never converted to zero risk.",
    };
  } catch (error) {
    console.error("[structural-context] query failed", error);
    return {
      status: "UNAVAILABLE",
      methodology_status: "EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
      observations: [],
      note:
        "Structural evidence could not be loaded. The demo fails visibly for this layer and does not substitute fabricated or zero-valued structural data.",
    };
  }
}
