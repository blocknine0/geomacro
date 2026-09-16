import fs from "node:fs";
import { createHash } from "node:crypto";
import { buildMacroNormalizationSnapshot } from "../src/lib/country-risk-v02-normalization";
import {
  buildRiskGateV2WorldBankPpgSovereignFiscalModuleState,
  WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
  type WorldBankPpgSourceProof,
} from "../src/lib/risk-gate-v2-world-bank-ppg-sovereign-fiscal";

const INPUT = process.env.WORLD_BANK_PPG_RATIO_OUTPUT ?? "world-bank-ppg-debt-stock-ratio.json";
const OUTPUT = process.env.WORLD_BANK_PPG_SHADOW_OUTPUT ?? "world-bank-ppg-sovereign-fiscal-shadow.json";
const TARGET_COUNTRIES = Number(process.env.WORLD_BANK_PPG_SHADOW_TARGET_COUNTRIES ?? 100);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function hashJson(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function freshnessStatus(observedAt: string, asOf: string) {
  const observed = Date.parse(observedAt);
  const evaluation = Date.parse(asOf);
  if (!Number.isFinite(observed) || !Number.isFinite(evaluation)) return "UNKNOWN" as const;
  const ageDays = Math.max(0, (evaluation - observed) / 86_400_000);
  if (ageDays <= 400) return "CURRENT" as const;
  if (ageDays <= 800) return "AGING" as const;
  return "STALE" as const;
}

function main() {
  if (!fs.existsSync(INPUT)) throw new Error(`Missing source audit: ${INPUT}`);
  const sourceAudit = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  if (sourceAudit?.writes_performed !== false) throw new Error("Source audit must prove no writes");
  if (sourceAudit?.source_activation_changed !== false) throw new Error("Source audit unexpectedly changed activation");
  if (sourceAudit?.scoring_changed !== false) throw new Error("Source audit unexpectedly changed scoring");
  if (sourceAudit?.country_payability_changed !== false) throw new Error("Source audit unexpectedly changed country payability");
  if (sourceAudit?.coverage_summary?.fixed_peer_minimum_satisfied !== true) throw new Error("Source audit does not meet fixed peer minimum");

  const rows = Array.isArray(sourceAudit.rows) ? sourceAudit.rows : [];
  const asOf = String(sourceAudit.as_of ?? "");
  const observations = rows
    .map((row: Record<string, unknown>) => ({
      country_iso3: String(row.iso3 ?? "").trim().toUpperCase(),
      metric: WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
      value_numeric: Number(row.ppg_external_debt_stock_pct_gni),
      unit: "% of GNI",
      observed_at: String(row.observed_at ?? ""),
      freshness_status: freshnessStatus(String(row.observed_at ?? ""), asOf),
    }))
    .filter((row: { country_iso3: string; value_numeric: number; freshness_status: string }) =>
      /^[A-Z]{3}$/.test(row.country_iso3) &&
      Number.isFinite(row.value_numeric) &&
      ["CURRENT", "AGING"].includes(row.freshness_status),
    );

  const snapshot = buildMacroNormalizationSnapshot({
    metric: WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
    direction: "HIGHER_IS_HIGHER_RISK",
    as_of: asOf,
    observations,
  });

  const sourceProof: WorldBankPpgSourceProof = {
    numerator_indicator: "DT.DOD.DPPG.CD",
    denominator_indicator: "NY.GNP.MKTP.CD",
    numerator_license: "CC BY-4.0",
    denominator_license: "CC BY-4.0",
    numerator_response_sha256: String(sourceAudit.source?.numerator?.response_sha256 ?? ""),
    denominator_response_sha256: String(sourceAudit.source?.denominator?.response_sha256 ?? ""),
    same_country_same_year_join_required: true,
    semantic_boundary:
      "PUBLIC_AND_PUBLICLY_GUARANTEED_EXTERNAL_DEBT_STOCK_PRESSURE_NOT_TOTAL_GOVERNMENT_DEBT",
  };

  const generatedAt = new Date().toISOString();
  const states = snapshot.signals
    .map((signal) =>
      buildRiskGateV2WorldBankPpgSovereignFiscalModuleState({
        country_iso3: signal.country_iso3,
        generated_at: generatedAt,
        snapshot,
        source_proof: sourceProof,
      }),
    )
    .filter((state) => state !== null);

  const report = {
    schema_version: "geomacro-world-bank-ppg-sovereign-fiscal-shadow-1.0",
    generated_at: generatedAt,
    as_of: asOf,
    writes_performed: false,
    production_activation_allowed: false,
    scoring_production_changed: false,
    country_payability_changed: false,
    base_mainnet_gate_changed: false,
    input: {
      schema_version: sourceAudit.schema_version,
      derived_metric: sourceAudit.derived_metric,
      source: sourceAudit.source,
      source_audit_hash: hashJson(sourceAudit),
    },
    normalization: {
      metric: snapshot.metric,
      direction: snapshot.direction,
      peer_count: snapshot.peer_count,
      normalization_version: snapshot.normalization_version,
      calculation_hash: snapshot.calculation_hash,
    },
    shadow_summary: {
      target_country_count: TARGET_COUNTRIES,
      eligible_shadow_country_count: states.length,
      target_reached: states.length >= TARGET_COUNTRIES,
      iso3: states.map((state) => state.module_state_id.split(":")[1]).sort(),
      minimum_score: states.length ? Math.min(...states.map((state) => state.score)) : null,
      maximum_score: states.length ? Math.max(...states.map((state) => state.score)) : null,
      all_commercial_status_verified: states.every(
        (state) => state.commercial_eligibility_status === "VERIFIED",
      ),
      all_coverage_limited: states.every((state) => state.coverage === "LIMITED"),
    },
    methodology_boundary: {
      source_specific_peer_universe: true,
      raw_values_pooled_with_central_or_general_government_debt: false,
      ppg_external_debt_relabelled_as_total_government_debt: false,
      same_country_same_year_numerator_denominator_join: true,
      fixed_20_peer_minimum_preserved: snapshot.peer_count >= 20,
      shadow_only: true,
      production_requires_authoritative_sovereign_mapping_and_ingestion: true,
      production_requires_source_registration_and_release_manifest: true,
      production_requires_new_global_country_census: true,
    },
    states,
    report_hash: "",
  };
  report.report_hash = hashJson({ ...report, report_hash: "" });

  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    generated_at: report.generated_at,
    normalization: report.normalization,
    shadow_summary: report.shadow_summary,
    methodology_boundary: report.methodology_boundary,
    report_hash: report.report_hash,
  }, null, 2));

  if (!report.shadow_summary.target_reached) {
    throw new Error(
      `World Bank PPG shadow coverage ${states.length} is below target ${TARGET_COUNTRIES}`,
    );
  }
  console.log("PASS: WORLD BANK PPG SOVEREIGN-FISCAL SHADOW REACHES 100 COUNTRIES - NO PRODUCTION CHANGES");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
}
