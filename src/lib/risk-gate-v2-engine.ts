import type { RiskGateDecision } from "./risk-gate-contract";
import { semanticRiskGateAction } from "./risk-gate-explainability";
import {
  buildRiskGateV2ActivationPlan,
  type RiskGateV2ActivationPlan,
} from "./risk-gate-v2-context";
import {
  RISK_GATE_V2_SCHEMA_VERSION,
  riskGateV2DisplayLabel,
  type RiskGateV2Alternative,
  type RiskGateV2CommercialEligibilityStatus,
  type RiskGateV2DriverResult,
  type RiskGateV2ReasonCode,
  type RiskGateV2Request,
  type RiskGateV2Response,
  type RiskGateV2ThresholdTrigger,
} from "./risk-gate-v2-contract";
import type {
  RiskGateV2ActionType,
  RiskGateV2CoverageState,
  RiskGateV2Driver,
  RiskGateV2Module,
} from "./risk-gate-v2-taxonomy";

export const RISK_GATE_V2_ENGINE_VERSION =
  "risk-gate-v2-engine-0.1.0" as const;

export type RiskGateV2ResolvedPolicy = {
  policy_id: string;
  policy_version: string;
  continue_max_score: number;
  reduce_limit_max_score: number;
  require_approval_max_score: number;
  minimum_confidence_for_auto_continue: number;
  minimum_coverage_for_auto_continue: RiskGateV2CoverageState;
  require_commercial_verification_for_continue: boolean;
  pause_on_insufficient_coverage: boolean;
  max_positive_delta_for_auto_continue?: number;
  hard_stop_module_scores?: Partial<Record<RiskGateV2Module, number>>;
  hard_stop_driver_contributions?: Partial<Record<RiskGateV2Driver, number>>;
};

export type RiskGateV2ActionProfile = {
  profile_id: string;
  profile_version: string;
  action_type: RiskGateV2ActionType;
  methodology_version: string;
  module_weights: Partial<Record<RiskGateV2Module, number>>;
};

export type RiskGateV2ModuleStateInput = {
  module_state_id: string;
  module: RiskGateV2Module;
  score: number;
  previous_score: number | null;
  delta: number | null;
  confidence: number;
  coverage: RiskGateV2CoverageState;
  commercial_eligibility_status: RiskGateV2CommercialEligibilityStatus;
  generated_at: string;
  expires_at: string;
  methodology_version: string;
  risk_object_ids: string[];
  drivers: Array<{
    driver: RiskGateV2Driver;
    score_contribution: number;
    delta_contribution: number | null;
    confidence: number;
  }>;
};

export type RiskGateV2EvaluationInput = {
  request: RiskGateV2Request;
  policy: RiskGateV2ResolvedPolicy;
  action_profile: RiskGateV2ActionProfile;
  module_states: RiskGateV2ModuleStateInput[];
  alternatives?: RiskGateV2Alternative[];
};

const COVERAGE_RANK: Record<RiskGateV2CoverageState, number> = {
  INSUFFICIENT: 0,
  LIMITED: 1,
  PARTIAL: 2,
  FULL: 3,
};

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function strongerDecision(
  left: RiskGateDecision,
  right: RiskGateDecision,
): RiskGateDecision {
  const rank: Record<RiskGateDecision, number> = {
    CONTINUE: 0,
    REDUCE_LIMIT: 1,
    REQUIRE_APPROVAL: 2,
    PAUSE: 3,
  };

  return rank[right] > rank[left] ? right : left;
}

function validateScoreThreshold(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} must be within 0..100`);
  }
}

function validatePolicy(policy: RiskGateV2ResolvedPolicy) {
  validateScoreThreshold(policy.continue_max_score, "continue_max_score");
  validateScoreThreshold(
    policy.reduce_limit_max_score,
    "reduce_limit_max_score",
  );
  validateScoreThreshold(
    policy.require_approval_max_score,
    "require_approval_max_score",
  );

  if (
    !(
      policy.continue_max_score < policy.reduce_limit_max_score &&
      policy.reduce_limit_max_score < policy.require_approval_max_score
    )
  ) {
    throw new Error("Risk Gate v2 score thresholds must be strictly increasing");
  }

  if (
    !Number.isFinite(policy.minimum_confidence_for_auto_continue) ||
    policy.minimum_confidence_for_auto_continue < 0 ||
    policy.minimum_confidence_for_auto_continue > 1
  ) {
    throw new Error(
      "minimum_confidence_for_auto_continue must be within 0..1",
    );
  }

  if (
    typeof policy.max_positive_delta_for_auto_continue === "number" &&
    (!Number.isFinite(policy.max_positive_delta_for_auto_continue) ||
      policy.max_positive_delta_for_auto_continue < 0 ||
      policy.max_positive_delta_for_auto_continue > 100)
  ) {
    throw new Error(
      "max_positive_delta_for_auto_continue must be within 0..100",
    );
  }

  for (const [module, threshold] of Object.entries(
    policy.hard_stop_module_scores ?? {},
  )) {
    validateScoreThreshold(threshold, `hard_stop_module_scores.${module}`);
  }

  for (const [driver, threshold] of Object.entries(
    policy.hard_stop_driver_contributions ?? {},
  )) {
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      throw new Error(
        `hard_stop_driver_contributions.${driver} must be within 0..100`,
      );
    }
  }
}

function validateModuleState(state: RiskGateV2ModuleStateInput) {
  validateScoreThreshold(state.score, `module ${state.module} score`);

  if (
    state.previous_score !== null &&
    (!Number.isFinite(state.previous_score) ||
      state.previous_score < 0 ||
      state.previous_score > 100)
  ) {
    throw new Error(`module ${state.module} previous_score must be within 0..100`);
  }

  if (
    !Number.isFinite(state.confidence) ||
    state.confidence < 0 ||
    state.confidence > 1
  ) {
    throw new Error(`module ${state.module} confidence must be within 0..1`);
  }

  const generatedAt = new Date(state.generated_at);
  const expiresAt = new Date(state.expires_at);

  if (
    Number.isNaN(generatedAt.getTime()) ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= generatedAt.getTime()
  ) {
    throw new Error(`module ${state.module} has invalid validity timestamps`);
  }

  for (const driver of state.drivers) {
    if (
      !Number.isFinite(driver.confidence) ||
      driver.confidence < 0 ||
      driver.confidence > 1
    ) {
      throw new Error(`driver ${driver.driver} confidence must be within 0..1`);
    }
  }
}

function validateProfile(
  profile: RiskGateV2ActionProfile,
  request: RiskGateV2Request,
  plan: RiskGateV2ActivationPlan,
) {
  if (profile.action_type !== request.action_context.action_type) {
    throw new Error("Risk Gate v2 action profile does not match request action type");
  }

  for (const module of plan.active_modules) {
    const weight = profile.module_weights[module];
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
      throw new Error(`Risk Gate v2 action profile is missing a positive weight for ${module}`);
    }
  }
}

function worstCoverage(states: RiskGateV2ModuleStateInput[]) {
  let result: RiskGateV2CoverageState = "FULL";

  for (const state of states) {
    if (COVERAGE_RANK[state.coverage] < COVERAGE_RANK[result]) {
      result = state.coverage;
    }
  }

  return result;
}

function directionFromDelta(delta: number | null): "escalating" | "cooling" | "steady" {
  if (delta === null || delta === 0) return "steady";
  return delta > 0 ? "escalating" : "cooling";
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }

  return value;
}

async function sha256Hex(value: unknown) {
  const bytes = new TextEncoder().encode(
    JSON.stringify(canonicalize(value)),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function baseDecisionForScore(
  score: number,
  policy: RiskGateV2ResolvedPolicy,
  reasons: Set<RiskGateV2ReasonCode>,
): RiskGateDecision {
  if (score <= policy.continue_max_score) {
    reasons.add("risk_score_continue");
    return "CONTINUE";
  }

  if (score <= policy.reduce_limit_max_score) {
    reasons.add("risk_score_reduce_limit");
    return "REDUCE_LIMIT";
  }

  if (score <= policy.require_approval_max_score) {
    reasons.add("risk_score_require_approval");
    return "REQUIRE_APPROVAL";
  }

  reasons.add("risk_score_pause");
  return "PAUSE";
}

export async function evaluateRiskGateV2(
  input: RiskGateV2EvaluationInput,
  now = new Date(),
): Promise<RiskGateV2Response> {
  validatePolicy(input.policy);

  if (
    input.request.policy.policy_id !== input.policy.policy_id ||
    input.request.policy.policy_version !== input.policy.policy_version
  ) {
    throw new Error("Risk Gate v2 resolved policy does not match request policy reference");
  }

  const plan = buildRiskGateV2ActivationPlan(input.request);
  validateProfile(input.action_profile, input.request, plan);

  const stateByModule = new Map<RiskGateV2Module, RiskGateV2ModuleStateInput>();

  for (const state of input.module_states) {
    validateModuleState(state);
    if (stateByModule.has(state.module)) {
      throw new Error(`Duplicate Risk Gate v2 module state for ${state.module}`);
    }
    stateByModule.set(state.module, state);
  }

  const configuredWeightTotal = plan.active_modules.reduce((sum, module) => {
    return sum + (input.action_profile.module_weights[module] ?? 0);
  }, 0);

  if (!Number.isFinite(configuredWeightTotal) || configuredWeightTotal <= 0) {
    throw new Error("Risk Gate v2 action profile has no usable active-module weight");
  }

  const evaluatedAt = now.toISOString();
  const missingModules: RiskGateV2Module[] = [];
  const expiredModules: RiskGateV2Module[] = [];
  const activeStates: RiskGateV2ModuleStateInput[] = [];

  for (const module of plan.active_modules) {
    const state = stateByModule.get(module);
    if (!state) {
      missingModules.push(module);
      continue;
    }

    const expiresAt = new Date(state.expires_at);
    if (now.getTime() >= expiresAt.getTime()) {
      expiredModules.push(module);
    }

    activeStates.push(state);
  }

  const hasUnavailableRequiredInput =
    missingModules.length > 0 || expiredModules.length > 0;

  const availableStates = activeStates.filter(
    (state) => !expiredModules.includes(state.module),
  );

  const aggregateCoverage: RiskGateV2CoverageState =
    hasUnavailableRequiredInput
      ? "INSUFFICIENT"
      : worstCoverage(activeStates);

  let weightedScore = 0;
  let weightedConfidence = 0;
  let weightedPrevious = 0;
  let hasCompletePrevious = !hasUnavailableRequiredInput;

  const moduleResults = activeStates.map((state) => {
    const weight = input.action_profile.module_weights[state.module] ?? 0;
    const normalizedWeight = weight / configuredWeightTotal;
    const expired = expiredModules.includes(state.module);
    const contribution = expired
      ? 0
      : round6(state.score * normalizedWeight);

    if (!expired) {
      weightedScore += state.score * normalizedWeight;
      weightedConfidence += state.confidence * normalizedWeight;
      if (state.previous_score === null) {
        hasCompletePrevious = false;
      } else {
        weightedPrevious += state.previous_score * normalizedWeight;
      }
    } else {
      hasCompletePrevious = false;
    }

    return {
      module: state.module,
      score: state.score,
      previous_score: state.previous_score,
      delta: state.delta,
      confidence: state.confidence,
      coverage: state.coverage,
      commercial_eligibility_status: state.commercial_eligibility_status,
      contribution,
      generated_at: state.generated_at,
      expires_at: state.expires_at,
      methodology_version: state.methodology_version,
    };
  });

  const actionScore = hasUnavailableRequiredInput
    ? null
    : round6(weightedScore);
  const actionConfidence = round6(clamp(weightedConfidence, 0, 1));
  const previousScore =
    actionScore !== null && hasCompletePrevious
      ? round6(weightedPrevious)
      : null;
  const actionDelta =
    actionScore !== null && previousScore !== null
      ? round6(actionScore - previousScore)
      : null;

  const reasons = new Set<RiskGateV2ReasonCode>();
  const thresholds: RiskGateV2ThresholdTrigger[] = [];

  let decision: RiskGateDecision;

  if (actionScore === null) {
    decision = "PAUSE";
    reasons.add("coverage_insufficient");

    if (missingModules.length > 0) {
      reasons.add("active_module_missing");
      thresholds.push({
        code: "active_module_missing",
        severity: "hard_stop",
        current_value: missingModules.join(","),
        threshold_value: "all active modules required",
      });
    }

    if (expiredModules.length > 0) {
      reasons.add("active_module_expired");
      thresholds.push({
        code: "active_module_expired",
        severity: "hard_stop",
        current_value: expiredModules.join(","),
        threshold_value: "fresh active modules required",
      });
    }
  } else {
    decision = baseDecisionForScore(actionScore, input.policy, reasons);
  }

  if (
    aggregateCoverage === "INSUFFICIENT" &&
    input.policy.pause_on_insufficient_coverage
  ) {
    decision = "PAUSE";
    reasons.add("coverage_insufficient");
  }

  if (
    decision === "CONTINUE" &&
    COVERAGE_RANK[aggregateCoverage] <
      COVERAGE_RANK[input.policy.minimum_coverage_for_auto_continue]
  ) {
    decision = strongerDecision(decision, "REQUIRE_APPROVAL");
    reasons.add("coverage_below_auto_continue_threshold");
    thresholds.push({
      code: "coverage_below_auto_continue_threshold",
      severity: "review",
      current_value: aggregateCoverage,
      threshold_value: input.policy.minimum_coverage_for_auto_continue,
    });
  }

  if (
    decision === "CONTINUE" &&
    actionConfidence < input.policy.minimum_confidence_for_auto_continue
  ) {
    decision = strongerDecision(decision, "REQUIRE_APPROVAL");
    reasons.add("confidence_below_auto_continue_threshold");
    thresholds.push({
      code: "confidence_below_auto_continue_threshold",
      severity: "review",
      current_value: actionConfidence,
      threshold_value: input.policy.minimum_confidence_for_auto_continue,
    });
  }

  const ineligibleModules = availableStates.filter(
    (state) => state.commercial_eligibility_status === "INELIGIBLE",
  );

  if (ineligibleModules.length > 0) {
    decision = "PAUSE";
    reasons.add("commercially_ineligible_module");
    thresholds.push({
      code: "commercially_ineligible_module",
      severity: "hard_stop",
      current_value: ineligibleModules.map((state) => state.module).join(","),
      threshold_value: "no commercially ineligible active module",
    });
  }

  if (
    input.policy.require_commercial_verification_for_continue &&
    decision === "CONTINUE" &&
    availableStates.some(
      (state) => state.commercial_eligibility_status !== "VERIFIED",
    )
  ) {
    decision = strongerDecision(decision, "REQUIRE_APPROVAL");
    reasons.add("commercial_verification_required");
    thresholds.push({
      code: "commercial_verification_required",
      severity: "review",
      current_value: "UNVERIFIED",
      threshold_value: "VERIFIED",
    });
  }

  if (
    typeof input.policy.max_positive_delta_for_auto_continue === "number" &&
    actionDelta !== null &&
    actionDelta > input.policy.max_positive_delta_for_auto_continue
  ) {
    decision = strongerDecision(decision, "REQUIRE_APPROVAL");
    reasons.add("positive_delta_requires_review");
    thresholds.push({
      code: "positive_delta_requires_review",
      severity: "review",
      current_value: actionDelta,
      threshold_value: input.policy.max_positive_delta_for_auto_continue,
    });
  }

  for (const state of availableStates) {
    const moduleThreshold = input.policy.hard_stop_module_scores?.[state.module];
    if (typeof moduleThreshold === "number" && state.score >= moduleThreshold) {
      decision = "PAUSE";
      reasons.add("hard_stop_module_triggered");
      thresholds.push({
        code: "hard_stop_module_triggered",
        severity: "hard_stop",
        module: state.module,
        current_value: state.score,
        threshold_value: moduleThreshold,
      });
    }

    for (const driver of state.drivers) {
      const driverThreshold =
        input.policy.hard_stop_driver_contributions?.[driver.driver];
      if (
        typeof driverThreshold === "number" &&
        driver.score_contribution >= driverThreshold
      ) {
        decision = "PAUSE";
        reasons.add("hard_stop_driver_triggered");
        thresholds.push({
          code: "hard_stop_driver_triggered",
          severity: "hard_stop",
          module: state.module,
          driver: driver.driver,
          current_value: driver.score_contribution,
          threshold_value: driverThreshold,
        });
      }
    }
  }

  const weightedDrivers: RiskGateV2DriverResult[] = availableStates.flatMap(
    (state) => {
      const normalizedWeight =
        (input.action_profile.module_weights[state.module] ?? 0) /
        configuredWeightTotal;

      return state.drivers.map((driver) => ({
        module: state.module,
        driver: driver.driver,
        score_contribution: round6(
          driver.score_contribution * normalizedWeight,
        ),
        delta_contribution:
          driver.delta_contribution === null
            ? null
            : round6(driver.delta_contribution * normalizedWeight),
        confidence: driver.confidence,
      }));
    },
  );

  const topDrivers = weightedDrivers
    .sort(
      (a, b) =>
        Math.abs(b.score_contribution) - Math.abs(a.score_contribution) ||
        a.module.localeCompare(b.module) ||
        a.driver.localeCompare(b.driver),
    )
    .slice(0, 10);

  const watchlist = plan.watch_modules.map((module) => ({
    module,
    reason:
      plan.activation_reasons[module]?.join("; ") ??
      "watch:default_long_tail_monitoring",
  }));

  const riskObjectIds = [
    ...new Set(availableStates.flatMap((state) => state.risk_object_ids)),
  ].sort();

  const calculationHash = await sha256Hex({
    engine_version: RISK_GATE_V2_ENGINE_VERSION,
    evaluated_at: evaluatedAt,
    request: input.request,
    policy: input.policy,
    action_profile: input.action_profile,
    activation_plan: plan,
    module_states: activeStates,
    alternatives: input.alternatives ?? [],
  });

  return {
    schema_version: RISK_GATE_V2_SCHEMA_VERSION,
    request_id: input.request.request_id,
    evaluated_at: evaluatedAt,
    decision,
    display_label: riskGateV2DisplayLabel(decision),
    recommended_action: semanticRiskGateAction(decision),
    execution_authorized: false,
    subject: input.request.primary_subject,
    reason_codes: [...reasons].sort(),
    action_risk: {
      score: actionScore,
      previous_score: previousScore,
      delta: actionDelta,
      confidence: actionConfidence,
      coverage: aggregateCoverage,
      direction: directionFromDelta(actionDelta),
    },
    active_modules: moduleResults,
    missing_modules: missingModules,
    top_drivers: topDrivers,
    thresholds_triggered: thresholds.sort((a, b) =>
      a.code.localeCompare(b.code),
    ),
    watchlist,
    alternatives: input.alternatives ?? [],
    integrity: {
      methodology_version: input.action_profile.methodology_version,
      calculation_hash: calculationHash,
      risk_object_ids: riskObjectIds,
    },
    policy: {
      policy_id: input.policy.policy_id,
      policy_version: input.policy.policy_version,
    },
  };
}
