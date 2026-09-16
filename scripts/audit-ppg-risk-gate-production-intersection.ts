import fs from "node:fs";
import { classifyGlobalEntity } from "../src/lib/global-entity-classification";
import { buildMacroNormalizationSnapshot } from "../src/lib/country-risk-v02-normalization";
import { generateCountryRiskGateV2MacroModuleStates } from "../src/lib/risk-gate-v2-macro-module-state.server";
import { generateRiskGateV2PoliticalGovernanceModuleState } from "../src/lib/risk-gate-v2-political-governance-module-state.server";
import { generateRiskGateV2GeopoliticalSecurityModuleState } from "../src/lib/risk-gate-v2-geopolitical-security-module-state.server";
import {
  buildRiskGateV2WorldBankPpgSovereignFiscalModuleState,
  WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
  type WorldBankPpgSourceProof,
} from "../src/lib/risk-gate-v2-world-bank-ppg-sovereign-fiscal";
import {
  evaluateRiskGateV2,
  type RiskGateV2ActionProfile,
  type RiskGateV2ResolvedPolicy,
} from "../src/lib/risk-gate-v2-engine";
import {
  RISK_GATE_V2_REQUEST_SCHEMA_VERSION,
  type RiskGateV2Request,
} from "../src/lib/risk-gate-v2-contract";
import type { RiskGateV2Module } from "../src/lib/risk-gate-v2-taxonomy";
import { requireRiskSupabase } from "../src/lib/risk-supabase.server";

const INPUT = process.env.WORLD_BANK_PPG_RATIO_OUTPUT ?? "world-bank-ppg-debt-stock-ratio.json";
const OUTPUT = process.env.PPG_PRODUCTION_INTERSECTION_OUTPUT ?? "ppg-risk-gate-production-intersection.json";
const CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.PPG_INTERSECTION_CONCURRENCY ?? 3)));

const REQUIRED_MODULES = [
  "geopolitical_security",
  "political_governance",
  "sovereign_fiscal",
  "macro_monetary",
] as const satisfies readonly RiskGateV2Module[];

const POLICY: RiskGateV2ResolvedPolicy = {
  policy_id: "ppg-shadow-intersection-evidence",
  policy_version: "1.0.0",
  continue_max_score: 35,
  reduce_limit_max_score: 55,
  require_approval_max_score: 75,
  minimum_confidence_for_auto_continue: 0.5,
  minimum_coverage_for_auto_continue: "LIMITED",
  require_commercial_verification_for_continue: true,
  pause_on_insufficient_coverage: true,
};

const ACTION_PROFILE: RiskGateV2ActionProfile = {
  profile_id: "ppg-shadow-country-review-evidence",
  profile_version: "1.0.0",
  action_type: "investment_allocation_review",
  methodology_version: "ppg-shadow-production-intersection-1.0.0",
  module_weights: {
    geopolitical_security: 0.25,
    political_governance: 0.25,
    sovereign_fiscal: 0.25,
    macro_monetary: 0.25,
  },
};

function freshnessStatus(observedAt: string, asOf: string) {
  const observed = Date.parse(observedAt);
  const evaluation = Date.parse(asOf);
  if (!Number.isFinite(observed) || !Number.isFinite(evaluation)) return "UNKNOWN" as const;
  const ageDays = Math.max(0, (evaluation - observed) / 86_400_000);
  if (ageDays <= 400) return "CURRENT" as const;
  if (ageDays <= 800) return "AGING" as const;
  return "STALE" as const;
}

async function loadCountries() {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_country_registry")
    .select("iso3,country_name,region,subregion")
    .eq("enabled", true)
    .order("iso3", { ascending: true });
  if (result.error) throw result.error;
  return (result.data ?? [])
    .map((row) => ({
      iso3: String(row.iso3 ?? "").trim().toUpperCase(),
      country_name: String(row.country_name ?? "").trim(),
      region: row.region == null ? null : String(row.region),
      subregion: row.subregion == null ? null : String(row.subregion),
    }))
    .filter((row) => classifyGlobalEntity(row.iso3) === "SOVEREIGN");
}

function buildPpgSnapshot(sourceAudit: any) {
  const asOf = String(sourceAudit.as_of ?? "");
  const observations = (Array.isArray(sourceAudit.rows) ? sourceAudit.rows : [])
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

  return buildMacroNormalizationSnapshot({
    metric: WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
    direction: "HIGHER_IS_HIGHER_RISK",
    as_of: asOf,
    observations,
  });
}

function buildSourceProof(sourceAudit: any): WorldBankPpgSourceProof {
  return {
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
}

async function evaluateCountry(input: {
  country: Awaited<ReturnType<typeof loadCountries>>[number];
  generatedAt: string;
  snapshot: ReturnType<typeof buildPpgSnapshot>;
  sourceProof: WorldBankPpgSourceProof;
}) {
  const { country, generatedAt, snapshot, sourceProof } = input;
  try {
    const [geopolitical, political, productionMacroStates] = await Promise.all([
      generateRiskGateV2GeopoliticalSecurityModuleState({
        country_iso3: country.iso3,
        as_of: generatedAt,
        generated_at: generatedAt,
      }),
      generateRiskGateV2PoliticalGovernanceModuleState({
        country_iso3: country.iso3,
        as_of: generatedAt,
        generated_at: generatedAt,
      }),
      generateCountryRiskGateV2MacroModuleStates({
        country_iso3: country.iso3,
        as_of: generatedAt,
        generated_at: generatedAt,
      }),
    ]);

    const productionHasFiscal = productionMacroStates.some((state) => state.module === "sovereign_fiscal");
    const ppgFiscal = productionHasFiscal
      ? null
      : buildRiskGateV2WorldBankPpgSovereignFiscalModuleState({
          country_iso3: country.iso3,
          generated_at: generatedAt,
          snapshot,
          source_proof: sourceProof,
        });

    const states = [
      ...(geopolitical ? [geopolitical] : []),
      ...(political ? [political] : []),
      ...productionMacroStates,
      ...(ppgFiscal ? [ppgFiscal] : []),
    ];
    const byModule = new Map(states.map((state) => [state.module, state]));
    const missingModules = REQUIRED_MODULES.filter((module) => !byModule.has(module));
    const unverifiedModules = REQUIRED_MODULES.filter(
      (module) => byModule.get(module)?.commercial_eligibility_status !== "VERIFIED",
    );

    let response: Awaited<ReturnType<typeof evaluateRiskGateV2>> | null = null;
    if (missingModules.length === 0 && unverifiedModules.length === 0) {
      const request: RiskGateV2Request = {
        schema_version: RISK_GATE_V2_REQUEST_SCHEMA_VERSION,
        request_id: `ppg-shadow-intersection:${country.iso3}`,
        primary_subject: { type: "country", id: country.iso3 },
        exposures: [],
        action_context: {
          action_type: "investment_allocation_review",
          time_horizon: "days",
        },
        policy: {
          policy_id: POLICY.policy_id,
          policy_version: POLICY.policy_version,
        },
      };
      response = await evaluateRiskGateV2(
        {
          request,
          policy: POLICY,
          action_profile: ACTION_PROFILE,
          module_states: states,
        },
        new Date(generatedAt),
      );
    }

    const accepted =
      response !== null &&
      response.execution_authorized === false &&
      response.missing_modules.length === 0;

    return {
      iso3: country.iso3,
      country_name: country.country_name,
      region: country.region,
      subregion: country.subregion,
      hypothetical_shadow_status: accepted ? "ACCEPTED" : "FAIL_CLOSED",
      ppg_shadow_fiscal_used: Boolean(ppgFiscal),
      production_fiscal_already_available: productionHasFiscal,
      missing_modules: missingModules,
      unverified_modules: unverifiedModules,
      module_states: states.map((state) => ({
        module: state.module,
        score: state.score,
        confidence: state.confidence,
        coverage: state.coverage,
        commercial_eligibility_status: state.commercial_eligibility_status,
        methodology_version: state.methodology_version,
      })),
      risk_gate: response
        ? {
            decision: response.decision,
            score: response.action_risk.score,
            confidence: response.action_risk.confidence,
            coverage: response.action_risk.coverage,
            execution_authorized: response.execution_authorized,
          }
        : null,
      error: null,
    };
  } catch (error) {
    return {
      iso3: country.iso3,
      country_name: country.country_name,
      region: country.region,
      subregion: country.subregion,
      hypothetical_shadow_status: "FAIL_CLOSED",
      ppg_shadow_fiscal_used: false,
      production_fiscal_already_available: false,
      missing_modules: [...REQUIRED_MODULES],
      unverified_modules: [],
      module_states: [],
      risk_gate: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  if (!fs.existsSync(INPUT)) throw new Error(`Missing World Bank PPG ratio proof: ${INPUT}`);
  const sourceAudit = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  if (
    sourceAudit?.writes_performed !== false ||
    sourceAudit?.source_activation_changed !== false ||
    sourceAudit?.country_payability_changed !== false
  ) {
    throw new Error("PPG source proof does not preserve the no-production-change boundary");
  }

  const snapshot = buildPpgSnapshot(sourceAudit);
  const sourceProof = buildSourceProof(sourceAudit);
  const generatedAt = new Date().toISOString();
  const countries = await loadCountries();
  const results = new Array<any>(countries.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= countries.length) return;
      results[index] = await evaluateCountry({
        country: countries[index],
        generatedAt,
        snapshot,
        sourceProof,
      });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const accepted = results.filter((row) => row.hypothetical_shadow_status === "ACCEPTED");
  const acceptedUsingPpg = accepted.filter((row) => row.ppg_shadow_fiscal_used);
  const failureReasonCounts: Record<string, number> = {};
  for (const row of results.filter((item) => item.hypothetical_shadow_status !== "ACCEPTED")) {
    const reasons = [
      ...row.missing_modules.map((module: string) => `MISSING:${module}`),
      ...row.unverified_modules.map((module: string) => `UNVERIFIED:${module}`),
      ...(row.error ? [`ERROR:${row.error}`] : []),
    ];
    for (const reason of reasons.length ? reasons : ["OTHER_FAIL_CLOSED"]) {
      failureReasonCounts[reason] = (failureReasonCounts[reason] ?? 0) + 1;
    }
  }

  const report = {
    schema_version: "geomacro-ppg-risk-gate-production-intersection-1.0",
    generated_at: generatedAt,
    writes_performed: false,
    production_activation_allowed: false,
    scoring_production_changed: false,
    country_payability_changed: false,
    base_mainnet_gate_changed: false,
    denominator: {
      type: "authoritative_enabled_sovereign_registry",
      count: countries.length,
    },
    ppg_shadow_source: {
      peer_count: snapshot.peer_count,
      calculation_hash: snapshot.calculation_hash,
      candidate_country_count: snapshot.signals.length,
      metric: snapshot.metric,
    },
    required_country_modules: REQUIRED_MODULES,
    summary: {
      hypothetical_shadow_accepted_country_count: accepted.length,
      hypothetical_shadow_fail_closed_country_count: countries.length - accepted.length,
      accepted_using_ppg_shadow_fiscal_count: acceptedUsingPpg.length,
      accepted_without_ppg_shadow_fiscal_count: accepted.length - acceptedUsingPpg.length,
      target_100_reached_in_shadow_intersection: accepted.length >= 100,
      hypothetical_shadow_accepted_iso3: accepted.map((row) => row.iso3).sort(),
      failure_reason_counts: Object.fromEntries(
        Object.entries(failureReasonCounts).sort(([a], [b]) => a.localeCompare(b)),
      ),
    },
    claim_boundary: {
      hypothetical_shadow_only: true,
      not_a_production_country_support_claim: true,
      ppg_source_not_yet_production_wired: true,
      missing_or_unverified_still_fails_closed: true,
      execution_authorized_false_required: true,
      no_threshold_or_freshness_relaxation: true,
      no_raw_cross_concept_debt_pooling: true,
      production_promotion_requires_ingestion_registry_release_manifest_and_new_census: true,
    },
    countries: results,
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    generated_at: report.generated_at,
    denominator: report.denominator,
    ppg_shadow_source: report.ppg_shadow_source,
    summary: report.summary,
    claim_boundary: report.claim_boundary,
  }, null, 2));
  console.log(`PPG_PRODUCTION_INTERSECTION_OUTPUT=${OUTPUT}`);
  console.log("PASS: PPG SHADOW INTERSECTION AUDIT COMPLETE - NO PRODUCTION CHANGES");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
