import {
  describe,
  expect,
  it,
} from "vitest";

import {
  RISK_GATE_MAX_EVALUATION_CLOCK_SKEW_MS,
  RISK_GATE_MAX_REQUEST_BODY_BYTES,
  RiskGateApiError,
  parseExternalRiskGateBody,
  readExternalRiskGateJsonBody,
} from "../lib/risk-gate-api.server";


const NOW =
  new Date(
    "2026-09-08T06:00:00.000Z",
  );


function validPolicy() {
  return {
    policy_id:
      "pilot-policy",

    policy_version:
      "1.0.0",

    continue_max_score:
      35,

    reduce_limit_max_score:
      55,

    require_approval_max_score:
      75,

    minimum_confidence_for_auto_continue:
      0.8,

    require_commercial_verification_for_continue:
      true,

    max_positive_delta_for_auto_continue:
      10,

    hard_stop_driver_contributions: {
      sanctions: 20,
    },
  };
}


function validCountryBody() {
  return {
    request_id:
      "req_country_001",

    country_iso3:
      "usa",

    evaluated_at:
      NOW.toISOString(),

    policy:
      validPolicy(),
  };
}


function captureApiError(
  action: () => unknown,
) {
  try {
    action();
  } catch (error) {
    expect(
      error,
    ).toBeInstanceOf(
      RiskGateApiError,
    );

    return error as
      RiskGateApiError;
  }

  throw new Error(
    "Expected RiskGateApiError",
  );
}


describe(
  "Risk Gate external live-preflight boundary",
  () => {
    it(
      "accepts a near-current country evaluation and normalizes ISO3/time",
      () => {
        const parsed =
          parseExternalRiskGateBody(
            validCountryBody(),
            NOW,
          );

        expect(
          parsed.subject_type,
        ).toBe(
          "country",
        );

        if (
          parsed.subject_type !==
          "country"
        ) {
          throw new Error(
            "Expected country request",
          );
        }

        expect(
          parsed.country_iso3,
        ).toBe(
          "USA",
        );

        expect(
          parsed.evaluated_at,
        ).toBe(
          NOW.toISOString(),
        );
      },
    );

    it(
      "rejects historical evaluation-time selection for a live preflight",
      () => {
        const body =
          validCountryBody();

        body.evaluated_at =
          new Date(
            NOW.getTime() -
              RISK_GATE_MAX_EVALUATION_CLOCK_SKEW_MS -
              1,
          ).toISOString();

        const error =
          captureApiError(
            () =>
              parseExternalRiskGateBody(
                body,
                NOW,
              ),
          );

        expect(
          error.status,
        ).toBe(400);

        expect(
          error.code,
        ).toBe(
          "EVALUATION_TIME_OUT_OF_RANGE",
        );
      },
    );

    it(
      "rejects future evaluation-time selection outside normal clock skew",
      () => {
        const body =
          validCountryBody();

        body.evaluated_at =
          new Date(
            NOW.getTime() +
              RISK_GATE_MAX_EVALUATION_CLOCK_SKEW_MS +
              1,
          ).toISOString();

        const error =
          captureApiError(
            () =>
              parseExternalRiskGateBody(
                body,
                NOW,
              ),
          );

        expect(
          error.code,
        ).toBe(
          "EVALUATION_TIME_OUT_OF_RANGE",
        );
      },
    );

    it(
      "rejects malformed policy thresholds as a client error rather than deferring to a 500",
      () => {
        const body =
          validCountryBody();

        body.policy = {
          ...validPolicy(),
          continue_max_score:
            80,
          reduce_limit_max_score:
            50,
        };

        const error =
          captureApiError(
            () =>
              parseExternalRiskGateBody(
                body,
                NOW,
              ),
          );

        expect(
          error.status,
        ).toBe(400);

        expect(
          error.code,
        ).toBe(
          "INVALID_REQUEST",
        );
      },
    );

    it(
      "requires the commercial-verification policy switch to be a real boolean",
      () => {
        const body =
          validCountryBody() as
            Record<string, unknown>;

        body.policy = {
          ...validPolicy(),
          require_commercial_verification_for_continue:
            "false",
        };

        const error =
          captureApiError(
            () =>
              parseExternalRiskGateBody(
                body,
                NOW,
              ),
          );

        expect(
          error.code,
        ).toBe(
          "INVALID_REQUEST",
        );
      },
    );

    it(
      "rejects unknown hard-stop driver names instead of silently ignoring a policy typo",
      () => {
        const body =
          validCountryBody() as
            Record<string, unknown>;

        body.policy = {
          ...validPolicy(),
          hard_stop_driver_contributions: {
            sanction_typo: 10,
          },
        };

        const error =
          captureApiError(
            () =>
              parseExternalRiskGateBody(
                body,
                NOW,
              ),
          );

        expect(
          error.code,
        ).toBe(
          "INVALID_REQUEST",
        );
      },
    );

    it(
      "preserves directional corridor identity",
      () => {
        const parsed =
          parseExternalRiskGateBody(
            {
              request_id:
                "req_corridor_001",

              subject: {
                type:
                  "corridor",

                origin_country_iso3:
                  "usa",

                destination_country_iso3:
                  "chn",
              },

              evaluated_at:
                NOW.toISOString(),

              policy:
                validPolicy(),
            },
            NOW,
          );

        expect(
          parsed.subject_type,
        ).toBe(
          "corridor",
        );

        expect(
          parsed.subject_id,
        ).toBe(
          "USA>CHN",
        );
      },
    );
  },
);


describe(
  "Risk Gate bounded JSON body",
  () => {
    it(
      "rejects a declared body larger than the Private Pilot limit",
      async () => {
        const request =
          new Request(
            "https://geomacro.live/api/risk-gate",
            {
              method: "POST",
              headers: {
                "content-type":
                  "application/json",
                "content-length":
                  String(
                    RISK_GATE_MAX_REQUEST_BODY_BYTES +
                      1,
                  ),
              },
              body: "{}",
            },
          );

        await expect(
          readExternalRiskGateJsonBody(
            request,
          ),
        ).rejects.toMatchObject({
          status: 413,
          code:
            "PAYLOAD_TOO_LARGE",
        });
      },
    );

    it(
      "rejects an actually oversized body even without Content-Length",
      async () => {
        const payload =
          JSON.stringify({
            metadata:
              "x".repeat(
                RISK_GATE_MAX_REQUEST_BODY_BYTES,
              ),
          });

        const request =
          new Request(
            "https://geomacro.live/api/risk-gate",
            {
              method: "POST",
              headers: {
                "content-type":
                  "application/json",
              },
              body:
                payload,
            },
          );

        await expect(
          readExternalRiskGateJsonBody(
            request,
          ),
        ).rejects.toMatchObject({
          status: 413,
          code:
            "PAYLOAD_TOO_LARGE",
        });
      },
    );

    it(
      "parses a normal bounded JSON request",
      async () => {
        const request =
          new Request(
            "https://geomacro.live/api/risk-gate",
            {
              method: "POST",
              headers: {
                "content-type":
                  "application/json",
              },
              body:
                JSON.stringify({
                  ok: true,
                }),
            },
          );

        await expect(
          readExternalRiskGateJsonBody(
            request,
          ),
        ).resolves.toEqual({
          ok: true,
        });
      },
    );
  },
);
