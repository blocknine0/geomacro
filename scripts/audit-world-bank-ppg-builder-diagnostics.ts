import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { buildMacroNormalizationSnapshot } from "../src/lib/country-risk-v02-normalization";
import {
  buildRiskGateV2WorldBankPpgSovereignFiscalModuleState,
  WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
} from "../src/lib/risk-gate-v2-world-bank-ppg-sovereign-fiscal";
import { generateRiskGateV2WorldBankPpgSovereignFiscalModuleState } from "../src/lib/risk-gate-v2-world-bank-ppg-sovereign-fiscal.server";

const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx";
const OUTPUT = process.env.WORLD_BANK_PPG_BUILDER_DIAGNOSTICS_OUTPUT ?? "world-bank-ppg-builder-diagnostics.json";
const SOURCE_ID = "world_bank_indicators";
const MANIFEST_KIND = "WORLD_BANK_PPG_GNI_DERIVED_V1";
const SEMANTIC_BOUNDARY = "PUBLIC_AND_PUBLICLY_GUARANTEED_EXTERNAL_DEBT_STOCK_PRESSURE_NOT_TOTAL_GOVERNMENT_DEBT" as const;

function projectRef(url: string) {
  try { return new URL(url).hostname.split(".")[0] ?? ""; } catch { return ""; }
}
function isSha(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
function freshness(observedAt: string | null, asOf: Date) {
  if (!observedAt) return "UNKNOWN" as const;
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) return "UNKNOWN" as const;
  const age = Math.max(0, (asOf.getTime() - observed) / 86_400_000);
  if (age <= 400) return "CURRENT" as const;
  if (age <= 800) return "AGING" as const;
  return "STALE" as const;
}

async function main() {
  const url = String(process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
  const key = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) throw new Error("Authoritative Supabase server credentials are required");
  if (projectRef(url) !== AUTHORITATIVE_PROJECT_REF) throw new Error("Wrong Supabase production target");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();
  const asOf = now.toISOString();

  const rowResult = await db
    .from("live_world_bank_indicator_latest")
    .select("country_iso3,metric,value_numeric,unit,observed_at,provenance")
    .eq("metric", WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC)
    .lte("observed_at", asOf)
    .limit(1000);
  if (rowResult.error) throw rowResult.error;

  const normalizedInputs = (rowResult.data ?? []).filter((row) =>
    typeof row.country_iso3 === "string" && typeof row.value_numeric === "number" && Number.isFinite(row.value_numeric),
  ).map((row) => ({
    country_iso3: String(row.country_iso3).trim().toUpperCase(),
    metric: WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
    value_numeric: Number(row.value_numeric),
    unit: row.unit == null ? null : String(row.unit),
    observed_at: row.observed_at == null ? null : String(row.observed_at),
    freshness_status: freshness(row.observed_at == null ? null : String(row.observed_at), now),
  }));
  const snapshot = buildMacroNormalizationSnapshot({
    metric: WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
    direction: "HIGHER_IS_HIGHER_RISK",
    as_of: asOf,
    observations: normalizedInputs,
  });

  const manifestResult = await db
    .from("live_source_release_manifests")
    .select("release_id,manifest_hash,verified_rows,partial_rows,rejected_rows,unmapped_rows,write_completed,coverage_end,retrieved_at,metadata")
    .eq("source_id", SOURCE_ID)
    .eq("write_completed", true)
    .contains("metadata", {
      kind: MANIFEST_KIND,
      metric: WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
      semantic_boundary: SEMANTIC_BOUNDARY,
    })
    .order("coverage_end", { ascending: false })
    .order("retrieved_at", { ascending: false })
    .limit(10);
  if (manifestResult.error) throw manifestResult.error;
  const manifest = manifestResult.data?.[0] ?? null;
  const metadata = manifest?.metadata && typeof manifest.metadata === "object"
    ? manifest.metadata as Record<string, unknown>
    : {};

  const proof = manifest ? {
    numerator_indicator: "DT.DOD.DPPG.CD" as const,
    denominator_indicator: "NY.GNP.MKTP.CD" as const,
    numerator_license: "CC BY-4.0" as const,
    denominator_license: "CC BY-4.0" as const,
    numerator_response_sha256: String(metadata.numerator_response_sha256 ?? ""),
    denominator_response_sha256: String(metadata.denominator_response_sha256 ?? ""),
    same_country_same_year_join: true as const,
    semantic_boundary: SEMANTIC_BOUNDARY,
  } : null;

  const sampleIso3 = snapshot.signals.slice(0, 5).map((signal) => signal.country_iso3);
  const pureResults = sampleIso3.map((iso3) => {
    const state = proof ? buildRiskGateV2WorldBankPpgSovereignFiscalModuleState({
      country_iso3: iso3,
      generated_at: asOf,
      snapshot,
      source_proof: proof,
    }) : null;
    return {
      iso3,
      generated: Boolean(state),
      methodology_version: state?.methodology_version ?? null,
    };
  });
  const serverResults = [];
  for (const iso3 of sampleIso3) {
    const state = await generateRiskGateV2WorldBankPpgSovereignFiscalModuleState({
      country_iso3: iso3,
      as_of: asOf,
      generated_at: asOf,
    });
    serverResults.push({
      iso3,
      generated: Boolean(state),
      methodology_version: state?.methodology_version ?? null,
    });
  }

  const report = {
    schema_version: "geomacro-world-bank-ppg-builder-diagnostics-1.0",
    generated_at: asOf,
    writes_performed: false,
    row_count: normalizedInputs.length,
    freshness_counts: normalizedInputs.reduce<Record<string, number>>((acc, row) => {
      acc[row.freshness_status] = (acc[row.freshness_status] ?? 0) + 1;
      return acc;
    }, {}),
    snapshot: {
      peer_count: snapshot.peer_count,
      signal_count: snapshot.signals.length,
      metric: snapshot.metric,
      direction: snapshot.direction,
      calculation_hash_valid: isSha(snapshot.calculation_hash),
      sample_iso3: sampleIso3,
    },
    exact_manifest_query: {
      matched_count: manifestResult.data?.length ?? 0,
      selected_release_id: manifest?.release_id ?? null,
      manifest_hash_valid: isSha(manifest?.manifest_hash),
      contract_checks: {
        kind: metadata.kind === MANIFEST_KIND,
        metric: metadata.metric === WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
        semantic_boundary: metadata.semantic_boundary === SEMANTIC_BOUNDARY,
        same_country_same_year_join_required: metadata.same_country_same_year_join_required === true,
        fixed_peer_minimum: Number(metadata.fixed_peer_minimum ?? 0) === 20,
        raw_cross_source_value_pooling_allowed: metadata.raw_cross_source_value_pooling_allowed === false,
        ppg_external_debt_relabelled_as_total_government_debt: metadata.ppg_external_debt_relabelled_as_total_government_debt === false,
        numerator_hash_valid: isSha(metadata.numerator_response_sha256),
        denominator_hash_valid: isSha(metadata.denominator_response_sha256),
      },
    },
    pure_builder_results: pureResults,
    server_adapter_results: serverResults,
    diagnosis: {
      pure_builder_generates: pureResults.some((row) => row.generated),
      server_adapter_generates: serverResults.some((row) => row.generated),
      adapter_boundary_isolated:
        pureResults.some((row) => row.generated) && !serverResults.some((row) => row.generated),
    },
    claim_boundary: {
      no_writes: true,
      no_threshold_change: true,
      no_payability_change: true,
      no_mainnet_change: true,
    },
  };
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log("PASS: WORLD BANK PPG BUILDER DIAGNOSTICS COMPLETE - NO WRITES");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});