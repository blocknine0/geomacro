import {
  RISK_GATE_SCHEMA_VERSION,
  type RiskGateDecision,
  type RiskGatePolicy,
  type RiskGateReasonCode,
  type RiskGateRequest,
  type RiskGateResponse,
} from "./risk-gate-contract";

import type {
  GeomacroRiskObject,
} from "./risk-object-contract";


function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.min(
    max,
    Math.max(min, value),
  );
}


function validatePolicy(
  policy: RiskGatePolicy,
) {
  const thresholds = [
    policy.continue_max_score,
    policy.reduce_limit_max_score,
    policy.require_approval_max_score,
  ];

  for (
    const value of thresholds
  ) {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      throw new Error(
        "Risk Gate score thresholds must be within 0..100",
      );
    }
  }

  if (
    !(
      policy.continue_max_score <
        policy.reduce_limit_max_score &&
      policy.reduce_limit_max_score <
        policy.require_approval_max_score
    )
  ) {
    throw new Error(
      "Risk Gate thresholds must be strictly increasing",
    );
  }

  if (
    !Number.isFinite(
      policy
        .minimum_confidence_for_auto_continue,
    ) ||
    policy
      .minimum_confidence_for_auto_continue <
      0 ||
    policy
      .minimum_confidence_for_auto_continue >
      1
  ) {
    throw new Error(
      "minimum_confidence_for_auto_continue must be within 0..1",
    );
  }
}


function strongerDecision(
  left: RiskGateDecision,
  right: RiskGateDecision,
): RiskGateDecision {
  const rank:
    Record<
      RiskGateDecision,
      number
    > = {
      CONTINUE: 0,
      REDUCE_LIMIT: 1,
      REQUIRE_APPROVAL: 2,
      PAUSE: 3,
    };

  return (
    rank[right] >
      rank[left]
      ? right
      : left
  );
}


export function
evaluateRiskGate(
  request: RiskGateRequest,
  gro: GeomacroRiskObject,
  now = new Date(),
): RiskGateResponse {
  validatePolicy(
    request.policy,
  );

  if (
    request.subject.type !==
      gro.subject.type ||
    request.subject.id !==
      gro.subject.id
  ) {
    throw new Error(
      "Risk Gate subject does not match GRO subject",
    );
  }

  const reasons =
    new Set<RiskGateReasonCode>();

  let decision:
    RiskGateDecision;

  const score =
    clamp(
      gro.risk.score,
      0,
      100,
    );

  if (
    score <=
    request.policy
      .continue_max_score
  ) {
    decision =
      "CONTINUE";

    reasons.add(
      "risk_score_continue",
    );
  } else if (
    score <=
    request.policy
      .reduce_limit_max_score
  ) {
    decision =
      "REDUCE_LIMIT";

    reasons.add(
      "risk_score_reduce_limit",
    );
  } else if (
    score <=
    request.policy
      .require_approval_max_score
  ) {
    decision =
      "REQUIRE_APPROVAL";

    reasons.add(
      "risk_score_require_approval",
    );
  } else {
    decision =
      "PAUSE";

    reasons.add(
      "risk_score_pause",
    );
  }

  if (
    decision ===
      "CONTINUE" &&
    gro.confidence <
      request.policy
        .minimum_confidence_for_auto_continue
  ) {
    decision =
      "REQUIRE_APPROVAL";

    reasons.add(
      "confidence_below_auto_continue_threshold",
    );
  }

  if (
    decision ===
      "CONTINUE" &&
    request.policy
      .require_commercial_verification_for_continue &&
    gro
      .commercial_eligibility
      .status !==
      "VERIFIED"
  ) {
    decision =
      "REQUIRE_APPROVAL";

    reasons.add(
      "commercial_verification_required",
    );
  }

  const maxDelta =
    request.policy
      .max_positive_delta_for_auto_continue;

  if (
    typeof maxDelta ===
      "number" &&
    gro.risk.delta !==
      null &&
    gro.risk.delta >
      maxDelta
  ) {
    decision =
      strongerDecision(
        decision,
        "REQUIRE_APPROVAL",
      );

    reasons.add(
      "positive_delta_requires_review",
    );
  }

  const hardStops =
    request.policy
      .hard_stop_driver_contributions ??
    {};

  for (
    const attribution of
      gro.attribution
  ) {
    const threshold =
      hardStops[
        attribution.driver
      ];

    if (
      typeof threshold ===
        "number" &&
      attribution
        .score_contribution >=
        threshold
    ) {
      decision =
        "PAUSE";

      reasons.add(
        "hard_stop_driver_triggered",
      );

      break;
    }
  }

  const expiresAt =
    new Date(
      gro.expires_at,
    );

  if (
    !Number.isNaN(
      expiresAt.getTime(),
    ) &&
    now.getTime() >=
      expiresAt.getTime()
  ) {
    decision =
      "PAUSE";

    reasons.add(
      "risk_object_expired",
    );
  }

  if (
    gro.verification.status ===
      "UNVERIFIABLE"
  ) {
    decision =
      "PAUSE";

    reasons.add(
      "risk_object_unverifiable",
    );
  }

  const topDrivers =
    [...gro.attribution]
      .sort(
        (a, b) =>
          Math.abs(
            b.score_contribution,
          ) -
          Math.abs(
            a.score_contribution,
          ),
      )
      .slice(
        0,
        5,
      )
      .map(
        (item) => ({
          driver:
            item.driver,

          score_contribution:
            item.score_contribution,

          delta_contribution:
            item.delta_contribution,
        }),
      );

  return {
    schema_version:
      RISK_GATE_SCHEMA_VERSION,

    request_id:
      request.request_id,

    decision,

    reason_codes: [
      ...reasons,
    ].sort(),

    subject:
      gro.subject,

    risk: {
      object_id:
        gro.object_id,

      score:
        gro.risk.score,

      label:
        gro.risk.label,

      previous_score:
        gro.risk
          .previous_score,

      delta:
        gro.risk.delta,

      confidence:
        gro.confidence,

      verification_status:
        gro.verification
          .status,

      commercial_eligibility_status:
        gro
          .commercial_eligibility
          .status,

      generated_at:
        gro.generated_at,

      expires_at:
        gro.expires_at,

      methodology_version:
        gro.methodology_version,
    },

    top_drivers:
      topDrivers,

    policy: {
      policy_id:
        request.policy
          .policy_id,

      policy_version:
        request.policy
          .policy_version,
    },

    execution_authorized:
      false,
  };
}
