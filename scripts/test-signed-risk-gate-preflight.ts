import {
  evaluateCountryRiskGate,
} from "../src/lib/risk-gate-service.server";

const iso3 =
  (process.argv[2] ?? "IRN")
    .trim()
    .toUpperCase();

if (!/^[A-Z]{3}$/.test(iso3)) {
  throw new Error(
    "Usage: test-signed-risk-gate-preflight.ts <ISO3>",
  );
}

const result =
  await evaluateCountryRiskGate({
    request_id:
      `signed-preflight-${iso3}-${Date.now()}`,

    country_iso3:
      iso3,

    action_context: {
      action_type:
        "cross_border_payment",

      amount:
        100000,

      currency:
        "USD",

      destination:
        iso3,

      metadata: {
        test:
          "signed-risk-gate-preflight",
      },
    },

    /*
     * Deliberately permissive policy.
     *
     * The IRN GRO has score 0, but is INCOMPLETE.
     * Risk Gate must therefore refuse CONTINUE
     * independently of the score.
     */
    policy: {
      policy_id:
        "signed-preflight-test",

      policy_version:
        "1.0",

      continue_max_score:
        20,

      reduce_limit_max_score:
        40,

      require_approval_max_score:
        70,

      minimum_confidence_for_auto_continue:
        0,

      require_commercial_verification_for_continue:
        false,
    },
  });

console.log(
  JSON.stringify(
    {
      request_id:
        result.request.request_id,

      subject:
        result.response.subject,

      decision:
        result.response.decision,

      reason_codes:
        result.response.reason_codes,

      risk:
        result.response.risk,

      top_drivers:
        result.response.top_drivers,

      policy:
        result.response.policy,

      execution_authorized:
        result.response
          .execution_authorized,

      context:
        result.context,
    },
    null,
    2,
  ),
);

if (
  result.response
    .execution_authorized !== false
) {
  throw new Error(
    "Execution boundary violation",
  );
}

if (
  result.response.decision !==
    "REQUIRE_APPROVAL" ||
  !result.response.reason_codes.includes(
    "risk_object_incomplete",
  )
) {
  throw new Error(
    "INCOMPLETE signed GRO did not fail closed as expected",
  );
}

console.log(
  "\nPASS: SIGNED RISK GATE PREFLIGHT FAIL-CLOSED",
);
