import { classifyGlobalEntity } from "../src/lib/global-entity-classification";
import { generateCountryRiskGateV2MacroModuleStates } from "../src/lib/risk-gate-v2-macro-module-state.server";
import { generateRiskGateV2PoliticalGovernanceModuleState } from "../src/lib/risk-gate-v2-political-governance-module-state.server";
import { generateRiskGateV2GeopoliticalSecurityModuleState } from "../src/lib/risk-gate-v2-geopolitical-security-module-state.server";
import { auditRiskGateV2EurostatSovereignFiscalCandidate } from "../src/lib/risk-gate-v2-eurostat-sovereign-fiscal.server";
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

const CONCURRENCY = Math.max(
  1,
  Math.min(8, Number(process.env.EUROSTAT_SHADOW_CENSUS_CONCURRENCY ?? 3)),
);

const POLICY: RiskGateV2ResolvedPolicy = {
  policy_id: "eurostat-sovereign-fiscal-shadow-census",
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
  profile_id: "eurostat-sovereign-fiscal-shadow-country-review",
  profile_version: "1.0.0",
  action_type: "investment_allocation_review",
  methodology_version: "eurostat-sovereign-fiscal-shadow-census-1.0.0",
  module_weights: {
    geopolitical_security: 0.25,
    political_governance: 0.25,
    sovereign_fiscal: 0.25,
    macro_monetary: 0.25,
  },
};

async function assertShadowSourceState() {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_external_sources")
    .select("commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals")
    .eq("source_id", "eurostat_government_finance")
    .maybeSingle();
  if (result.error) throw result.error;
  const row = result.data;
  if (
    !row ||
    row.commercial_usage_status !== "COMMERCIAL_OK" ||
    row.enabled_for_ingestion !== true ||
    row.enabled_for_commercial_signals !== false
  ) {
    throw new Error("Eurostat shadow census requires COMMERCIAL_OK, ingestion=true, commercial_signals=false");
  }
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

async function evaluateCountry(
  country: Awaited<ReturnType<typeof loadCountries>>[number],
  generatedAt: string,
) {
  try {
    const [geopolitical, political, macroStates, eurostatFiscal] = await Promise.all([
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
      auditRiskGateV2EurostatSovereignFiscalCandidate({
        country_iso3: country.iso3,
        as_of: generatedAt,
        generated_at: generatedAt,
      }),
    ]);

    const baseStates = [
      ...(geopolitical ? [geopolitical] : []),
      ...(political ? [political] : []),
      ...macroStates,
    ];
    const hasWdiFiscal = baseStates.some((state) => state.module === "sovereign_fiscal");
    const states = [
      ...baseStates,
      ...(!hasWdiFiscal && eurostatFiscal ? [eurostatFiscal] : []),
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
        request_id: `eurostat-shadow:${country.iso3}`,
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

    return {
      iso3: country.iso3,
      status:
        response && response.execution_authorized === false && response.missing_modules.length === 0
          ? "SHADOW_ACCEPTED"
          : "SHADOW_FAIL_CLOSED",
      eurostat_fiscal_candidate: Boolean(eurostatFiscal),
      fiscal_methodology: byModule.get("sovereign_fiscal")?.methodology_version ?? null,
      missing_modules: missingModules,
      unverified_modules: unverifiedModules,
      risk_gate: response
        ? {
            decision: response.decision,
            score: response.action_risk.score,
            confidence: response.action_risk.confidence,
            coverage: response.action_risk.coverage,
            calculation_hash: response.integrity.calculation_hash,
            execution_authorized: response.execution_authorized,
          }
        : null,
      error: null,
    };
  } catch (error) {
    return {
      iso3: country.iso3,
      status: "SHADOW_FAIL_CLOSED",
      eurostat_fiscal_candidate: false,
      fiscal_methodology: null,
      missing_modules: [...REQUIRED_MODULES],
      unverified_modules: [],
      risk_gate: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  await assertShadowSourceState();
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

  const shadowAccepted = results.filter((row) => row.status === "SHADOW_ACCEPTED");
  const eurostatCandidates = results.filter((row) => row.eurostat_fiscal_candidate);
  const report = {
    schema_version: "geomacro-eurostat-sovereign-fiscal-shadow-census-1.0",
    generated_at: generatedAt,
    source_activation: {
      ingestion_enabled: true,
      commercial_signals_enabled: false,
      production_scoring_promoted: false,
    },
    denominator: {
      type: "enabled_sovereign_countries",
      count: countries.length,
    },
    summary: {
      eurostat_fiscal_candidate_country_count: eurostatCandidates.length,
      shadow_accepted_country_count: shadowAccepted.length,
      shadow_fail_closed_country_count: results.length - shadowAccepted.length,
    },
    claim_boundary: {
      shadow_validation_only: true,
      not_a_production_support_claim: true,
      no_source_flag_bypass: true,
      wdi_and_eurostat_debt_values_not_mixed: true,
      execution_authorized_is_false: true,
    },
    countries: results,
  };

  const output = String(process.env.EUROSTAT_SHADOW_CENSUS_OUTPUT ?? "").trim();
  const json = JSON.stringify(report, null, 2) + "\n";
  if (output) await Bun.write(output, json);
  console.log(json);

  if (eurostatCandidates.length < 20) {
    console.error("Eurostat shadow methodology did not produce the minimum 20 country candidates");
    process.exit(2);
  }
  if (shadowAccepted.length === 0) {
    console.error("Eurostat shadow methodology produced zero end-to-end accepted countries");
    process.exit(3);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
