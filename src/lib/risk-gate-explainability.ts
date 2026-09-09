import type {
  GeomacroRiskObject,
  RiskDriver,
} from "./risk-object-contract";

import type {
  RiskGateDecision,
  RiskGatePolicy,
} from "./risk-gate-contract";

export type RiskGateRecommendedAction =
  | "ALLOW"
  | "REDUCE_EXPOSURE"
  | "REQUIRE_HUMAN_APPROVAL"
  | "BLOCK";

export type RiskGateCounterfactualBlocker = {
  type:
    | "score"
    | "confidence"
    | "commercial_verification"
    | "positive_delta"
    | "hard_stop_driver"
    | "freshness"
    | "verification";
  reason_code: string;
  current_value:
    | number
    | string
    | null;
  required_value:
    | number
    | string
    | null;
  delta_required:
    number | null;
  driver?: RiskDriver;
};

export type RiskGateCounterfactual = {
  version: "risk-gate-counterfactual-v1.0.0";
  current_action:
    RiskGateRecommendedAction;
  next_less_restrictive_action:
    RiskGateRecommendedAction | null;
  blockers:
    RiskGateCounterfactualBlocker[];
  note:
    "Counterfactual context only; it never authorizes execution.";
};

export function semanticRiskGateAction(
  decision: RiskGateDecision,
): RiskGateRecommendedAction {
  if (decision === "CONTINUE") {
    return "ALLOW";
  }
  if (decision === "REDUCE_LIMIT") {
    return "REDUCE_EXPOSURE";
  }
  if (decision === "REQUIRE_APPROVAL") {
    return "REQUIRE_HUMAN_APPROVAL";
  }
  return "BLOCK";
}

function nextLessRestrictive(
  action: RiskGateRecommendedAction,
): RiskGateRecommendedAction | null {
  if (action === "BLOCK") {
    return "REQUIRE_HUMAN_APPROVAL";
  }
  if (
    action ===
    "REQUIRE_HUMAN_APPROVAL"
  ) {
    return "REDUCE_EXPOSURE";
  }
  if (action === "REDUCE_EXPOSURE") {
    return "ALLOW";
  }
  return null;
}

function scoreTarget(
  action: RiskGateRecommendedAction,
  policy: RiskGatePolicy,
): number | null {
  if (action === "BLOCK") {
    return policy
      .require_approval_max_score;
  }
  if (
    action ===
    "REQUIRE_HUMAN_APPROVAL"
  ) {
    return policy
      .reduce_limit_max_score;
  }
  if (action === "REDUCE_EXPOSURE") {
    return policy.continue_max_score;
  }
  return null;
}

export function buildRiskGateCounterfactual(
  decision: RiskGateDecision,
  reasonCodes: string[],
  policy: RiskGatePolicy,
  gro: GeomacroRiskObject,
): RiskGateCounterfactual {
  const currentAction =
    semanticRiskGateAction(decision);
  const targetAction =
    nextLessRestrictive(currentAction);
  const blockers:
    RiskGateCounterfactualBlocker[] = [];

  const targetScore =
    scoreTarget(currentAction, policy);
  if (
    targetScore !== null &&
    gro.risk.score > targetScore
  ) {
    blockers.push({
      type: "score",
      reason_code:
        "score_must_fall_below_next_policy_threshold",
      current_value: gro.risk.score,
      required_value: targetScore,
      delta_required:
        targetScore - gro.risk.score,
    });
  }

  if (
    reasonCodes.includes(
      "confidence_below_auto_continue_threshold",
    )
  ) {
    blockers.push({
      type: "confidence",
      reason_code:
        "confidence_must_meet_auto_continue_threshold",
      current_value: gro.confidence,
      required_value:
        policy
          .minimum_confidence_for_auto_continue,
      delta_required:
        policy
          .minimum_confidence_for_auto_continue -
        gro.confidence,
    });
  }

  if (
    reasonCodes.includes(
      "commercial_verification_required",
    )
  ) {
    blockers.push({
      type: "commercial_verification",
      reason_code:
        "commercial_verification_required",
      current_value:
        gro.commercial_eligibility.status,
      required_value: "VERIFIED",
      delta_required: null,
    });
  }

  if (
    reasonCodes.includes(
      "positive_delta_requires_review",
    )
  ) {
    blockers.push({
      type: "positive_delta",
      reason_code:
        "positive_delta_must_not_exceed_policy_limit",
      current_value: gro.risk.delta,
      required_value:
        policy
          .max_positive_delta_for_auto_continue ??
        null,
      delta_required:
        gro.risk.delta !== null &&
        typeof policy
          .max_positive_delta_for_auto_continue ===
          "number"
          ? policy
              .max_positive_delta_for_auto_continue -
            gro.risk.delta
          : null,
    });
  }

  if (
    reasonCodes.includes(
      "hard_stop_driver_triggered",
    )
  ) {
    const hardStops =
      policy
        .hard_stop_driver_contributions ??
      {};

    for (const item of gro.attribution) {
      const threshold =
        hardStops[item.driver];
      if (
        typeof threshold === "number" &&
        item.score_contribution >= threshold
      ) {
        blockers.push({
          type: "hard_stop_driver",
          reason_code:
            "driver_contribution_must_fall_below_hard_stop_threshold",
          current_value:
            item.score_contribution,
          required_value: threshold,
          delta_required:
            threshold -
            item.score_contribution,
          driver: item.driver,
        });
      }
    }
  }

  if (
    reasonCodes.includes(
      "risk_object_stale",
    ) ||
    reasonCodes.includes(
      "risk_object_expired",
    )
  ) {
    blockers.push({
      type: "freshness",
      reason_code:
        "fresh_risk_object_required",
      current_value:
        gro.verification.status,
      required_value: "VERIFIED",
      delta_required: null,
    });
  }

  if (
    reasonCodes.includes(
      "risk_object_incomplete",
    ) ||
    reasonCodes.includes(
      "risk_object_unverifiable",
    )
  ) {
    blockers.push({
      type: "verification",
      reason_code:
        "complete_verifiable_risk_object_required",
      current_value:
        gro.verification.status,
      required_value: "VERIFIED",
      delta_required: null,
    });
  }

  return {
    version:
      "risk-gate-counterfactual-v1.0.0",
    current_action: currentAction,
    next_less_restrictive_action:
      targetAction,
    blockers,
    note:
      "Counterfactual context only; it never authorizes execution.",
  };
}
