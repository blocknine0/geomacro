import type { CountryGeopoliticalRiskComponent } from "./country-risk-v02-geopolitics-contract";
import type { RiskGateV2CommercialEligibilityStatus } from "./risk-gate-v2-contract";
import type { RiskGateV2ModuleStateInput } from "./risk-gate-v2-engine";

export const RISK_GATE_V2_SOCIETAL_DISPLACEMENT_METHOD_VERSION =
  "risk-gate-v2-societal-displacement-0.1.0" as const;

export const RISK_GATE_V2_SOCIETAL_DISPLACEMENT_TTL_MS =
  24 * 60 * 60 * 1000;

function round6(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function parseTimestamp(value: string, label: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function usableScore(component: CountryGeopoliticalRiskComponent | null | undefined) {
  if (
    !component ||
    typeof component.weighted_observed_risk !== "number" ||
    !Number.isFinite(component.weighted_observed_risk)
  ) {
    return null;
  }
  return Math.min(100, Math.max(0, component.weighted_observed_risk));
}

export function buildRiskGateV2SocietalModuleState(input: {
  component: CountryGeopoliticalRiskComponent;
  previous_component?: CountryGeopoliticalRiskComponent | null;
  generated_at: string;
  commercial_eligibility_status: RiskGateV2CommercialEligibilityStatus;
  risk_object_ids?: string[];
}): RiskGateV2ModuleStateInput | null {
  const score = usableScore(input.component);
  if (score === null) return null;

  const iso3 = input.component.country_iso3.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) {
    throw new Error("Risk Gate v2 societal module requires a valid country ISO3");
  }

  if (
    input.previous_component &&
    input.previous_component.country_iso3.trim().toUpperCase() !== iso3
  ) {
    throw new Error("Previous societal component country does not match current component");
  }

  const generatedAt = parseTimestamp(input.generated_at, "generated_at");
  const previousScore = usableScore(input.previous_component);
  const delta = previousScore === null ? null : round6(score - previousScore);

  // This supported scope intentionally covers displacement/migration stress only.
  // Public-health and labour-disruption signals remain future expansion work, so
  // the coverage state cannot exceed LIMITED in this methodology version.
  const confidence = round6(
    Math.min(1, Math.max(0, input.component.confidence_factor)),
  );

  return {
    module_state_id: [
      "rgv2",
      iso3,
      "societal_labor_health",
      input.component.calculation_hash.trim().toLowerCase().slice(0, 24) ||
        "unhashed-component",
      generatedAt.getTime().toString(36),
    ].join(":"),
    module: "societal_labor_health",
    score: round6(score),
    previous_score: previousScore === null ? null : round6(previousScore),
    delta,
    confidence,
    coverage: "LIMITED",
    commercial_eligibility_status: input.commercial_eligibility_status,
    generated_at: generatedAt.toISOString(),
    expires_at: new Date(
      generatedAt.getTime() + RISK_GATE_V2_SOCIETAL_DISPLACEMENT_TTL_MS,
    ).toISOString(),
    methodology_version: RISK_GATE_V2_SOCIETAL_DISPLACEMENT_METHOD_VERSION,
    risk_object_ids: [...new Set(input.risk_object_ids ?? [])].sort(),
    drivers: [
      {
        driver: "migration_shock",
        score_contribution: round6(score),
        delta_contribution: delta,
        confidence,
      },
    ],
  };
}
