import { classifyGlobalEntity } from "../src/lib/global-entity-classification";
import { generateCountryRiskGateV2MacroModuleStates } from "../src/lib/risk-gate-v2-macro-module-state.server";
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
import { RISK_GATE_V2_SUPPORT_READINESS } from "../src/lib/risk-gate-v2-support-readiness";
import type { RiskGateV2Module } from "../src/lib/risk-gate-v2-taxonomy";
import { requireRiskSupabase } from "../src/lib/risk-supabase.server";

const REQUIRED_MODULES = [
  "geopolitical_security",
  "political_governance",
  "sovereign_fiscal",
  "macro_monetary",
] as const satisfies readonly RiskGateV2Module[];

const WORLD_BANK_SOURCE_ID = "world_bank_indicators";

const CONCURRENCY = Math.max(
  1,
  Math.min(8, Number(process.env.GLOBAL_RISK_GATE_CENSUS_CONCURRENCY ?? 3)),
);

const EVIDENCE_POLICY: RiskGateV2ResolvedPolicy = {
  policy_id: "global-country-census-evidence",
  policy_version: "1.0.0",
  continue_max_score: 35,
  reduce_limit_max_score: 55,
  require_approval_max_score: 75,
  minimum_confidence_for_auto_continue: 0.5,
  minimum_coverage_for_auto_continue: "LIMITED",
  require_commercial_verification_for_continue: true,
  pause_on_insufficient_coverage: true,
};

const EVIDENCE_ACTION_PROFILE: RiskGateV2ActionProfile = {
  profile_id: "global-country-review-evidence",
  profile_version: "1.0.0",
  action_type: "investment_allocation_review",
  methodology_version: "global-country-census-1.0.0",
  module_weights: {
    geopolitical_security: 0.25,
    political_governance: 0.25,
    sovereign_fiscal: 0.25,
    macro_monetary: 0.25,
  },
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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

async function loadWorldBankOperationalState() {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_external_sources")
    .select(
      "source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,raw_redistribution_allowed,attribution_required",
    )
    .eq("source_id", WORLD_BANK_SOURCE_ID)
    .maybeSingle();

  if (result.error) {
    return {
      source_id: WORLD_BANK_SOURCE_ID,
      present: false,
      query_error: errorMessage(result.error),
    };
  }

  if (!result.data) {
    return {
      source_id: WORLD_BANK_SOURCE_ID,
      present: false,
      query_error: null,
    };
  }

  return {
    source_id: WORLD_BANK_SOURCE_ID,
    present: true,
    commercial_usage_status: result.data.commercial_usage_status ?? null,
    enabled_for_ingestion: result.data.enabled_for_ingestion === true,
    enabled_for_commercial_signals:
      result.data.enabled_for_commercial_signals === true,
    raw_redistribution_allowed: result.data.raw_redistribution_allowed === true,
    attribution_required: result.data.attribution_required === true,
    operational_for_commercial_macro:
      result.data.commercial_usage_status === "COMMERCIAL_OK" &&
      result.data.enabled_for_ingestion === true &&
      result.data.enabled_for_commercial_signals === true,
    query_error: null,
  };
}

async function evaluateCountry(
  country: Awaited<ReturnType<typeof loadCountries>>[number],
  generatedAt: string,
) {
  const moduleErrors: Partial<Record<RiskGateV2Module, string>> = {};
  const states: Array<any> = [];

  const [geopoliticalResult, politicalResult, macroResult] =
    await Promise.allSettled([
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

  if (geopoliticalResult.status === "fulfilled") {
    if (geopoliticalResult.value) states.push(geopoliticalResult.value);
  } else {
    moduleErrors.geopolitical_security = errorMessage(geopoliticalResult.reason);
  }

  if (politicalResult.status === "fulfilled") {
    if (politicalResult.value) states.push(politicalResult.value);
  } else {
    moduleErrors.political_governance = errorMessage(politicalResult.reason);
  }

  if (macroResult.status === "fulfilled") {
    states.push(...macroResult.value);
  } else {
    const message = errorMessage(macroResult.reason);
    moduleErrors.sovereign_fiscal = message;
    moduleErrors.macro_monetary = message;
  }

  const byModule = new Map(states.map((state) => [state.module, state]));
  const missingModules = REQUIRED_MODULES.filter((module) => !byModule.has(module));
  const unverifiedModules = REQUIRED_MODULES.filter(
    (module) =>
      byModule.has(module) &&
      byModule.get(module)?.commercial_eligibility_status !== "VERIFIED",
  );

  let response: Awaited<ReturnType<typeof evaluateRiskGateV2>> | null = null;
  let gateError: string | null = null;
  if (missingModules.length === 0 && unverifiedModules.length === 0) {
    const request: RiskGateV2Request = {
      schema_version: RISK_GATE_V2_REQUEST_SCHEMA_VERSION,
      request_id: `country-census:${country.iso3}`,
      primary_subject: { type: "country", id: country.iso3 },
      exposures: [],
      action_context: {
        action_type: "investment_allocation_review",
        time_horizon: "days",
      },
      policy: {
        policy_id: EVIDENCE_POLICY.policy_id,
        policy_version: EVIDENCE_POLICY.policy_version,
      },
    };

    try {
      response = await evaluateRiskGateV2(
        {
          request,
          policy: EVIDENCE_POLICY,
          action_profile: EVIDENCE_ACTION_PROFILE,
          module_states: states,
        },
        new Date(generatedAt),
      );
    } catch (error) {
      gateError = errorMessage(error);
    }
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
    status: accepted ? "ACCEPTED" : "FAIL_CLOSED",
    missing_modules: missingModules,
    unverified_modules: unverifiedModules,
    module_errors: moduleErrors,
    module_states: states.map((state) => ({
      module: state.module,
      score: state.score,
      confidence: state.confidence,
      coverage: state.coverage,
      commercial_eligibility_status: state.commercial_eligibility_status,
      methodology_version: state.methodology_version,
      generated_at: state.generated_at,
      expires_at: state.expires_at,
    })),
    risk_gate: response
      ? {
          decision: response.decision,
          display_label: response.display_label,
          score: response.action_risk.score,
          confidence: response.action_risk.confidence,
          coverage: response.action_risk.coverage,
          reason_codes: response.reason_codes,
          calculation_hash: response.integrity.calculation_hash,
          execution_authorized: response.execution_authorized,
        }
      : null,
    error: gateError,
  };
}

function countReasons(values: Array<string | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const reason = String(value ?? "").trim();
    if (!reason) continue;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

async function main() {
  const generatedAt = new Date().toISOString();
  const [countries, worldBankSource] = await Promise.all([
    loadCountries(),
    loadWorldBankOperationalState(),
  ]);
  const results = new Array<Awaited<ReturnType<typeof evaluateCountry>>>(
    countries.length,
  );
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
  const moduleReadyCountryCounts = Object.fromEntries(
    REQUIRED_MODULES.map((module) => [
      module,
      results.filter((row) =>
        row.module_states.some(
          (state) =>
            state.module === module &&
            state.commercial_eligibility_status === "VERIFIED",
        ),
      ).length,
    ]),
  );
  const moduleErrorCountryCounts = Object.fromEntries(
    REQUIRED_MODULES.map((module) => [
      module,
      results.filter((row) => row.module_errors[module]).length,
    ]),
  );
  const missingCountryIso3ByModule = Object.fromEntries(
    REQUIRED_MODULES.map((module) => [
      module,
      results.filter((row) => row.missing_modules.includes(module)).map((row) => row.iso3),
    ]),
  );
  const unverifiedCountryIso3ByModule = Object.fromEntries(
    REQUIRED_MODULES.map((module) => [
      module,
      results.filter((row) => row.unverified_modules.includes(module)).map((row) => row.iso3),
    ]),
  );
  const moduleErrorReasonCounts = Object.fromEntries(
    REQUIRED_MODULES.map((module) => [
      module,
      countReasons(results.map((row) => row.module_errors[module])),
    ]),
  );

  const report = {
    schema_version: "geomacro-global-risk-gate-country-census-2.2",
    generated_at: generatedAt,
    denominator: {
      type: "enabled_sovereign_countries",
      count: countries.length,
    },
    required_country_modules: REQUIRED_MODULES,
    support_registry: Object.fromEntries(
      REQUIRED_MODULES.map((module) => [module, RISK_GATE_V2_SUPPORT_READINESS[module]]),
    ),
    governed_source_state: {
      world_bank_indicators: worldBankSource,
    },
    evidence_profile: {
      action_type: EVIDENCE_ACTION_PROFILE.action_type,
      action_profile_version: EVIDENCE_ACTION_PROFILE.profile_version,
      policy_version: EVIDENCE_POLICY.policy_version,
      note: "Evidence profile proves the country-review Risk Gate path. It is not a customer-specific policy recommendation.",
    },
    summary: {
      accepted_country_count: accepted.length,
      fail_closed_country_count: results.length - accepted.length,
      accepted_pct: results.length
        ? Number(((accepted.length / results.length) * 100).toFixed(2))
        : 0,
      module_ready_country_counts: moduleReadyCountryCounts,
      module_error_country_counts: moduleErrorCountryCounts,
      missing_country_iso3_by_module: missingCountryIso3ByModule,
      unverified_country_iso3_by_module: unverifiedCountryIso3ByModule,
      module_error_reason_counts: moduleErrorReasonCounts,
    },
    claim_boundary: {
      country_review_readiness_only: true,
      all_action_classes_not_implied: true,
      missing_or_unverified_input_fails_closed: true,
      source_state_diagnostics_exclude_credentials_and_raw_payloads: true,
      execution_authorized_is_false: true,
    },
    countries: results,
  };

  const json = JSON.stringify(report, null, 2) + "\n";
  const output = String(process.env.GLOBAL_RISK_GATE_CENSUS_OUTPUT ?? "").trim();
  if (output) await Bun.write(output, json);
  console.log(json);

  if (process.argv.includes("--require-any-accepted") && accepted.length === 0) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
