import { createClient } from "@supabase/supabase-js";

import { classifyGlobalEntity } from "../src/lib/global-entity-classification";
import { generateCountryRiskGateV2MacroModuleStates } from "../src/lib/risk-gate-v2-macro-module-state.server";
import { RISK_GATE_V2_SUPPORT_READINESS } from "../src/lib/risk-gate-v2-support-readiness";
import type { RiskGateV2CoverageState, RiskGateV2Module } from "../src/lib/risk-gate-v2-taxonomy";

const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx";
const REQUIRED_COUNTRY_MODULES: readonly RiskGateV2Module[] = [
  "geopolitical_security",
  "political_governance",
  "sovereign_fiscal",
  "macro_monetary",
];

const COVERAGE_RANK: Record<RiskGateV2CoverageState, number> = {
  INSUFFICIENT: 0,
  LIMITED: 1,
  PARTIAL: 2,
  FULL: 3,
};

function projectRef(url: string) {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

function minCoverage(values: RiskGateV2CoverageState[]): RiskGateV2CoverageState {
  if (values.length === 0) return "INSUFFICIENT";
  return values.reduce((worst, value) =>
    COVERAGE_RANK[value] < COVERAGE_RANK[worst] ? value : worst,
  "FULL" as RiskGateV2CoverageState);
}

function outputPath() {
  const explicit = String(process.env.GLOBAL_RISK_GATE_CENSUS_OUTPUT ?? "").trim();
  return explicit || null;
}

async function main() {
  const supabaseUrl = String(process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
  const serviceRole = String(
    process.env.APP_SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      "",
  ).trim();

  if (!supabaseUrl || !serviceRole) {
    throw new Error("Authoritative Supabase server credentials are required");
  }

  if (projectRef(supabaseUrl) !== AUTHORITATIVE_PROJECT_REF) {
    throw new Error("Supabase URL does not point to the authoritative Geomacro project");
  }

  const db = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const registryResult = await db
    .from("live_country_registry")
    .select("iso3,country_name,region,subregion,enabled")
    .eq("enabled", true)
    .order("iso3", { ascending: true });

  if (registryResult.error) throw registryResult.error;

  const registry = (registryResult.data ?? [])
    .map((row) => ({
      iso3: String(row.iso3 ?? "").trim().toUpperCase(),
      country_name: String(row.country_name ?? "").trim(),
      region: row.region == null ? null : String(row.region),
      subregion: row.subregion == null ? null : String(row.subregion),
      entity_scope: classifyGlobalEntity(String(row.iso3 ?? "")),
    }))
    .filter((row) => row.entity_scope === "SOVEREIGN");

  const asOf = new Date().toISOString();
  const countries: Array<Record<string, unknown>> = [];

  for (const country of registry) {
    try {
      const states = await generateCountryRiskGateV2MacroModuleStates({
        country_iso3: country.iso3,
        as_of: asOf,
        generated_at: asOf,
      });

      const stateByModule = new Map(states.map((state) => [state.module, state]));
      const supportedRequired = REQUIRED_COUNTRY_MODULES.filter(
        (module) => RISK_GATE_V2_SUPPORT_READINESS[module].status === "SUPPORTED",
      );
      const sourceReadyRequired = REQUIRED_COUNTRY_MODULES.filter(
        (module) => RISK_GATE_V2_SUPPORT_READINESS[module].status === "SOURCE_READY",
      );
      const blockedRequired = REQUIRED_COUNTRY_MODULES.filter((module) => {
        const status = RISK_GATE_V2_SUPPORT_READINESS[module].status;
        return status !== "SUPPORTED" && status !== "SOURCE_READY";
      });

      const presentSupported = supportedRequired.filter((module) => stateByModule.has(module));
      const missingSupported = supportedRequired.filter((module) => !stateByModule.has(module));
      const currentCoverage = minCoverage(
        presentSupported
          .map((module) => stateByModule.get(module)?.coverage)
          .filter((value): value is RiskGateV2CoverageState => Boolean(value)),
      );

      const commercialVerified = presentSupported.every(
        (module) => stateByModule.get(module)?.commercial_eligibility_status === "VERIFIED",
      );

      const allRequiredImplemented = REQUIRED_COUNTRY_MODULES.every(
        (module) => RISK_GATE_V2_SUPPORT_READINESS[module].status === "SUPPORTED",
      );
      const allRequiredPresent = REQUIRED_COUNTRY_MODULES.every((module) => stateByModule.has(module));
      const accepted = allRequiredImplemented && allRequiredPresent && commercialVerified;

      let readinessState: string;
      if (accepted) {
        readinessState = "ACCEPTED";
      } else if (presentSupported.length > 0 && missingSupported.length === 0) {
        readinessState = "LIMITED_MODULE_COVERAGE";
      } else if (presentSupported.length > 0) {
        readinessState = "PARTIAL_MODULE_COVERAGE";
      } else {
        readinessState = "INSUFFICIENT";
      }

      countries.push({
        iso3: country.iso3,
        country_name: country.country_name,
        region: country.region,
        subregion: country.subregion,
        readiness_state: readinessState,
        country_gate_accepted: accepted,
        current_supported_coverage: currentCoverage,
        supported_required_modules: supportedRequired,
        present_supported_modules: presentSupported,
        missing_supported_modules: missingSupported,
        source_ready_required_modules: sourceReadyRequired,
        blocked_required_modules: blockedRequired,
        module_states: states.map((state) => ({
          module: state.module,
          score: state.score,
          confidence: state.confidence,
          coverage: state.coverage,
          commercial_eligibility_status: state.commercial_eligibility_status,
          methodology_version: state.methodology_version,
          generated_at: state.generated_at,
          expires_at: state.expires_at,
          driver_count: state.drivers.length,
        })),
        blockers: REQUIRED_COUNTRY_MODULES.flatMap((module) => {
          const readiness = RISK_GATE_V2_SUPPORT_READINESS[module];
          if (readiness.status === "SUPPORTED" && stateByModule.has(module)) return [];
          if (readiness.status === "SUPPORTED") {
            return [`${module}: no usable current governed module state`];
          }
          return readiness.blockers.map((blocker) => `${module}: ${blocker}`);
        }),
        error: null,
      });
    } catch (error) {
      countries.push({
        iso3: country.iso3,
        country_name: country.country_name,
        region: country.region,
        subregion: country.subregion,
        readiness_state: "ERROR",
        country_gate_accepted: false,
        current_supported_coverage: "INSUFFICIENT",
        supported_required_modules: [],
        present_supported_modules: [],
        missing_supported_modules: [],
        source_ready_required_modules: [],
        blocked_required_modules: [],
        module_states: [],
        blockers: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const acceptedCount = countries.filter((row) => row.country_gate_accepted === true).length;
  const limitedCount = countries.filter((row) => row.readiness_state === "LIMITED_MODULE_COVERAGE").length;
  const partialCount = countries.filter((row) => row.readiness_state === "PARTIAL_MODULE_COVERAGE").length;
  const insufficientCount = countries.filter((row) => row.readiness_state === "INSUFFICIENT").length;
  const errorCount = countries.filter((row) => row.readiness_state === "ERROR").length;

  const report = {
    schema_version: "geomacro-global-risk-gate-country-census-1.0",
    generated_at: asOf,
    authoritative_project_ref: AUTHORITATIVE_PROJECT_REF,
    denominator: {
      type: "enabled_sovereign_countries",
      count: registry.length,
      excludes: ["territories", "special_entities", "unclassified_entities"],
    },
    required_country_modules: REQUIRED_COUNTRY_MODULES,
    support_registry: Object.fromEntries(
      REQUIRED_COUNTRY_MODULES.map((module) => [module, RISK_GATE_V2_SUPPORT_READINESS[module]]),
    ),
    summary: {
      accepted: acceptedCount,
      accepted_pct: registry.length === 0 ? 0 : Number(((acceptedCount / registry.length) * 100).toFixed(2)),
      limited_module_coverage: limitedCount,
      partial_module_coverage: partialCount,
      insufficient: insufficientCount,
      errors: errorCount,
    },
    claim_boundary: {
      global_subject_registry_exists: true,
      global_subject_registry_is_not_validated_coverage: true,
      quiet_country_is_not_zero_risk: true,
      unsupported_or_missing_required_module_fails_closed: true,
      execution_authorized: false,
    },
    countries,
  };

  const json = JSON.stringify(report, null, 2) + "\n";
  console.log(json);

  const path = outputPath();
  if (path) await Bun.write(path, json);

  if (process.argv.includes("--require-no-errors") && errorCount > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
