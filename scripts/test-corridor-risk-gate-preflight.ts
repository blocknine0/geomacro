import {
  publishCountryRiskObject,
} from "../src/lib/country-risk-publisher.server";

import {
  publishCorridorRiskObject,
} from "../src/lib/corridor-risk-publisher.server";

import {
  runCorridorRiskGatedExecution,
} from "../src/lib/risk-gate-execution-preflight.server";

import {
  RiskGatePreflightBlockedError,
} from "../src/lib/risk-gate-preflight";

import {
  verifyRiskObjectSignature,
} from "../src/lib/risk-object-signing.server";


const origin =
  String(
    process.argv[2] ??
      "USA",
  )
    .trim()
    .toUpperCase();

const destination =
  String(
    process.argv[3] ??
      "CHN",
  )
    .trim()
    .toUpperCase();


if (
  !/^[A-Z]{3}$/.test(
    origin,
  ) ||
  !/^[A-Z]{3}$/.test(
    destination,
  )
) {
  throw new Error(
    "Origin and destination must be ISO3 country codes",
  );
}


let executorCalled =
  false;


async function main() {
  const asOf =
    new Date()
      .toISOString();

  /*
   * Refresh both signed endpoint GROs first.
   *
   * This keeps the corridor proof tied to current
   * structured Geomacro intelligence rather than
   * stale/demo constants.
   */
  const originResult =
    await publishCountryRiskObject({
      country_iso3:
        origin,

      as_of:
        asOf,
    });

  const destinationResult =
    await publishCountryRiskObject({
      country_iso3:
        destination,

      as_of:
        asOf,
    });

  const corridorResult =
    await publishCorridorRiskObject({
      origin_country_iso3:
        origin,

      destination_country_iso3:
        destination,

      as_of:
        asOf,
    });

  const corridor =
    corridorResult.object;

  const signatureCheck =
    verifyRiskObjectSignature(
      corridor,
    );

  console.log(
    JSON.stringify(
      {
        corridor_published:
          true,

        corridor_id:
          corridor
            .subject
            .id,

        methodology_version:
          corridor
            .methodology_version,

        risk: corridor.risk,

        confidence:
          corridor.confidence,

        evidence_summary:
          corridor
            .evidence_summary,

        verification:
          corridor
            .verification,

        commercial_eligibility:
          corridor
            .commercial_eligibility,

        corridor_context:
          corridor
            .corridor_context,

        endpoint_objects: {
          origin:
            originResult
              .object
              .object_id,

          destination:
            destinationResult
              .object
              .object_id,
        },

        integrity: {
          calculation_hash:
            corridor
              .integrity
              .calculation_hash,

          payload_hash:
            corridor
              .integrity
              .payload_hash,

          signing_key_id:
            corridor
              .integrity
              .signing_key_id,

          signature_present:
            Boolean(
              corridor
                .integrity
                .signature,
            ),

          signature_valid:
            signatureCheck.valid,

          signature_reason:
            signatureCheck.reason,
        },
      },
      null,
      2,
    ),
  );

  if (
    !signatureCheck.valid
  ) {
    throw new Error(
      `Corridor signature invalid: ${signatureCheck.reason}`,
    );
  }

  try {
    const result =
      await runCorridorRiskGatedExecution(
        {
          request_id:
            `corridor-preflight-${origin}-${destination}-${Date.now()}`,

          origin_country_iso3:
            origin,

          destination_country_iso3:
            destination,

          action_context: {
            action_type:
              "cross_border_agent_payment",

            amount:
              10_000,

            currency:
              "USDC",

            destination:
              `${destination}-counterparty`,

            metadata: {
              demo:
                "corridor-commercial-preflight",

              broadcast:
                false,

              corridor:
                `${origin}>${destination}`,
            },
          },

          policy: {
            policy_id:
              "corridor-commercial-pilot",

            policy_version:
              "1.0",

            continue_max_score:
              40,

            reduce_limit_max_score:
              60,

            require_approval_max_score:
              80,

            minimum_confidence_for_auto_continue:
              0.7,

            require_commercial_verification_for_continue:
              true,
          },
        },

        async (
          evaluated,
        ) => {
          executorCalled =
            true;

          /*
           * NON-BROADCAST commercial demo boundary.
           *
           * A real customer's treasury / wallet /
           * payment executor plugs in here only
           * after CONTINUE.
           */
          return {
            broadcast:
              false,

            simulated_execution:
              true,

            corridor_id:
              evaluated
                .context
                .corridor_id,

            risk_object_id:
              evaluated
                .context
                .risk_object_id,
          };
        },
      );

    console.log(
      JSON.stringify(
        {
          status:
            "automatic_execution_path_reached",

          decision:
            result
              .evaluated
              .response
              .decision,

          execution_authorized:
            result
              .evaluated
              .response
              .execution_authorized,

          executor_called:
            executorCalled,

          execution_result:
            result
              .execution_result,
        },
        null,
        2,
      ),
    );

    if (
      result
        .evaluated
        .response
        .decision !==
        "CONTINUE"
    ) {
      throw new Error(
        "Non-CONTINUE corridor decision reached executor",
      );
    }
  } catch (error) {
    if (
      error instanceof
      RiskGatePreflightBlockedError
    ) {
      if (
        executorCalled
      ) {
        throw new Error(
          "FAIL: corridor executor ran despite blocked decision",
        );
      }

      console.log(
        JSON.stringify(
          {
            status:
              "corridor_automatic_execution_blocked",

            corridor_id:
              error
                .response
                .subject
                .id,

            decision:
              error
                .response
                .decision,

            reason_codes:
              error
                .response
                .reason_codes,

            risk_object_id:
              error
                .response
                .risk
                .object_id,

            score:
              error
                .response
                .risk
                .score,

            confidence:
              error
                .response
                .risk
                .confidence,

            verification_status:
              error
                .response
                .risk
                .verification_status,

            commercial_eligibility_status:
              error
                .response
                .risk
                .commercial_eligibility_status,

            execution_authorized:
              error
                .response
                .execution_authorized,

            executor_called:
              executorCalled,
          },
          null,
          2,
        ),
      );

      console.log(
        "\nPASS: SIGNED CORRIDOR RISK GATE BLOCKED EXECUTOR FAIL-CLOSED",
      );

      return;
    }

    throw error;
  }
}


main().catch(
  (error) => {
    console.error(
      "CORRIDOR_PREFLIGHT_TEST_FAILED",
      error,
    );

    process.exit(1);
  },
);
