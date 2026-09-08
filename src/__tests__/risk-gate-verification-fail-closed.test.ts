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
  type RiskVerificationStatus,
} from "../lib/risk-object-contract";

import type {
  RiskGateRequest,
} from "../lib/risk-gate-contract";

function objectWithStatus(
  status: RiskVerificationStatus,
): GeomacroRiskObject {
  return {
    schema_version:
      GRO_SCHEMA_VERSION,

    object_id:
      "gro_country_IRN_test",

    subject: {
      type: "country",
      id: "IRN",
      name: null,
    },

    risk: {
      score: 0,
      label: "CALM",
      previous_score: null,
      delta: null,
      direction: "unknown",
    },

    attribution: [],

    confidence: 0,

    evidence: [],

    evidence_coverage: null,

    evidence_summary: {
      event_count: 0,
      evidence_count: 0,
      independent_source_count: 0,
    },

    methodology_version:
      COUNTRY_RISK_METHOD_VERSION,

    generated_at:
      "2026-09-08T00:00:00.000Z",

    expires_at:
      "2026-09-08T03:00:00.000Z",

    issuer: "Geomacro",

    commercial_eligibility: {
      status: "UNVERIFIED",
      reason_codes: [],
    },

    verification: {
      status,
      reason_codes: [],
      last_verified_at: null,
    },

    integrity: {
      input_hash: "a".repeat(64),
      data_hash: "b".repeat(64),
      calculation_hash:
        "c".repeat(64),

      payload_hash:
        "d".repeat(64),

      canonicalization:
        "geomacro-canonical-json-v1",

      signature:
        "test-signature",

      signature_scheme:
        "Ed25519",

      signing_key_id:
        "test-key",
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

const request:
  RiskGateRequest = {
  request_id:
    "risk-gate-test",

  subject: {
    type: "country",
    id: "IRN",
  },

  policy: {
    policy_id:
      "permissive-test",

    policy_version:
      "1",

    continue_max_score:
      20,

    reduce_limit_max_score:
      40,

    require_approval_max_score:
      60,

    // Deliberately permissive:
    // verification must still fail closed.
    minimum_confidence_for_auto_continue:
      0,

    require_commercial_verification_for_continue:
      false,
  },
};

describe(
  "Risk Gate verification fail-closed behavior",
  () => {
    it(
      "does not CONTINUE an INCOMPLETE object",
      () => {
        const result =
          evaluateRiskGate(
            request,
            objectWithStatus(
              "INCOMPLETE",
            ),
            new Date(
              "2026-09-08T01:00:00.000Z",
            ),
          );

        expect(
          result.decision,
        ).toBe(
          "REQUIRE_APPROVAL",
        );

        expect(
          result.reason_codes,
        ).toContain(
          "risk_object_incomplete",
        );
      },
    );

    it(
      "does not CONTINUE a STALE object",
      () => {
        const result =
          evaluateRiskGate(
            request,
            objectWithStatus(
              "STALE",
            ),
            new Date(
              "2026-09-08T01:00:00.000Z",
            ),
          );

        expect(
          result.decision,
        ).toBe(
          "REQUIRE_APPROVAL",
        );

        expect(
          result.reason_codes,
        ).toContain(
          "risk_object_stale",
        );
      },
    );

    it(
      "PAUSEs an explicitly EXPIRED object",
      () => {
        const result =
          evaluateRiskGate(
            request,
            objectWithStatus(
              "EXPIRED",
            ),
            new Date(
              "2026-09-08T01:00:00.000Z",
            ),
          );

        expect(
          result.decision,
        ).toBe(
          "PAUSE",
        );

        expect(
          result.reason_codes,
        ).toContain(
          "risk_object_expired",
        );
      },
    );
  },
);
