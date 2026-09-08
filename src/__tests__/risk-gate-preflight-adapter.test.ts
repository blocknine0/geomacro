import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  RISK_GATE_SCHEMA_VERSION,
  type RiskGateDecision,
  type RiskGateResponse,
} from "../lib/risk-gate-contract";

import {
  RiskGatePreflightBlockedError,
  withRiskGatePreflight,
} from "../lib/risk-gate-preflight";

function responseFor(
  decision:
    RiskGateDecision,
): RiskGateResponse {
  const reasonByDecision = {
    CONTINUE:
      "risk_score_continue",

    REDUCE_LIMIT:
      "risk_score_reduce_limit",

    REQUIRE_APPROVAL:
      "risk_score_require_approval",

    PAUSE:
      "risk_score_pause",
  } as const;

  return {
    schema_version:
      RISK_GATE_SCHEMA_VERSION,

    request_id:
      `preflight-${decision}`,

    decision,

    reason_codes: [
      reasonByDecision[
        decision
      ],
    ],

    subject: {
      type: "country",
      id: "USA",
      name: null,
    },

    risk: {
      object_id:
        "gro_country_USA_test",

      score: 25,

      label:
        "WATCH",

      previous_score:
        null,

      delta:
        null,

      confidence:
        0.9,

      verification_status:
        "INCOMPLETE",

      commercial_eligibility_status:
        "UNVERIFIED",

      generated_at:
        "2026-09-08T00:00:00.000Z",

      expires_at:
        "2026-09-08T03:00:00.000Z",

      methodology_version:
        "country-risk-v0.1.0-pilot",
    },

    top_drivers: [],

    policy: {
      policy_id:
        "adapter-test",

      policy_version:
        "1.0",
    },

    execution_authorized:
      false,
  } as RiskGateResponse;
}

describe(
  "Risk Gate agent/wallet preflight adapter",
  () => {
    it(
      "reaches the caller executor only after CONTINUE",
      async () => {
        const evaluate =
          vi.fn(
            async () => ({
              response:
                responseFor(
                  "CONTINUE",
                ),

              context: {
                source:
                  "test",
              },
            }),
          );

        const execute =
          vi.fn(
            async () =>
              "caller-owned-execution",
          );

        const result =
          await withRiskGatePreflight({
            evaluate,
            execute,
          });

        expect(
          evaluate,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          execute,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          result
            .execution_result,
        ).toBe(
          "caller-owned-execution",
        );

        expect(
          result
            .evaluated
            .response
            .execution_authorized,
        ).toBe(false);
      },
    );

    it.each([
      "REDUCE_LIMIT",
      "REQUIRE_APPROVAL",
      "PAUSE",
    ] as RiskGateDecision[])(
      "blocks executor for %s",
      async (
        decision,
      ) => {
        const execute =
          vi.fn(
            async () =>
              "MUST_NOT_RUN",
          );

        await expect(
          withRiskGatePreflight({
            evaluate:
              async () => ({
                response:
                  responseFor(
                    decision,
                  ),
              }),

            execute,
          }),
        ).rejects.toBeInstanceOf(
          RiskGatePreflightBlockedError,
        );

        expect(
          execute,
        ).not
          .toHaveBeenCalled();
      },
    );

    it(
      "fails closed when evaluation itself fails",
      async () => {
        const execute =
          vi.fn(
            async () =>
              "MUST_NOT_RUN",
          );

        await expect(
          withRiskGatePreflight({
            evaluate:
              async () => {
                throw new Error(
                  "risk service unavailable",
                );
              },

            execute,
          }),
        ).rejects.toThrow(
          "risk service unavailable",
        );

        expect(
          execute,
        ).not
          .toHaveBeenCalled();
      },
    );

    it(
      "fails closed if execution_authorized boundary is tampered",
      async () => {
        const tampered = {
          ...responseFor(
            "CONTINUE",
          ),

          execution_authorized:
            true,
        } as unknown as
          RiskGateResponse;

        const execute =
          vi.fn(
            async () =>
              "MUST_NOT_RUN",
          );

        await expect(
          withRiskGatePreflight({
            evaluate:
              async () => ({
                response:
                  tampered,
              }),

            execute,
          }),
        ).rejects.toThrow(
          "execution_authorized boundary violated",
        );

        expect(
          execute,
        ).not
          .toHaveBeenCalled();
      },
    );
  },
);
