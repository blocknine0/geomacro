import { writeFile } from "node:fs/promises";
import { requireRiskSupabase } from "../src/lib/risk-supabase.server";
import { generateRiskGateV2EurostatSovereignFiscalModuleState } from "../src/lib/risk-gate-v2-eurostat-sovereign-fiscal.server";
import { generateCountryRiskGateV2WdiMacroModuleStates } from "../src/lib/risk-gate-v2-macro-module-state.server";
import { generateRiskGateV2WorldBankPpgSovereignFiscalModuleState } from "../src/lib/risk-gate-v2-world-bank-ppg-sovereign-fiscal.server";

const OUTPUT = process.env.SOVEREIGN_FISCAL_DIAGNOSTICS_OUTPUT ?? "sovereign-fiscal-production-diagnostics.json";
const WDI_METRIC = "central_government_debt_pct_gdp";
const EUROSTAT_METRIC = "general_government_gross_debt_pct_gdp";
const PPG_METRIC = "ppg_external_debt_stock_pct_gni";
const PPG_MANIFEST_KIND = "WORLD_BANK_PPG_GNI_DERIVED_V1";
const PPG_SEMANTIC_BOUNDARY =
  "PUBLIC_AND_PUBLICLY_GUARANTEED_EXTERNAL_DEBT_STOCK_PRESSURE_NOT_TOTAL_GOVERNMENT_DEBT";
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

function isSha256(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function ppgManifestViolations(row: any) {
  const metadata = asRecord(row?.metadata);
  const violations: string[] = [];
  if (metadata.kind !== PPG_MANIFEST_KIND) violations.push("kind");
  if (metadata.metric !== PPG_METRIC) violations.push("metric");
  if (metadata.semantic_boundary !== PPG_SEMANTIC_BOUNDARY) violations.push("semantic_boundary");
  if (metadata.same_country_same_year_join_required !== true) {
    violations.push("same_country_same_year_join_required");
  }
  if (metadata.raw_cross_source_value_pooling_allowed !== false) {
    violations.push("raw_cross_source_value_pooling_allowed");
  }
  if (metadata.ppg_external_debt_relabelled_as_total_government_debt !== false) {
    violations.push("ppg_external_debt_relabelled_as_total_government_debt");
  }
  if (Number(metadata.fixed_peer_minimum ?? 0) !== 20) violations.push("fixed_peer_minimum");
  if (Number(row?.verified_rows ?? 0) < 20) violations.push("verified_rows");
  if (Number(row?.partial_rows ?? 0) !== 0) violations.push("partial_rows");
  if (Number(row?.rejected_rows ?? 0) !== 0) violations.push("rejected_rows");
  if (Number(row?.unmapped_rows ?? 0) !== 0) violations.push("unmapped_rows");
  if (row?.write_completed !== true) violations.push("write_completed");
  if (!isSha256(row?.manifest_hash)) violations.push("manifest_hash");
  if (metadata.numerator_indicator !== "DT.DOD.DPPG.CD") violations.push("numerator_indicator");
  if (metadata.denominator_indicator !== "NY.GNP.MKTP.CD") violations.push("denominator_indicator");
  if (!isSha256(metadata.numerator_response_sha256)) violations.push("numerator_response_sha256");
  if (!isSha256(metadata.denominator_response_sha256)) violations.push("denominator_response_sha256");
  return violations;
}

function validPpgProvenance(row: any) {
  const provenance = asRecord(row?.provenance);
  return (
    provenance.derived_metric === PPG_METRIC &&
    provenance.numerator_indicator === "DT.DOD.DPPG.CD" &&
    provenance.denominator_indicator === "NY.GNP.MKTP.CD" &&
    provenance.same_country_same_year_join_required === true &&
    provenance.semantic_boundary === PPG_SEMANTIC_BOUNDARY &&
    isSha256(provenance.numerator_response_sha256) &&
    isSha256(provenance.denominator_response_sha256)
  );
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

  const ppgManifestRows = await fetchAll(
    "live_source_release_manifests",
    "source_id,release_id,manifest_hash,verified_rows,partial_rows,rejected_rows,unmapped_rows,write_completed,coverage_end,retrieved_at,metadata",
    (q) => q
      .eq("source_id", "world_bank_indicators")
      .eq("write_completed", true)
      .lte("coverage_end", asOf)
      .order("coverage_end", { ascending: false })
      .order("retrieved_at", { ascending: false }),
  );

  const ppgBroadExactManifests = ppgManifestRows.filter((row) => {
    const metadata = asRecord(row.metadata);
    return (
      metadata.kind === PPG_MANIFEST_KIND &&
      metadata.metric === PPG_METRIC &&
      metadata.semantic_boundary === PPG_SEMANTIC_BOUNDARY
    );
  });

  const { data: ppgContainedManifests, error: ppgContainedManifestError } = await db
    .from("live_source_release_manifests")
    .select("source_id,release_id,manifest_hash,verified_rows,partial_rows,rejected_rows,unmapped_rows,write_completed,coverage_end,retrieved_at,metadata")
    .eq("source_id", "world_bank_indicators")
    .eq("write_completed", true)
    .lte("coverage_end", asOf)
    .contains("metadata", {
      kind: PPG_MANIFEST_KIND,
      metric: PPG_METRIC,
      semantic_boundary: PPG_SEMANTIC_BOUNDARY,
    })
    .order("coverage_end", { ascending: false })
    .order("retrieved_at", { ascending: false })
    .limit(10);
  if (ppgContainedManifestError) throw ppgContainedManifestError;

  const ppgContainedEvaluations = (ppgContainedManifests ?? []).map((row) => ({
    release_id: row.release_id,
    coverage_end: row.coverage_end,
    retrieved_at: row.retrieved_at,
    verified_rows: row.verified_rows,
    valid_manifest_hash: isSha256(row.manifest_hash),
    violations: ppgManifestViolations(row),
  }));
  const ppgCleanContainedManifestCount = ppgContainedEvaluations.filter(
    (row) => row.violations.length === 0,
  ).length;

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

  const ppgRows = await fetchAll(
    "live_world_bank_indicator_latest",
    "country_iso3,metric,value_numeric,unit,observed_at,provenance",
    (q) => q.eq("metric", PPG_METRIC).lte("observed_at", asOf).order("country_iso3"),
  );

  const eurostatFresh = eurostatRows.filter((row) => {
    const age = ageDays(row.observed_at == null ? null : String(row.observed_at), nowMs);
    return age !== null && age <= AGING_DAYS;
  });
  const wdiFresh = wdiRows.filter((row) => {
    const age = ageDays(row.observed_at == null ? null : String(row.observed_at), nowMs);
    return age !== null && age <= AGING_DAYS;
  });
  const ppgProvenanceValid = ppgRows.filter(validPpgProvenance);
  const ppgFresh = ppgProvenanceValid.filter((row) => {
    const age = ageDays(row.observed_at == null ? null : String(row.observed_at), nowMs);
    return age !== null && age <= AGING_DAYS;
  });

  const candidateIso3 = [...new Set(eurostatFresh
    .map((row) => String(row.country_iso3 ?? "").trim().toUpperCase())
    .filter((iso3) => /^[A-Z]{3}$/.test(iso3)))].sort();
  const ppgCandidateIso3 = [...new Set(ppgFresh
    .map((row) => String(row.country_iso3 ?? "").trim().toUpperCase())
    .filter((iso3) => /^[A-Z]{3}$/.test(iso3)))].sort();

  const eurostatErrors = new Map<string, number>();
  const wdiErrors = new Map<string, number>();
  const ppgErrors = new Map<string, number>();
  const eurostatAccepted: string[] = [];
  const eurostatNull: string[] = [];
  const wdiFiscal: string[] = [];
  const ppgAccepted: string[] = [];
  const ppgNull: string[] = [];

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

  for (const iso3 of ppgCandidateIso3) {
    try {
      const state = await generateRiskGateV2WorldBankPpgSovereignFiscalModuleState({
        country_iso3: iso3,
        as_of: asOf,
        generated_at: asOf,
      });
      if (state?.module === "sovereign_fiscal") ppgAccepted.push(iso3);
      else ppgNull.push(iso3);
    } catch (error) {
      increment(ppgErrors, errorKey(error));
    }
  }

  const ppgAdapterEvidenceClassification =
    ppgCleanContainedManifestCount === 0
      ? "NO_ADAPTER_ELIGIBLE_PPG_MANIFEST"
      : ppgCandidateIso3.length < 20
        ? "INSUFFICIENT_VALID_FRESH_PPG_ROWS"
        : ppgAccepted.length === 0 && ppgErrors.size === 0 && ppgNull.length > 0
          ? "ADAPTER_RETURNS_NULL_WITH_ELIGIBLE_MANIFEST_AND_ROWS"
          : ppgErrors.size > 0
            ? "ADAPTER_ERROR_PRESENT"
            : ppgAccepted.length > 0
              ? "ADAPTER_EMITS_PPG_STATES"
              : "NO_PPG_CANDIDATES";

  const report = {
    schema_version: "geomacro-sovereign-fiscal-production-diagnostics-1.1",
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
    ppg_manifest_probe: {
      broad_world_bank_completed_manifest_count: ppgManifestRows.length,
      broad_exact_ppg_metadata_match_count: ppgBroadExactManifests.length,
      adapter_contains_query_match_count: (ppgContainedManifests ?? []).length,
      adapter_eligible_clean_manifest_count: ppgCleanContainedManifestCount,
      adapter_contains_query_matches: ppgContainedEvaluations,
    },
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
      ppg_total_latest_rows: ppgRows.length,
      ppg_provenance_valid_rows: ppgProvenanceValid.length,
      ppg_current_rows: ppgProvenanceValid.filter((row) => {
        const age = ageDays(row.observed_at == null ? null : String(row.observed_at), nowMs);
        return age !== null && age <= CURRENT_DAYS;
      }).length,
      ppg_current_or_aging_rows: ppgFresh.length,
      ppg_current_or_aging_country_count: ppgCandidateIso3.length,
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
      ppg_probed_country_count: ppgCandidateIso3.length,
      ppg_sovereign_fiscal_state_count: ppgAccepted.length,
      ppg_null_state_count: ppgNull.length,
      ppg_error_counts: Object.fromEntries([...ppgErrors.entries()].sort()),
      ppg_accepted_countries: ppgAccepted,
      ppg_evidence_classification: ppgAdapterEvidenceClassification,
    },
    interpretation_boundary: {
      diagnostics_only: true,
      source_thresholds_changed: false,
      freshness_thresholds_changed: false,
      debt_concepts_merged: false,
      eurostat_general_government_debt_is_not_wdi_central_government_debt: true,
      ppg_external_debt_is_not_relabelled_as_total_government_debt: true,
      ppg_raw_values_are_not_pooled_with_other_debt_concepts: true,
      ppg_adapter_probe_is_read_only: true,
      no_country_is_marked_payable_by_this_report: true,
      base_mainnet_gate_changed: false,
    },
  };

  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    generated_at: report.generated_at,
    source_state: report.source_state,
    ppg_manifest_probe: report.ppg_manifest_probe,
    row_coverage: report.row_coverage,
    adapter_probe: {
      probed_country_count: report.adapter_probe.probed_country_count,
      eurostat_sovereign_fiscal_state_count: report.adapter_probe.eurostat_sovereign_fiscal_state_count,
      eurostat_null_state_count: report.adapter_probe.eurostat_null_state_count,
      eurostat_error_counts: report.adapter_probe.eurostat_error_counts,
      wdi_sovereign_fiscal_state_count_within_eurostat_candidates: report.adapter_probe.wdi_sovereign_fiscal_state_count_within_eurostat_candidates,
      wdi_error_counts: report.adapter_probe.wdi_error_counts,
      ppg_probed_country_count: report.adapter_probe.ppg_probed_country_count,
      ppg_sovereign_fiscal_state_count: report.adapter_probe.ppg_sovereign_fiscal_state_count,
      ppg_null_state_count: report.adapter_probe.ppg_null_state_count,
      ppg_error_counts: report.adapter_probe.ppg_error_counts,
      ppg_evidence_classification: report.adapter_probe.ppg_evidence_classification,
    },
    interpretation_boundary: report.interpretation_boundary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
