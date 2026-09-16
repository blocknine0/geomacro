import { classifyGlobalEntity } from "../src/lib/global-entity-classification";
import { auditCountryRiskGateV2MacroModuleStatesWithWdiPpgFallback } from "../src/lib/risk-gate-v2-macro-module-state.server";
import { generateRiskGateV2PoliticalGovernanceModuleState } from "../src/lib/risk-gate-v2-political-governance-module-state.server";
import { generateRiskGateV2GeopoliticalSecurityModuleState } from "../src/lib/risk-gate-v2-geopolitical-security-module-state.server";
import {
  RISK_GATE_V2_REQUEST_SCHEMA_VERSION,
  type RiskGateV2Request,
} from "../src/lib/risk-gate-v2-contract";
import {
  evaluateRiskGateV2,
  type RiskGateV2ActionProfile,
  type RiskGateV2ResolvedPolicy,
} from "../src/lib/risk-gate-v2-engine";
import type { RiskGateV2Module } from "../src/lib/risk-gate-v2-taxonomy";
import { requireRiskSupabase } from "../src/lib/risk-supabase.server";

const REQUIRED_MODULES = [
  "geopolitical_security",
  "political_governance",
  "sovereign_fiscal",
  "macro_monetary",
] as const satisfies readonly RiskGateV2Module[];

const OUTPUT = process.env.WDI_PPG_FISCAL_SHADOW_CENSUS_OUTPUT ?? "wdi-ppg-fiscal-shadow-census.json";
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.WDI_PPG_FISCAL_SHADOW_CONCURRENCY ?? 3)));

const POLICY: RiskGateV2ResolvedPolicy = {
  policy_id: "wdi-ppg-fiscal-shadow-census",
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
  profile_id: "wdi-ppg-fiscal-shadow-country-review",
  profile_version: "1.0.0",
  action_type: "investment_allocation_review",
  methodology_version: "wdi-ppg-fiscal-shadow-census-1.0.0",
  module_weights: {
    geopolitical_security: 0.25,
    political_governance: 0.25,
    sovereign_fiscal: 0.25,
    macro_monetary: 0.25,
  },
};

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

async function evaluateCountry(country: Awaited<ReturnType<typeof loadCountries>>[number], generatedAt: string) {
  try {
    const [geopolitical, political, macroStates] = await Promise.all([
      generateRiskGateV2GeopoliticalSecurityModuleState({ country_iso3: country.iso3, as_of: generatedAt, generated_at: generatedAt }),
      generateRiskGateV2PoliticalGovernanceModuleState({ country_iso3: country.iso3, as_of: generatedAt, generated_at: generatedAt }),
      auditCountryRiskGateV2MacroModuleStatesWithWdiPpgFallback({ country_iso3: country.iso3, as_of: generatedAt, generated_at: generatedAt }),
    ]);

    const states = [
      ...(geopolitical ? [geopolitical] : []),
      ...(political ? [political] : []),
      ...macroStates,
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
        request_id: `wdi-ppg-shadow:${country.iso3}`,
        primary_subject: { type: "country", id: country.iso3 },
        exposures: [],
        action_context: { action_type: "investment_allocation_review", time_horizon: "days" },
        policy: { policy_id: POLICY.policy_id, policy_version: POLICY.policy_version },
      };
      response = await evaluateRiskGateV2(
        { request, policy: POLICY, action_profile: ACTION_PROFILE, module_states: states },
        new Date(generatedAt),
      );
    }

    const accepted = response !== null && response.execution_authorized === false && response.missing_modules.length === 0;
    const fiscalState = byModule.get("sovereign_fiscal");
    return {
      iso3: country.iso3,
      country_name: country.country_name,
      region: country.region,
      subregion: country.subregion,
      status: accepted ? "ACCEPTED" : "FAIL_CLOSED",
      missing_modules: missingModules,
      unverified_modules: unverifiedModules,
      sovereign_fiscal_methodology_version: fiscalState?.methodology_version ?? null,
      sovereign_fiscal_from_wdi_ppg_shadow: fiscalState?.methodology_version.includes("wdi-ppg-debt-service") ?? false,
      risk_gate: response
        ? {
            decision: response.decision,
            score: response.action_risk.score,
            confidence: response.action_risk.confidence,
            coverage: response.action_risk.coverage,
            execution_authorized: response.execution_authorized,
            calculation_hash: response.integrity.calculation_hash,
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
      status: "FAIL_CLOSED" as const,
      missing_modules: [...REQUIRED_MODULES],
      unverified_modules: [],
      sovereign_fiscal_methodology_version: null,
      sovereign_fiscal_from_wdi_ppg_shadow: false,
      risk_gate: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const generatedAt = new Date().toISOString();
  const countries = await loadCountries();
  const results = new Array<Awaited<ReturnType<typeof evaluateCountry>>>(countries.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= countries.length) return;
      results[index] = await evaluateCountry(countries[index], generatedAt);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const accepted = results.filter((row) => row.status === "ACCEPTED");
  const ppgFiscal = results.filter((row) => row.sovereign_fiscal_from_wdi_ppg_shadow);
  const ppgAccepted = accepted.filter((row) => row.sovereign_fiscal_from_wdi_ppg_shadow);
  const missingCounts = Object.fromEntries(
    REQUIRED_MODULES.map((module) => [module, results.filter((row) => row.missing_modules.includes(module)).length]),
  );
  const fiscalMethods = results.reduce<Record<string, number>>((acc, row) => {
    const key = row.sovereign_fiscal_methodology_version ?? "MISSING";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const report = {
    schema_version: "geomacro-wdi-ppg-fiscal-shadow-census-1.0",
    generated_at: generatedAt,
    writes_performed: false,
    production_adapter_changed: false,
    denominator: { type: "enabled_sovereign_countries", count: countries.length },
    required_modules: REQUIRED_MODULES,
    summary: {
      shadow_accepted_country_count: accepted.length,
      shadow_fail_closed_country_count: results.length - accepted.length,
      countries_using_wdi_ppg_fiscal_shadow: ppgFiscal.length,
      accepted_countries_using_wdi_ppg_fiscal_shadow: ppgAccepted.length,
      missing_module_counts: missingCounts,
      sovereign_fiscal_methodology_counts: fiscalMethods,
    },
    claim_boundary: {
      shadow_only: true,
      production_country_payability_changed: false,
      execution_authorized_is_false: true,
      missing_or_unverified_input_fails_closed: true,
      raw_cross_concept_pooling_allowed: false,
      target_100_is_not_claimed_unless_shadow_accepted_country_count_reaches_100: true,
    },
    countries: results,
  };

  await Bun.write(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ generated_at: report.generated_at, denominator: report.denominator, summary: report.summary, claim_boundary: report.claim_boundary }, null, 2));
  console.log(`WDI_PPG_FISCAL_SHADOW_CENSUS_OUTPUT=${OUTPUT}`);

  if (process.argv.includes("--require-100") && accepted.length < 100) process.exit(2);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
