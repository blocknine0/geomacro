import { writeFile } from "node:fs/promises";
import { requireRiskSupabase } from "../src/lib/risk-supabase.server";
import { generateRiskGateV2EurostatSovereignFiscalModuleState } from "../src/lib/risk-gate-v2-eurostat-sovereign-fiscal.server";
import { generateCountryRiskGateV2WdiMacroModuleStates } from "../src/lib/risk-gate-v2-macro-module-state.server";

const OUTPUT = process.env.SOVEREIGN_FISCAL_DIAGNOSTICS_OUTPUT ?? "sovereign-fiscal-production-diagnostics.json";
const WDI_METRIC = "central_government_debt_pct_gdp";
const EUROSTAT_METRIC = "general_government_gross_debt_pct_gdp";
const CURRENT_DAYS = 400;
const AGING_DAYS = 800;

function ageDays(observedAt: string | null, nowMs: number) {
  if (!observedAt) return null;
  const ms = Date.parse(observedAt);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, (nowMs - ms) / 86_400_000);
}

function errorKey(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 240);
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

async function fetchAll(table: string, select: string, configure?: (query: any) => any) {
  const db = requireRiskSupabase();
  const pageSize = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += pageSize) {
    let query: any = db.from(table).select(select).range(from, from + pageSize - 1);
    if (configure) query = configure(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

async function main() {
  const db = requireRiskSupabase();
  const now = new Date();
  const nowMs = now.getTime();
  const asOf = now.toISOString();

  const { data: sources, error: sourceError } = await db
    .from("live_external_sources")
    .select("source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,updated_at")
    .in("source_id", ["world_bank_indicators", "eurostat_government_finance"])
    .order("source_id");
  if (sourceError) throw sourceError;

  const { data: manifest, error: manifestError } = await db
    .from("live_source_release_manifests")
    .select("source_id,release_id,manifest_hash,verified_rows,partial_rows,rejected_rows,unmapped_rows,write_completed,coverage_end,retrieved_at")
    .eq("source_id", "eurostat_government_finance")
    .order("coverage_end", { ascending: false })
    .order("retrieved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (manifestError) throw manifestError;

  const eurostatRows = await fetchAll(
    "live_eurostat_government_debt_latest",
    "country_iso3,metric,value_numeric,unit,observed_at",
    (q) => q.eq("metric", EUROSTAT_METRIC).lte("observed_at", asOf).order("country_iso3"),
  );

  const wdiRows = await fetchAll(
    "live_world_bank_indicator_latest",
    "country_iso3,metric,value_numeric,unit,observed_at",
    (q) => q.eq("metric", WDI_METRIC).lte("observed_at", asOf).order("country_iso3"),
  );

  const eurostatFresh = eurostatRows.filter((row) => {
    const age = ageDays(row.observed_at == null ? null : String(row.observed_at), nowMs);
    return age !== null && age <= AGING_DAYS;
  });
  const wdiFresh = wdiRows.filter((row) => {
    const age = ageDays(row.observed_at == null ? null : String(row.observed_at), nowMs);
    return age !== null && age <= AGING_DAYS;
  });

  const candidateIso3 = [...new Set(eurostatFresh
    .map((row) => String(row.country_iso3 ?? "").trim().toUpperCase())
    .filter((iso3) => /^[A-Z]{3}$/.test(iso3)))].sort();

  const eurostatErrors = new Map<string, number>();
  const wdiErrors = new Map<string, number>();
  const eurostatAccepted: string[] = [];
  const eurostatNull: string[] = [];
  const wdiFiscal: string[] = [];

  for (const iso3 of candidateIso3) {
    try {
      const state = await generateRiskGateV2EurostatSovereignFiscalModuleState({
        country_iso3: iso3,
        as_of: asOf,
        generated_at: asOf,
      });
      if (state?.module === "sovereign_fiscal") eurostatAccepted.push(iso3);
      else eurostatNull.push(iso3);
    } catch (error) {
      increment(eurostatErrors, errorKey(error));
    }

    try {
      const states = await generateCountryRiskGateV2WdiMacroModuleStates({
        country_iso3: iso3,
        as_of: asOf,
        generated_at: asOf,
      });
      if (states.some((state) => state.module === "sovereign_fiscal")) wdiFiscal.push(iso3);
    } catch (error) {
      increment(wdiErrors, errorKey(error));
    }
  }

  const report = {
    schema_version: "geomacro-sovereign-fiscal-production-diagnostics-1.0",
    generated_at: asOf,
    writes_performed: false,
    source_state: (sources ?? []).map((row) => ({
      source_id: row.source_id,
      commercial_usage_status: row.commercial_usage_status,
      enabled_for_ingestion: row.enabled_for_ingestion,
      enabled_for_commercial_signals: row.enabled_for_commercial_signals,
      updated_at: row.updated_at,
    })),
    eurostat_release_manifest: manifest
      ? {
          release_id: manifest.release_id,
          manifest_hash: manifest.manifest_hash,
          verified_rows: manifest.verified_rows,
          partial_rows: manifest.partial_rows,
          rejected_rows: manifest.rejected_rows,
          unmapped_rows: manifest.unmapped_rows,
          write_completed: manifest.write_completed,
          coverage_end: manifest.coverage_end,
          retrieved_at: manifest.retrieved_at,
        }
      : null,
    row_coverage: {
      eurostat_total_latest_rows: eurostatRows.length,
      eurostat_current_rows: eurostatRows.filter((row) => {
        const age = ageDays(row.observed_at == null ? null : String(row.observed_at), nowMs);
        return age !== null && age <= CURRENT_DAYS;
      }).length,
      eurostat_current_or_aging_rows: eurostatFresh.length,
      eurostat_current_or_aging_country_count: candidateIso3.length,
      wdi_debt_total_latest_rows: wdiRows.length,
      wdi_debt_current_rows: wdiRows.filter((row) => {
        const age = ageDays(row.observed_at == null ? null : String(row.observed_at), nowMs);
        return age !== null && age <= CURRENT_DAYS;
      }).length,
      wdi_debt_current_or_aging_rows: wdiFresh.length,
      wdi_debt_current_or_aging_country_count: new Set(wdiFresh.map((row) => String(row.country_iso3))).size,
      fixed_peer_minimum: 20,
    },
    adapter_probe: {
      probed_country_count: candidateIso3.length,
      eurostat_sovereign_fiscal_state_count: eurostatAccepted.length,
      eurostat_null_state_count: eurostatNull.length,
      eurostat_error_counts: Object.fromEntries([...eurostatErrors.entries()].sort()),
      wdi_sovereign_fiscal_state_count_within_eurostat_candidates: wdiFiscal.length,
      wdi_error_counts: Object.fromEntries([...wdiErrors.entries()].sort()),
      eurostat_accepted_countries: eurostatAccepted,
    },
    interpretation_boundary: {
      diagnostics_only: true,
      source_thresholds_changed: false,
      freshness_thresholds_changed: false,
      debt_concepts_merged: false,
      eurostat_general_government_debt_is_not_wdi_central_government_debt: true,
      no_country_is_marked_payable_by_this_report: true,
    },
  };

  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    generated_at: report.generated_at,
    source_state: report.source_state,
    row_coverage: report.row_coverage,
    adapter_probe: {
      probed_country_count: report.adapter_probe.probed_country_count,
      eurostat_sovereign_fiscal_state_count: report.adapter_probe.eurostat_sovereign_fiscal_state_count,
      eurostat_null_state_count: report.adapter_probe.eurostat_null_state_count,
      eurostat_error_counts: report.adapter_probe.eurostat_error_counts,
      wdi_sovereign_fiscal_state_count_within_eurostat_candidates: report.adapter_probe.wdi_sovereign_fiscal_state_count_within_eurostat_candidates,
      wdi_error_counts: report.adapter_probe.wdi_error_counts,
    },
    interpretation_boundary: report.interpretation_boundary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
