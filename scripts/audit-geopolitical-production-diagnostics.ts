import { writeFile } from "node:fs/promises";
import { classifyGlobalEntity } from "../src/lib/global-entity-classification";
import { requireRiskSupabase } from "../src/lib/risk-supabase.server";
import {
  generateRiskGateV2GeopoliticalSecurityModuleState,
} from "../src/lib/risk-gate-v2-geopolitical-security-module-state.server";
import {
  RISK_GATE_V2_CONFLICT_LOOKBACK_DAYS,
  RISK_GATE_V2_CONFLICT_MIN_PEERS,
  RISK_GATE_V2_CONFLICT_SOURCE_MAX_AGE_DAYS,
} from "../src/lib/risk-gate-v2-geopolitical-security-module-state";

const OUTPUT =
  process.env.GEOPOLITICAL_PRODUCTION_DIAGNOSTICS_OUTPUT ??
  "geopolitical-production-diagnostics.json";
const UCDP_SOURCE_ID = "ucdp_candidate";
const WDI_SOURCE_ID = "world_bank_indicators";
const POPULATION_METRIC = "population_total";
const PAGE_SIZE = 1000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function validIso3(value: unknown) {
  const iso3 = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(iso3) ? iso3 : null;
}

function validTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function numeric(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function ageDays(value: string | null, nowMs: number) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, (nowMs - ms) / 86_400_000);
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

async function fetchAll(
  table: string,
  select: string,
  configure?: (query: any) => any,
) {
  const db = requireRiskSupabase();
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query: any = db
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1);
    if (configure) query = configure(query);
    const result = await query;
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadSovereignRegistry() {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_country_registry")
    .select("iso3,country_name,enabled")
    .eq("enabled", true)
    .order("iso3", { ascending: true });
  if (result.error) throw result.error;
  return (result.data ?? [])
    .map((row) => ({
      iso3: validIso3(row.iso3) ?? "",
      country_name:
        typeof row.country_name === "string" ? row.country_name : null,
    }))
    .filter(
      (row) => row.iso3 && classifyGlobalEntity(row.iso3) === "SOVEREIGN",
    );
}

async function loadLatestCleanManifest(asOf: string) {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_source_release_manifests")
    .select(
      "release_id,retrieved_at,coverage_start,coverage_end,manifest_hash,verified_rows,partial_rows,rejected_rows,unmapped_rows,write_completed,metadata",
    )
    .eq("source_id", UCDP_SOURCE_ID)
    .eq("write_completed", true)
    .eq("rejected_rows", 0)
    .eq("unmapped_rows", 0)
    .lte("retrieved_at", asOf)
    .order("retrieved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  const metadata = record(result.data.metadata);
  const releaseRank = Number(metadata.release_rank ?? 0);
  return {
    release_id: result.data.release_id,
    release_rank:
      Number.isInteger(releaseRank) && releaseRank > 0 ? releaseRank : null,
    retrieved_at: validTimestamp(result.data.retrieved_at),
    coverage_start: validTimestamp(result.data.coverage_start),
    coverage_end: validTimestamp(result.data.coverage_end),
    manifest_hash: result.data.manifest_hash,
    verified_rows: Number(result.data.verified_rows ?? 0),
    partial_rows: Number(result.data.partial_rows ?? 0),
    rejected_rows: Number(result.data.rejected_rows ?? 0),
    unmapped_rows: Number(result.data.unmapped_rows ?? 0),
    write_completed: result.data.write_completed === true,
  };
}

async function main() {
  const now = new Date();
  const nowMs = now.getTime();
  const asOf = now.toISOString();
  const lookbackStart = new Date(
    nowMs - RISK_GATE_V2_CONFLICT_LOOKBACK_DAYS * 86_400_000,
  ).toISOString();

  const [registry, manifest, sources, candidateRows, populationRows] =
    await Promise.all([
      loadSovereignRegistry(),
      loadLatestCleanManifest(asOf),
      fetchAll(
        "live_external_sources",
        "source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,updated_at",
        (query) => query
          .in("source_id", [UCDP_SOURCE_ID, WDI_SOURCE_ID])
          .order("source_id"),
      ),
      fetchAll(
        "live_ucdp_candidate_latest",
        "country_iso3,value_numeric,observed_at,provenance,quality_status,commercial_eligibility_status",
        (query) => query
          .gte("observed_at", lookbackStart)
          .lte("observed_at", asOf)
          .order("observed_at", { ascending: true }),
      ),
      fetchAll(
        "live_world_bank_indicator_latest",
        "country_iso3,metric,value_numeric,observed_at",
        (query) => query
          .eq("metric", POPULATION_METRIC)
          .lte("observed_at", asOf)
          .order("country_iso3"),
      ),
    ]);

  const releaseRank = manifest?.release_rank ?? null;
  const releaseRows = candidateRows.filter((row) => {
    if (releaseRank === null) return false;
    return Number(record(row.provenance).release_rank ?? 0) === releaseRank;
  });

  type EventAggregate = {
    total: number;
    verified: number;
    excluded: number;
    deaths: number;
    excluded_reasons: Map<string, number>;
  };
  const events = new Map<string, EventAggregate>();
  for (const row of releaseRows) {
    const iso3 = validIso3(row.country_iso3);
    if (!iso3) continue;
    const current = events.get(iso3) ?? {
      total: 0,
      verified: 0,
      excluded: 0,
      deaths: 0,
      excluded_reasons: new Map<string, number>(),
    };
    current.total += 1;
    const deaths = numeric(row.value_numeric);
    const admitted =
      row.quality_status === "VERIFIED" &&
      row.commercial_eligibility_status === "VERIFIED" &&
      deaths !== null &&
      deaths >= 0;
    if (admitted) {
      current.verified += 1;
      current.deaths += deaths!;
    } else {
      current.excluded += 1;
      const reason = [
        `quality:${String(row.quality_status ?? "NULL")}`,
        `commercial:${String(row.commercial_eligibility_status ?? "NULL")}`,
        `deaths:${deaths === null ? "INVALID" : deaths < 0 ? "NEGATIVE" : "VALID"}`,
      ].join("|");
      increment(current.excluded_reasons, reason);
    }
    events.set(iso3, current);
  }

  const population = new Map<
    string,
    { value: number; observed_at: string; age_days: number | null }
  >();
  for (const row of populationRows) {
    const iso3 = validIso3(row.country_iso3);
    const value = numeric(row.value_numeric);
    const observedAt = validTimestamp(row.observed_at);
    if (!iso3 || value === null || value <= 0 || !observedAt || population.has(iso3)) {
      continue;
    }
    population.set(iso3, {
      value,
      observed_at: observedAt,
      age_days: ageDays(observedAt, nowMs),
    });
  }

  const generatorErrors = new Map<string, number>();
  const countries: Array<Record<string, unknown>> = [];
  let availableCount = 0;

  for (const country of registry) {
    const aggregate = events.get(country.iso3) ?? {
      total: 0,
      verified: 0,
      excluded: 0,
      deaths: 0,
      excluded_reasons: new Map<string, number>(),
    };
    const pop = population.get(country.iso3) ?? null;
    let generated = false;
    let generatorError: string | null = null;
    try {
      const state = await generateRiskGateV2GeopoliticalSecurityModuleState({
        country_iso3: country.iso3,
        as_of: asOf,
        generated_at: asOf,
      });
      generated = state?.module === "geopolitical_security";
    } catch (error) {
      generatorError =
        (error instanceof Error ? error.message : String(error)).slice(0, 240);
      increment(generatorErrors, generatorError);
    }

    let blocker = "NONE";
    if (!generated) {
      if (!manifest || releaseRank === null) blocker = "MISSING_OR_INVALID_RELEASE_MANIFEST";
      else if (!manifest.retrieved_at || (ageDays(manifest.retrieved_at, nowMs) ?? Infinity) > RISK_GATE_V2_CONFLICT_SOURCE_MAX_AGE_DAYS) {
        blocker = "STALE_RELEASE_MANIFEST";
      } else if (!pop) blocker = "MISSING_VERIFIED_POPULATION";
      else if (aggregate.excluded > 0) blocker = "BLOCKED_EVENT_QUALITY_OR_COMMERCIAL_ELIGIBILITY";
      else if (generatorError) blocker = "GENERATOR_ERROR";
      else blocker = "METHOD_OR_PEER_FAIL_CLOSED";
    } else {
      availableCount += 1;
    }

    countries.push({
      iso3: country.iso3,
      country_name: country.country_name,
      module_available: generated,
      blocker,
      verified_event_count: aggregate.verified,
      excluded_event_count: aggregate.excluded,
      event_rows_in_release_window: aggregate.total,
      best_estimate_deaths_sum: aggregate.deaths,
      excluded_reason_counts: Object.fromEntries(
        [...aggregate.excluded_reasons.entries()].sort(([a], [b]) => a.localeCompare(b)),
      ),
      population_available: Boolean(pop),
      population_observed_at: pop?.observed_at ?? null,
      population_age_days: pop?.age_days ?? null,
      generator_error: generatorError,
    });
  }

  const blockerCounts = new Map<string, number>();
  for (const row of countries) increment(blockerCounts, String(row.blocker));

  const sourceAgeDays = ageDays(manifest?.retrieved_at ?? null, nowMs);
  const report = {
    schema_version: "geomacro-geopolitical-production-diagnostics-1.0",
    generated_at: asOf,
    writes_performed: false,
    raw_event_material_included: false,
    sovereign_denominator: registry.length,
    methodology: {
      module: "geopolitical_security",
      source_id: UCDP_SOURCE_ID,
      population_source_id: WDI_SOURCE_ID,
      lookback_days: RISK_GATE_V2_CONFLICT_LOOKBACK_DAYS,
      source_max_age_days: RISK_GATE_V2_CONFLICT_SOURCE_MAX_AGE_DAYS,
      fixed_peer_minimum: RISK_GATE_V2_CONFLICT_MIN_PEERS,
      thresholds_changed: false,
      freshness_changed: false,
      commercial_eligibility_relaxed: false,
    },
    source_state: sources.map((row) => ({
      source_id: row.source_id,
      commercial_usage_status: row.commercial_usage_status,
      enabled_for_ingestion: row.enabled_for_ingestion,
      enabled_for_commercial_signals: row.enabled_for_commercial_signals,
      updated_at: row.updated_at,
    })),
    release_manifest: manifest
      ? {
          ...manifest,
          source_age_days: sourceAgeDays,
          within_source_max_age:
            sourceAgeDays !== null &&
            sourceAgeDays <= RISK_GATE_V2_CONFLICT_SOURCE_MAX_AGE_DAYS,
        }
      : null,
    release_window: {
      from: lookbackStart,
      to: asOf,
      candidate_rows_scanned: candidateRows.length,
      exact_release_rows: releaseRows.length,
      countries_with_any_release_row: events.size,
      countries_with_population: population.size,
    },
    summary: {
      module_available_country_count: availableCount,
      module_fail_closed_country_count: registry.length - availableCount,
      blocker_counts: Object.fromEntries(
        [...blockerCounts.entries()].sort(([a], [b]) => a.localeCompare(b)),
      ),
      generator_error_counts: Object.fromEntries(
        [...generatorErrors.entries()].sort(([a], [b]) => a.localeCompare(b)),
      ),
    },
    countries,
    interpretation_boundary: {
      diagnostic_only: true,
      no_country_is_marked_payable_by_this_report: true,
      absence_of_ucdp_events_is_not_treated_as_missing_by_itself: true,
      any_ineligible_or_unverified_release_row_for_a_country_remains_fail_closed: true,
      event_text_or_publisher_material_redistributed: false,
      source_rights_changed: false,
      scoring_changed: false,
    },
  };

  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    generated_at: report.generated_at,
    sovereign_denominator: report.sovereign_denominator,
    release_manifest: report.release_manifest,
    release_window: report.release_window,
    summary: report.summary,
    interpretation_boundary: report.interpretation_boundary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
