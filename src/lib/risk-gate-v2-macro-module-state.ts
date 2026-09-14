import type {
  CountryMacroRiskComponent,
  MacroDimensionKey,
  MacroDimensionResult,
} from "./country-risk-v02-macro-contract";
import type { RiskGateV2CommercialEligibilityStatus } from "./risk-gate-v2-contract";
import type { RiskGateV2ModuleStateInput } from "./risk-gate-v2-engine";
import type {
  RiskGateV2CoverageState,
  RiskGateV2Driver,
  RiskGateV2Module,
} from "./risk-gate-v2-taxonomy";

export const RISK_GATE_V2_MACRO_MODULE_METHOD_VERSION =
  "risk-gate-v2-macro-modules-0.1.0" as const;

export const RISK_GATE_V2_MACRO_MODULE_TTL_MS =
  24 * 60 * 60 * 1000;

type ModuleDefinition = {
  module: Extract<RiskGateV2Module, "macro_monetary" | "sovereign_fiscal">;
  dimensions: readonly Array<{
    key: MacroDimensionKey;
    driver: RiskGateV2Driver;
  }>;
  coverage_ceiling: Exclude<RiskGateV2CoverageState, "FULL" | "INSUFFICIENT">;
};

const DEFINITIONS: Record<
  "macro_monetary" | "sovereign_fiscal",
  ModuleDefinition
> = {
  macro_monetary: {
    module: "macro_monetary",
    dimensions: [
      { key: "inflation", driver: "inflation" },
      { key: "growth", driver: "growth_slowdown_recession" },
      { key: "unemployment", driver: "labor_market_stress" },
    ],
    // Three governed WDI dimensions support a useful module, but do not cover
    // rates, external balances, policy divergence or liquidity. Do not claim
    // FULL until those families are implemented and the methodology is bumped.
    coverage_ceiling: "PARTIAL",
  },
  sovereign_fiscal: {
    module: "sovereign_fiscal",
    dimensions: [
      { key: "government_debt", driver: "debt_sustainability" },
    ],
    // Government debt is one important fiscal input, not the whole sovereign
    // fiscal risk surface. The current method is therefore deliberately LIMITED.
    coverage_ceiling: "LIMITED",
  },
};

function round6(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function parseTimestamp(value: string, label: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return timestamp;
}

function freshnessConfidence(
  freshness: MacroDimensionResult["freshness_status"],
) {
  if (freshness === "CURRENT") return 1;
  if (freshness === "AGING") return 0.75;
  return 0;
}

function usableDimension(dimension: MacroDimensionResult | undefined) {
  return Boolean(
    dimension?.available &&
      typeof dimension.normalized_risk_score === "number" &&
      Number.isFinite(dimension.normalized_risk_score) &&
      (dimension.freshness_status === "CURRENT" ||
        dimension.freshness_status === "AGING"),
  );
}

function findDimension(
  component: CountryMacroRiskComponent,
  key: MacroDimensionKey,
) {
  return component.dimensions.find((dimension) => dimension.key === key);
}

function calculateModule(
  component: CountryMacroRiskComponent,
  definition: ModuleDefinition,
) {
  const selected = definition.dimensions.map(({ key, driver }) => ({
    key,
    driver,
    dimension: findDimension(component, key),
  }));

  const available = selected.filter((item) => usableDimension(item.dimension));
  if (available.length === 0) {
    return null;
  }

  const score = round6(
    available.reduce(
      (sum, item) => sum + item.dimension!.normalized_risk_score!,
      0,
    ) / available.length,
  );

  const confidence = round6(
    selected.reduce(
      (sum, item) =>
        sum +
        (usableDimension(item.dimension)
          ? freshnessConfidence(item.dimension!.freshness_status)
          : 0),
      0,
    ) / selected.length,
  );

  let coverage: RiskGateV2CoverageState;
  if (available.length === selected.length) {
    coverage = definition.coverage_ceiling;
  } else {
    coverage = "LIMITED";
  }

  const drivers = available.map((item) => ({
    driver: item.driver,
    // Divide by the complete expected dimension count rather than only the
    // observed count. Missing inputs therefore cannot silently redistribute
    // their driver contribution to the available signals.
    score_contribution: round6(
      item.dimension!.normalized_risk_score! / selected.length,
    ),
    delta_contribution: null,
    confidence: freshnessConfidence(item.dimension!.freshness_status),
  }));

  return {
    score,
    confidence,
    coverage,
    drivers,
  };
}

function moduleScore(
  component: CountryMacroRiskComponent | null | undefined,
  definition: ModuleDefinition,
) {
  if (!component) return null;
  return calculateModule(component, definition)?.score ?? null;
}

export type BuildRiskGateV2MacroModuleStateInput = {
  component: CountryMacroRiskComponent;
  previous_component?: CountryMacroRiskComponent | null;
  module: "macro_monetary" | "sovereign_fiscal";
  generated_at: string;
  commercial_eligibility_status: RiskGateV2CommercialEligibilityStatus;
  risk_object_ids?: string[];
};

/**
 * Convert the already-versioned country macro component into a Risk Gate v2
 * module state without inventing coverage. If no governed usable dimension is
 * available, this returns null so the v2 engine sees the active module as
 * missing and fails closed.
 */
export function buildRiskGateV2MacroModuleState(
  input: BuildRiskGateV2MacroModuleStateInput,
): RiskGateV2ModuleStateInput | null {
  const definition = DEFINITIONS[input.module];
  const current = calculateModule(input.component, definition);
  if (!current) {
    return null;
  }

  const generatedAt = parseTimestamp(input.generated_at, "generated_at");
  const expiresAt = new Date(
    generatedAt.getTime() + RISK_GATE_V2_MACRO_MODULE_TTL_MS,
  );

  const countryIso3 = input.component.country_iso3.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(countryIso3)) {
    throw new Error("Risk Gate v2 macro module requires a valid country ISO3");
  }

  if (
    input.previous_component &&
    input.previous_component.country_iso3.trim().toUpperCase() !== countryIso3
  ) {
    throw new Error("Previous macro component country does not match current component");
  }

  const previousScore = moduleScore(input.previous_component, definition);
  const delta =
    previousScore === null
      ? null
      : round6(current.score - previousScore);

  const drivers = current.drivers.map((driver) => ({
    ...driver,
    delta_contribution: null,
  }));

  const componentIdentity = input.component.calculation_hash
    .trim()
    .toLowerCase()
    .slice(0, 24);
  const moduleStateId = [
    "rgv2",
    countryIso3,
    input.module,
    componentIdentity || "unhashed-component",
    generatedAt.getTime().toString(36),
  ].join(":");

  return {
    module_state_id: moduleStateId,
    module: input.module,
    score: current.score,
    previous_score: previousScore,
    delta,
    confidence: current.confidence,
    coverage: current.coverage,
    commercial_eligibility_status: input.commercial_eligibility_status,
    generated_at: generatedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    methodology_version: RISK_GATE_V2_MACRO_MODULE_METHOD_VERSION,
    risk_object_ids: [...new Set(input.risk_object_ids ?? [])].sort(),
    drivers,
  };
}

export function buildRiskGateV2SupportedMacroStates(input: {
  component: CountryMacroRiskComponent;
  previous_component?: CountryMacroRiskComponent | null;
  generated_at: string;
  commercial_eligibility_status: RiskGateV2CommercialEligibilityStatus;
  risk_object_ids?: string[];
}): RiskGateV2ModuleStateInput[] {
  return (["macro_monetary", "sovereign_fiscal"] as const)
    .map((module) =>
      buildRiskGateV2MacroModuleState({
        ...input,
        module,
      }),
    )
    .filter((state): state is RiskGateV2ModuleStateInput => state !== null);
}
