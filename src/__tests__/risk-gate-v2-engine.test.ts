import { describe, expect, it } from "vitest";

import {
  evaluateRiskGateV2,
  type RiskGateV2ActionProfile,
  type RiskGateV2EvaluationInput,
  type RiskGateV2ModuleStateInput,
  type RiskGateV2ResolvedPolicy,
} from "../lib/risk-gate-v2-engine";
import {
  RISK_GATE_V2_REQUEST_SCHEMA_VERSION,
  type RiskGateV2Request,
} from "../lib/risk-gate-v2-contract";
import type { RiskGateV2Module } from "../lib/risk-gate-v2-taxonomy";

const NOW = new Date("2026-09-14T06:30:00.000Z");

const request: RiskGateV2Request = {
  schema_version: RISK_GATE_V2_REQUEST_SCHEMA_VERSION,
  request_id: "rgv2-engine-test",
  primary_subject: {
    type: "currency_pair",
    id: "USD/INR",
  },
  exposures: [
    {
      type: "currency",
      id: "USD",
      role: "settlement",
    },
  ],
  action_context: {
    action_type: "fx_conversion",
    amount: 100000,
    currency: "USD",
    time_horizon: "immediate",
  },
  policy: {
    policy_id: "fx-standard",
    policy_version: "1.0.0",
  },
};

const activeModules: RiskGateV2Module[] = [
  "geopolitical_security",
  "geoeconomic_trade",
  "macro_monetary",
  "currency_capital_mobility",
  "banking_financial_system",
];

const profile: RiskGateV2ActionProfile = {
  profile_id: "fx-standard-profile",
  profile_version: "1.0.0",
  action_type: "fx_conversion",
  methodology_version: "risk-gate-v2-methodology-test-1",
  module_weights: Object.fromEntries(
    activeModules.map((module) => [module, 1]),
  ),
};

const policy: RiskGateV2ResolvedPolicy = {
  policy_id: "fx-standard",
  policy_version: "1.0.0",
  continue_max_score: 35,
  reduce_limit_max_score: 55,
  require_approval_max_score: 75,
  minimum_confidence_for_auto_continue: 0.75,
  minimum_coverage_for_auto_continue: "FULL",
  require_commercial_verification_for_continue: true,
  pause_on_insufficient_coverage: true,
  max_positive_delta_for_auto_continue: 10,
};

function moduleState(
  module: RiskGateV2Module,
  patch: Partial<RiskGateV2ModuleStateInput> = {},
): RiskGateV2ModuleStateInput {
  return {
    module_state_id: `state-${module}`,
    module,
    score: 20,
    previous_score: 18,
    delta: 2,
    confidence: 0.9,
    coverage: "FULL",
    commercial_eligibility_status: "VERIFIED",
    generated_at: "2026-09-14T05:00:00.000Z",
    expires_at: "2026-09-14T08:00:00.000Z",
    methodology_version: "module-test-1",
    risk_object_ids: [`gro-${module}`],
    drivers:
      module === "geoeconomic_trade"
        ? [
            {
              driver: "sanctions",
              score_contribution: 8,
              delta_contribution: 1,
              confidence: 0.9,
            },
          ]
        : [],
    ...patch,
  };
}

function input(
  patch: Partial<RiskGateV2EvaluationInput> = {},
): RiskGateV2EvaluationInput {
  return {
    request,
    policy,
    action_profile: profile,
    module_states: activeModules.map((module) => moduleState(module)),
    ...patch,
  };
}

describe("Risk Gate v2 aggregation engine", () => {
  it("returns CLEAR only when the configured active context is complete", async () => {
    const result = await evaluateRiskGateV2(input(), NOW);

    expect(result.decision).toBe("CONTINUE");
    expect(result.display_label).toBe("CLEAR");
    expect(result.action_risk.score).toBe(20);
    expect(result.action_risk.previous_score).toBe(18);
    expect(result.action_risk.delta).toBe(2);
    expect(result.action_risk.confidence).toBe(0.9);
    expect(result.action_risk.coverage).toBe("FULL");
    expect(result.missing_modules).toEqual([]);
    expect(result.execution_authorized).toBe(false);
    expect(result.integrity.calculation_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.integrity.risk_object_ids).toHaveLength(activeModules.length);
  });

  it("fails closed and suppresses aggregate score when an active module is missing", async () => {
    const states = activeModules
      .filter((module) => module !== "geoeconomic_trade")
      .map((module) => moduleState(module));

    const result = await evaluateRiskGateV2(
      input({ module_states: states }),
      NOW,
    );

    expect(result.decision).toBe("PAUSE");
    expect(result.display_label).toBe("HOLD");
    expect(result.action_risk.score).toBeNull();
    expect(result.action_risk.coverage).toBe("INSUFFICIENT");
    expect(result.missing_modules).toContain("geoeconomic_trade");
    expect(result.reason_codes).toEqual(
      expect.arrayContaining([
        "active_module_missing",
        "coverage_insufficient",
      ]),
    );
  });

  it("fails closed when a required module is expired", async () => {
    const states = activeModules.map((module) =>
      moduleState(
        module,
        module === "macro_monetary"
          ? { expires_at: "2026-09-14T06:00:00.000Z" }
          : {},
      ),
    );

    const result = await evaluateRiskGateV2(
      input({ module_states: states }),
      NOW,
    );

    expect(result.decision).toBe("PAUSE");
    expect(result.action_risk.score).toBeNull();
    expect(result.reason_codes).toContain("active_module_expired");
  });

  it("requires review when a low score does not meet the configured coverage floor", async () => {
    const states = activeModules.map((module) =>
      moduleState(
        module,
        module === "banking_financial_system"
          ? { coverage: "PARTIAL" }
          : {},
      ),
    );

    const result = await evaluateRiskGateV2(
      input({ module_states: states }),
      NOW,
    );

    expect(result.action_risk.score).toBe(20);
    expect(result.action_risk.coverage).toBe("PARTIAL");
    expect(result.decision).toBe("REQUIRE_APPROVAL");
    expect(result.display_label).toBe("REVIEW");
    expect(result.reason_codes).toContain(
      "coverage_below_auto_continue_threshold",
    );
  });

  it("holds when a configured module hard-stop threshold is reached", async () => {
    const result = await evaluateRiskGateV2(
      input({
        policy: {
          ...policy,
          hard_stop_module_scores: {
            geopolitical_security: 70,
          },
        },
        module_states: activeModules.map((module) =>
          moduleState(
            module,
            module === "geopolitical_security"
              ? { score: 80, previous_score: 60, delta: 20 }
              : {},
          ),
        ),
      }),
      NOW,
    );

    expect(result.decision).toBe("PAUSE");
    expect(result.reason_codes).toContain("hard_stop_module_triggered");
    expect(result.thresholds_triggered).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: "geopolitical_security",
          severity: "hard_stop",
        }),
      ]),
    );
  });

  it("holds if an active commercial input is explicitly ineligible", async () => {
    const result = await evaluateRiskGateV2(
      input({
        module_states: activeModules.map((module) =>
          moduleState(
            module,
            module === "geoeconomic_trade"
              ? { commercial_eligibility_status: "INELIGIBLE" }
              : {},
          ),
        ),
      }),
      NOW,
    );

    expect(result.decision).toBe("PAUSE");
    expect(result.reason_codes).toContain("commercially_ineligible_module");
  });

  it("produces the same calculation hash for the same inputs and evaluation time", async () => {
    const first = await evaluateRiskGateV2(input(), NOW);
    const second = await evaluateRiskGateV2(input(), NOW);

    expect(first.integrity.calculation_hash).toBe(
      second.integrity.calculation_hash,
    );
  });
});
