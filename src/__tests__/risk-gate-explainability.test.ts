import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateRiskGate,
} from "../lib/risk-gate-engine";

import {
  COUNTRY_RISK_METHOD_VERSION,
  GRO_SCHEMA_VERSION,
  type GeomacroRiskObject,
} from "../lib/risk-object-contract";

import type {
  RiskGateRequest,
} from "../lib/risk-gate-contract";

function fixture(): GeomacroRiskObject {
  return {
    schema_version: GRO_SCHEMA_VERSION,
    object_id: "gro_country_USA_counterfactual",
    subject: {
      type: "country",
      id: "USA",
      name: null,
    },
    risk: {
      score: 78,
      label: "ELEVATED",
      previous_score: 60,
      delta: 18,
      direction: "escalating",
    },
    attribution: [
      {
        driver: "conflict",
        score_contribution: 35,
        delta_contribution: 12,
        event_count: 2,
        weight: 1,
      },
    ],
    confidence: 0.65,
    evidence: [],
    evidence_coverage: null,
    evidence_summary: {
      event_count: 2,
      evidence_count: 3,
      independent_source_count: 2,
    },
    methodology_version:
      COUNTRY_RISK_METHOD_VERSION,
    generated_at:
      "2026-09-09T12:00:00.000Z",
    expires_at:
      "2026-09-09T15:00:00.000Z",
    issuer: "Geomacro",
    commercial_eligibility: {
      status: "VERIFIED",
      reason_codes: [],
    },
    verification: {
      status: "VERIFIED",
      reason_codes: [],
      last_verified_at:
        "2026-09-09T12:00:00.000Z",
    },
    integrity: {
      input_hash: "a".repeat(64),
      data_hash: "b".repeat(64),
      calculation_hash: "c".repeat(64),
      payload_hash: "d".repeat(64),
      canonicalization:
        "geomacro-canonical-json-v1",
      signature: "fixture",
      signature_scheme: "Ed25519",
      signing_key_id: "fixture-key",
    },
    provenance: {
      structure_versions: [],
      scoring_versions: [],
      relevance_versions: [],
      country_versions: [],
      story_versions: [],
    },
  };
}

const request: RiskGateRequest = {
  request_id: "rg-counterfactual-1",
  subject: {
    type: "country",
    id: "USA",
  },
  action_context: {
    action_type: "treasury_transfer",
    amount: 500000,
    currency: "USD",
  },
  policy: {
    policy_id: "treasury-v1",
    policy_version: "1.0.0",
    continue_max_score: 30,
    reduce_limit_max_score: 50,
    require_approval_max_score: 70,
    minimum_confidence_for_auto_continue: 0.8,
    require_commercial_verification_for_continue: true,
    max_positive_delta_for_auto_continue: 10,
    hard_stop_driver_contributions: {
      conflict: 30,
    },
  },
};

describe(
  "Risk Gate institutional explainability",
  () => {
    it(
      "maps internal PAUSE to BLOCK and quantifies the next policy boundary",
      () => {
        const result =
          evaluateRiskGate(
            request,
            fixture(),
            new Date(
              "2026-09-09T13:00:00.000Z",
            ),
          );

        expect(result.decision).toBe("PAUSE");
        expect(
          result.recommended_action,
        ).toBe("BLOCK");
        expect(
          result.execution_authorized,
        ).toBe(false);
        expect(
          result.counterfactual
            .next_less_restrictive_action,
        ).toBe(
          "REQUIRE_HUMAN_APPROVAL",
        );

        expect(
          result.counterfactual.blockers,
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "score",
              current_value: 78,
              required_value: 70,
              delta_required: -8,
            }),
            expect.objectContaining({
              type: "hard_stop_driver",
              driver: "conflict",
              current_value: 35,
              required_value: 30,
            }),
          ]),
        );
      },
    );

    it(
      "keeps ALLOW non-authorizing and has no lower counterfactual target",
      () => {
        const gro = fixture();
        gro.risk.score = 20;
        gro.risk.delta = 0;
        gro.confidence = 0.95;
        gro.attribution = [];

        const result =
          evaluateRiskGate(
            request,
            gro,
            new Date(
              "2026-09-09T13:00:00.000Z",
            ),
          );

        expect(result.decision).toBe("CONTINUE");
        expect(
          result.recommended_action,
        ).toBe("ALLOW");
        expect(
          result.counterfactual
            .next_less_restrictive_action,
        ).toBe(null);
        expect(
          result.execution_authorized,
        ).toBe(false);
      },
    );
  },
);