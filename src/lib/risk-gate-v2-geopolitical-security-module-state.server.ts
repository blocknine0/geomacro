import { requireRiskSupabase } from "./risk-supabase.server";
import {
  buildRiskGateV2GeopoliticalSecurityModuleState,
  RISK_GATE_V2_CONFLICT_LOOKBACK_DAYS,
  type RiskGateV2ConflictCountryInput,
} from "./risk-gate-v2-geopolitical-security-module-state";

const UCDP_PAGE_SIZE = 1_000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function fetchCandidateRows(asOf: string) {
  const db = requireRiskSupabase();
  const asOfDate = new Date(asOf);
  if (Number.isNaN(asOfDate.getTime())) {
    throw new Error("Risk Gate v2 conflict as_of must be a valid timestamp");
  }

  const from = new Date(
    asOfDate.getTime() - RISK_GATE_V2_CONFLICT_LOOKBACK_DAYS * 86_400_000,
  ).toISOString();

  const rows: Array<Record<string, unknown>> = [];
  for (let start = 0; ; start += UCDP_PAGE_SIZE) {
    const result = await db
      .from("live_ucdp_candidate_latest")
      .select(`
        country_iso3,
        value_numeric,
        observed_at,
        ingested_at,
        provenance,
        quality_status,
        commercial_eligibility_status
      `)
      .gte("observed_at", from)
      .lte("observed_at", asOfDate.toISOString())
      .order("observed_at", { ascending: true })
      .range(start, start + UCDP_PAGE_SIZE - 1);

    if (result.error) throw result.error;
    const page = (result.data ?? []) as Array<Record<string, unknown>>;
    rows.push(...page);
    if (page.length < UCDP_PAGE_SIZE) break;
  }

  return rows;
}

async function fetchPopulationByCountry(asOf: string) {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_external_observations")
    .select(`
      country_iso3,
      value_numeric,
      observed_at,
      ingested_at
    `)
    .eq("source_id", "world_bank_indicators")
    .eq("metric", "population_total")
    .eq("quality_status", "VERIFIED")
    .eq("commercial_eligibility_status", "VERIFIED")
    .lte("observed_at", asOf)
    .order("observed_at", { ascending: false })
    .order("ingested_at", { ascending: false })
    .limit(10_000);

  if (result.error) throw result.error;

  const byCountry = new Map<
    string,
    { population: number; observed_at: string }
  >();

  for (const row of result.data ?? []) {
    const iso3 =
      typeof row.country_iso3 === "string"
        ? row.country_iso3.trim().toUpperCase()
        : "";
    const population = numeric(row.value_numeric);
    const observedAt = validTimestamp(row.observed_at);
    if (
      !/^[A-Z]{3}$/.test(iso3) ||
      population === null ||
      population <= 0 ||
      !observedAt ||
      byCountry.has(iso3)
    ) {
      continue;
    }
    byCountry.set(iso3, { population, observed_at: observedAt });
  }

  return byCountry;
}

async function fetchEnabledCountryIso3() {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_country_registry")
    .select("iso3")
    .eq("enabled", true)
    .order("iso3", { ascending: true });
  if (result.error) throw result.error;

  return (result.data ?? [])
    .map((row) =>
      typeof row.iso3 === "string" ? row.iso3.trim().toUpperCase() : "",
    )
    .filter((iso3) => /^[A-Z]{3}$/.test(iso3));
}

export async function generateRiskGateV2GeopoliticalSecurityModuleState(input: {
  country_iso3: string;
  as_of: string;
  generated_at?: string;
  risk_object_ids?: string[];
}) {
  const asOf = new Date(input.as_of);
  if (Number.isNaN(asOf.getTime())) {
    throw new Error("Risk Gate v2 conflict as_of must be a valid timestamp");
  }

  const [candidateRows, populationByCountry, countryIso3] = await Promise.all([
    fetchCandidateRows(asOf.toISOString()),
    fetchPopulationByCountry(asOf.toISOString()),
    fetchEnabledCountryIso3(),
  ]);

  if (candidateRows.length === 0) return null;

  let sourceRetrievedAt: string | null = null;
  const aggregates = new Map<
    string,
    { verified_event_count: number; excluded_event_count: number; deaths: number }
  >();

  for (const row of candidateRows) {
    const provenance = asRecord(row.provenance);
    const retrievedAt =
      validTimestamp(provenance.retrieved_at) ?? validTimestamp(row.ingested_at);
    if (
      retrievedAt &&
      (!sourceRetrievedAt ||
        new Date(retrievedAt).getTime() > new Date(sourceRetrievedAt).getTime())
    ) {
      sourceRetrievedAt = retrievedAt;
    }

    const iso3 =
      typeof row.country_iso3 === "string"
        ? row.country_iso3.trim().toUpperCase()
        : "";
    if (!/^[A-Z]{3}$/.test(iso3)) continue;

    const aggregate = aggregates.get(iso3) ?? {
      verified_event_count: 0,
      excluded_event_count: 0,
      deaths: 0,
    };

    const deaths = numeric(row.value_numeric);
    const admitted =
      row.quality_status === "VERIFIED" &&
      row.commercial_eligibility_status === "VERIFIED" &&
      deaths !== null &&
      deaths >= 0;

    if (admitted) {
      aggregate.verified_event_count += 1;
      aggregate.deaths += deaths;
    } else {
      aggregate.excluded_event_count += 1;
    }
    aggregates.set(iso3, aggregate);
  }

  if (!sourceRetrievedAt) return null;

  const countries: RiskGateV2ConflictCountryInput[] = [];
  for (const iso3 of countryIso3) {
    const population = populationByCountry.get(iso3);
    if (!population) continue;
    const aggregate = aggregates.get(iso3) ?? {
      verified_event_count: 0,
      excluded_event_count: 0,
      deaths: 0,
    };
    countries.push({
      country_iso3: iso3,
      population: population.population,
      population_observed_at: population.observed_at,
      verified_event_count: aggregate.verified_event_count,
      excluded_event_count: aggregate.excluded_event_count,
      best_estimate_deaths: aggregate.deaths,
    });
  }

  return buildRiskGateV2GeopoliticalSecurityModuleState({
    country_iso3: input.country_iso3,
    current: {
      as_of: asOf.toISOString(),
      source_retrieved_at: sourceRetrievedAt,
      countries,
    },
    generated_at: input.generated_at ?? new Date().toISOString(),
    risk_object_ids: input.risk_object_ids,
  });
}
