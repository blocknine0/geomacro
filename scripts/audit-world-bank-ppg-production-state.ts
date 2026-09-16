import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { generateRiskGateV2WorldBankPpgSovereignFiscalModuleState } from "../src/lib/risk-gate-v2-world-bank-ppg-sovereign-fiscal.server";

const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx";
const SOURCE_ID = "world_bank_indicators";
const METRIC = "ppg_external_debt_stock_pct_gni";
const MANIFEST_KIND = "WORLD_BANK_PPG_GNI_DERIVED_V1";
const OUTPUT = process.env.WORLD_BANK_PPG_STATE_DIAGNOSTICS_OUTPUT ?? "world-bank-ppg-production-state-diagnostics.json";

function projectRef(url: string) {
  try { return new URL(url).hostname.split(".")[0] ?? ""; } catch { return ""; }
}

function freshStatus(value: string | null, asOf: Date) {
  if (!value) return "UNKNOWN";
  const observed = Date.parse(value);
  if (!Number.isFinite(observed)) return "UNKNOWN";
  const ageDays = Math.max(0, (asOf.getTime() - observed) / 86_400_000);
  if (ageDays <= 400) return "CURRENT";
  if (ageDays <= 800) return "AGING";
  return "STALE";
}

async function fetchAll(db: ReturnType<typeof createClient>, table: string, select: string, configure?: (query: any) => any) {
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
  const url = String(process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
  const key = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) throw new Error("Authoritative Supabase server credentials are required");
  if (projectRef(url) !== AUTHORITATIVE_PROJECT_REF) throw new Error("Supabase URL is not the authoritative Geomacro project");

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const asOf = new Date();
  const asOfIso = asOf.toISOString();

  const sourceResult = await db
    .from("live_external_sources")
    .select("source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,licence_name")
    .eq("source_id", SOURCE_ID)
    .maybeSingle();
  if (sourceResult.error) throw sourceResult.error;

  const manifests = await fetchAll(
    db,
    "live_source_release_manifests",
    "release_id,manifest_hash,verified_rows,partial_rows,rejected_rows,unmapped_rows,write_completed,coverage_end,retrieved_at,metadata",
    (q) => q.eq("source_id", SOURCE_ID).eq("write_completed", true).order("retrieved_at", { ascending: false }),
  );
  const ppgManifests = manifests.filter((row) => {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    return metadata.kind === MANIFEST_KIND || metadata.metric === METRIC;
  });

  const rows = await fetchAll(
    db,
    "live_world_bank_indicator_latest",
    "country_iso3,metric,observed_at,quality_status,commercial_eligibility_status,provenance",
    (q) => q.eq("metric", METRIC).order("country_iso3"),
  );

  const registry = await fetchAll(
    db,
    "live_country_registry",
    "iso3,enabled",
    (q) => q.eq("enabled", true).order("iso3"),
  );
  const registrySet = new Set(registry.map((row) => String(row.iso3 ?? "").toUpperCase()));
  const governedRows = rows.filter((row) => registrySet.has(String(row.country_iso3 ?? "").toUpperCase()));

  const freshnessCounts: Record<string, number> = {};
  const provenanceChecks = {
    derived_metric_match: 0,
    numerator_indicator_match: 0,
    denominator_indicator_match: 0,
    same_country_same_year_join_required: 0,
    semantic_boundary_match: 0,
    numerator_hash_valid: 0,
    denominator_hash_valid: 0,
    all_required_provenance_fields: 0,
  };
  const sha = /^[0-9a-f]{64}$/;
  const semanticBoundary = "PUBLIC_AND_PUBLICLY_GUARANTEED_EXTERNAL_DEBT_STOCK_PRESSURE_NOT_TOTAL_GOVERNMENT_DEBT";
  for (const row of governedRows) {
    const status = freshStatus(row.observed_at ? String(row.observed_at) : null, asOf);
    freshnessCounts[status] = (freshnessCounts[status] ?? 0) + 1;
    const p = row.provenance && typeof row.provenance === "object" ? row.provenance as Record<string, unknown> : {};
    const checks = {
      derived_metric_match: p.derived_metric === METRIC,
      numerator_indicator_match: p.numerator_indicator === "DT.DOD.DPPG.CD",
      denominator_indicator_match: p.denominator_indicator === "NY.GNP.MKTP.CD",
      same_country_same_year_join_required: p.same_country_same_year_join_required === true,
      semantic_boundary_match: p.semantic_boundary === semanticBoundary,
      numerator_hash_valid: typeof p.numerator_response_sha256 === "string" && sha.test(p.numerator_response_sha256),
      denominator_hash_valid: typeof p.denominator_response_sha256 === "string" && sha.test(p.denominator_response_sha256),
    };
    for (const [keyName, ok] of Object.entries(checks)) {
      if (ok) provenanceChecks[keyName as keyof typeof provenanceChecks] += 1;
    }
    if (Object.values(checks).every(Boolean)) provenanceChecks.all_required_provenance_fields += 1;
  }

  const stateResults: Array<{ iso3: string; state_generated: boolean; methodology_version: string | null; coverage: string | null; error: string | null }> = [];
  for (const iso3 of [...new Set(governedRows.map((row) => String(row.country_iso3).toUpperCase()))].sort()) {
    try {
      const state = await generateRiskGateV2WorldBankPpgSovereignFiscalModuleState({
        country_iso3: iso3,
        as_of: asOfIso,
        generated_at: asOfIso,
      });
      stateResults.push({
        iso3,
        state_generated: Boolean(state),
        methodology_version: state?.methodology_version ?? null,
        coverage: state?.coverage ?? null,
        error: null,
      });
    } catch (error) {
      stateResults.push({
        iso3,
        state_generated: false,
        methodology_version: null,
        coverage: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const errorCounts: Record<string, number> = {};
  for (const row of stateResults) {
    if (row.error) errorCounts[row.error] = (errorCounts[row.error] ?? 0) + 1;
  }

  const latestPpgManifest = ppgManifests[0] ?? null;
  const metadata = latestPpgManifest?.metadata && typeof latestPpgManifest.metadata === "object"
    ? latestPpgManifest.metadata as Record<string, unknown>
    : {};

  const report = {
    schema_version: "geomacro-world-bank-ppg-production-state-diagnostics-1.0",
    generated_at: asOfIso,
    writes_performed: false,
    source_registration: sourceResult.data ?? null,
    manifest: latestPpgManifest ? {
      found: true,
      release_id: latestPpgManifest.release_id,
      manifest_hash_valid: typeof latestPpgManifest.manifest_hash === "string" && sha.test(latestPpgManifest.manifest_hash),
      verified_rows: Number(latestPpgManifest.verified_rows ?? 0),
      partial_rows: Number(latestPpgManifest.partial_rows ?? 0),
      rejected_rows: Number(latestPpgManifest.rejected_rows ?? 0),
      unmapped_rows: Number(latestPpgManifest.unmapped_rows ?? 0),
      write_completed: latestPpgManifest.write_completed === true,
      coverage_end: latestPpgManifest.coverage_end ?? null,
      metadata_contract: {
        kind: metadata.kind ?? null,
        metric: metadata.metric ?? null,
        same_country_same_year_join_required: metadata.same_country_same_year_join_required ?? null,
        semantic_boundary: metadata.semantic_boundary ?? null,
        fixed_peer_minimum: metadata.fixed_peer_minimum ?? null,
        raw_cross_source_value_pooling_allowed: metadata.raw_cross_source_value_pooling_allowed ?? null,
        ppg_external_debt_relabelled_as_total_government_debt: metadata.ppg_external_debt_relabelled_as_total_government_debt ?? null,
        numerator_hash_valid: typeof metadata.numerator_response_sha256 === "string" && sha.test(metadata.numerator_response_sha256),
        denominator_hash_valid: typeof metadata.denominator_response_sha256 === "string" && sha.test(metadata.denominator_response_sha256),
      },
    } : { found: false },
    observation_summary: {
      governed_latest_country_count: governedRows.length,
      freshness_counts: freshnessCounts,
      provenance_checks: provenanceChecks,
    },
    state_summary: {
      attempted_country_count: stateResults.length,
      generated_state_count: stateResults.filter((row) => row.state_generated).length,
      null_state_count: stateResults.filter((row) => !row.state_generated && !row.error).length,
      error_state_count: stateResults.filter((row) => row.error).length,
      error_counts: errorCounts,
      generated_iso3: stateResults.filter((row) => row.state_generated).map((row) => row.iso3),
    },
    claim_boundary: {
      no_writes: true,
      no_scoring_change: true,
      no_threshold_relaxation: true,
      no_country_payability_change: true,
      no_mainnet_change: true,
    },
  };

  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`WORLD_BANK_PPG_STATE_DIAGNOSTICS_OUTPUT=${OUTPUT}`);
  console.log("PASS: WORLD BANK PPG PRODUCTION STATE DIAGNOSTICS COMPLETE - NO WRITES");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});