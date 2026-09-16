import fs from "node:fs";
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
  type RiskGateV2ModuleStateInput,
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

const SHADOW_INPUT =
  process.env.WORLD_BANK_PPG_SHADOW_OUTPUT ??
  "world-bank-ppg-sovereign-fiscal-shadow.json";
const OUTPUT =
  process.env.GLOBAL_RISK_GATE_PPG_SHADOW_CENSUS_OUTPUT ??
  "global-risk-gate-country-ppg-shadow-census.json";
const TARGET = Math.max(
  1,
  Number(process.env.GLOBAL_RISK_GATE_PPG_SHADOW_TARGET_COUNTRIES ?? 100),
);
const CONCURRENCY = Math.max(
  1,
  Math.min(8, Number(process.env.GLOBAL_RISK_GATE_CENSUS_CONCURRENCY ?? 3)),
);

const EVIDENCE_POLICY: RiskGateV2ResolvedPolicy = {
  policy_id: "global-country-ppg-shadow-evidence",
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
  profile_id: "global-country-ppg-shadow-review",
  profile_version: "1.0.0",
  action_type: "investment_allocation_review",
  methodology_version: "global-country-ppg-shadow-census-1.0.0",
  module_weights: {
    geopolitical_security: 0.25,
    political_governance: 0.25,
    sovereign_fiscal: 0.25,
    macro_monetary: 0.25,
  },
};

function loadShadowFiscalStates() {
  if (!fs.existsSync(SHADOW_INPUT)) {
    throw new Error(`Missing World Bank PPG shadow proof: ${SHADOW_INPUT}`);
  }
  const report = JSON.parse(fs.readFileSync(SHADOW_INPUT, "utf8"));
  if (report?.writes_performed !== false) {
    throw new Error("PPG shadow proof must be no-write");
  }
  if (report?.production_activation_allowed !== false) {
    throw new Error("PPG shadow proof unexpectedly allows production activation");
  }
  if (report?.scoring_production_changed !== false) {
    throw new Error("PPG shadow proof unexpectedly changed production scoring");
  }
  if (report?.country_payability_changed !== false) {
    throw new Error("PPG shadow proof unexpectedly changed country payability");
  }
  if (report?.base_mainnet_gate_changed !== false) {
    throw new Error("PPG shadow proof unexpectedly changed the Base mainnet gate");
  }
  if (report?.shadow_summary?.target_reached !== true) {
    throw new Error("PPG shadow proof has not reached its own target");
  }

  const states = Array.isArray(report?.states) ? report.states : [];
  const byIso3 = new Map<string, RiskGateV2ModuleStateInput>();
  for (const raw of states) {
    const state = raw as RiskGateV2ModuleStateInput;
    if (
      state?.module !== "sovereign_fiscal" ||
      state?.commercial_eligibility_status !== "VERIFIED" ||
      state?.coverage !== "LIMITED" ||
      typeof state?.module_state_id !== "string"
    ) {
      throw new Error("Invalid PPG shadow fiscal state");
    }
    const match = /^rgv2:([A-Z]{3}):sovereign_fiscal:world-bank-ppg-external-debt:/.exec(
      state.module_state_id,
    );
    if (!match) throw new Error("PPG shadow state has an invalid module_state_id");
    const iso3 = match[1];
    if (byIso3.has(iso3)) throw new Error(`Duplicate PPG shadow state for ${iso3}`);
    byIso3.set(iso3, state);
  }
  return {
    byIso3,
    proof: {
      schema_version: report.schema_version,
      report_hash: report.report_hash,
      eligible_shadow_country_count: Number(
        report?.shadow_summary?.eligible_shadow_country_count ?? 0,
      ),
      normalization_peer_count: Number(report?.normalization?.peer_count ?? 0),
      metric: String(report?.normalization?.metric ?? ""),
    },
  };
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
  shadowFiscalByIso3: Map<string, RiskGateV2ModuleStateInput>,
) {
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

    const productionHasFiscal = productionMacroStates.some(
      (state) => state.module === "sovereign_fiscal",
    );
    const shadowFiscal = productionHasFiscal
      ? null
      : shadowFiscalByIso3.get(country.iso3) ?? null;
    const states = [
      ...(geopolitical ? [geopolitical] : []),
      ...(political ? [political] : []),
      ...productionMacroStates,
      ...(shadowFiscal ? [shadowFiscal] : []),
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
        request_id: `country-ppg-shadow-census:${country.iso3}`,
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
      response = await evaluateRiskGateV2(
        {
          request,
          policy: EVIDENCE_POLICY,
          action_profile: EVIDENCE_ACTION_PROFILE,
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
      status: accepted ? "SHADOW_ACCEPTED" : "FAIL_CLOSED",
      ppg_shadow_fiscal_used: shadowFiscal !== null,
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
        generated_at: state.generated_at,
        expires_at: state.expires_at,
      })),
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
      country_name: country.country_name,
      region: country.region,
      subregion: country.subregion,
      status: "FAIL_CLOSED",
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
  if (!Number.isFinite(TARGET) || TARGET < 1) throw new Error("Invalid shadow census target");
  const generatedAt = new Date().toISOString();
  const shadow = loadShadowFiscalStates();
  const countries = await loadCountries();
  const results = new Array<Awaited<ReturnType<typeof evaluateCountry>>>(countries.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= countries.length) return;
      results[index] = await evaluateCountry(
        countries[index],
        generatedAt,
        shadow.byIso3,
      );
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const accepted = results.filter((row) => row.status === "SHADOW_ACCEPTED");
  const usingPpg = accepted.filter((row) => row.ppg_shadow_fiscal_used);
  const blockerCounts: Record<string, number> = {};
  for (const row of results.filter((candidate) => candidate.status === "FAIL_CLOSED")) {
    for (const module of row.missing_modules) {
      blockerCounts[module] = (blockerCounts[module] ?? 0) + 1;
    }
    if (row.error) blockerCounts.ERROR = (blockerCounts.ERROR ?? 0) + 1;
  }

  const report = {
    schema_version: "geomacro-global-risk-gate-country-ppg-shadow-census-1.0",
    generated_at: generatedAt,
    writes_performed: false,
    denominator: {
      type: "enabled_sovereign_countries",
      count: countries.length,
    },
    target_shadow_accepted_country_count: TARGET,
    required_country_modules: REQUIRED_MODULES,
    ppg_shadow_proof: shadow.proof,
    summary: {
      shadow_accepted_country_count: accepted.length,
      fail_closed_country_count: results.length - accepted.length,
      shadow_accepted_pct: results.length
        ? Number(((accepted.length / results.length) * 100).toFixed(2))
        : 0,
      shadow_accepted_using_ppg_fiscal_count: usingPpg.length,
      target_reached: accepted.length >= TARGET,
      blocker_counts: blockerCounts,
    },
    claim_boundary: {
      shadow_only: true,
      production_activation_allowed: false,
      production_country_payability_changed: false,
      production_scoring_changed: false,
      base_mainnet_gate_changed: false,
      missing_or_unverified_input_fails_closed: true,
      execution_authorized_is_false: true,
      ppg_external_debt_not_relabelled_as_total_government_debt: true,
      no_raw_cross_source_value_pooling: true,
    },
    countries: results,
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    generated_at: report.generated_at,
    denominator: report.denominator,
    summary: report.summary,
    claim_boundary: report.claim_boundary,
  }, null, 2));

  if (process.argv.includes("--require-target") && !report.summary.target_reached) {
    throw new Error(
      `PPG full shadow census accepted ${accepted.length}, below target ${TARGET}`,
    );
  }
  console.log("PASS: GLOBAL PPG SHADOW COUNTRY CENSUS COMPLETE - NO PRODUCTION CHANGES");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
