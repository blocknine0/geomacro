import {
  runCountryRiskGatedExecution,
} from "../src/lib/risk-gate-execution-preflight.server";

import {
  RiskGatePreflightBlockedError,
} from "../src/lib/risk-gate-preflight";

const iso3 =
  String(
    process.argv[2] ??
      "USA",
  )
    .trim()
    .toUpperCase();

if (
  !/^[A-Z]{3}$/.test(
    iso3,
  )
) {
  throw new Error(
    "ISO3 country code required",
  );
}

let executorCalled =
  false;

async function main() {
  try {
    const result =
      await runCountryRiskGatedExecution(
        {
          request_id:
            `agent-wallet-preflight-${iso3}-${Date.now()}`,

          country_iso3:
            iso3,

          action_context: {
            action_type:
              "agent_wallet_transfer",

            amount:
              10_000,

            currency:
              "USDC",

            destination:
              "demo-counterparty",

            metadata: {
              mode:
                "non_broadcast_execution_guard_proof",

              adapter:
                "risk-gate-execution-preflight",
            },
          },

          policy: {
            policy_id:
              "agent-wallet-preflight",

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
           * Deliberately NON-BROADCAST.
           *
           * This callback represents the exact
           * boundary where a real agent/custodial
           * wallet executor will later plug in.
           */
          return {
            broadcast:
              false,

            risk_object_id:
              evaluated
                .context
                .risk_object_id,

            simulated_execution:
              true,
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
        "Non-CONTINUE decision reached executor",
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
          "FAIL: executor ran despite blocked Risk Gate decision",
        );
      }

      console.log(
        JSON.stringify(
          {
            status:
              "automatic_execution_blocked",

            country_iso3:
              iso3,

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
        "\nPASS: AGENT/WALLET EXECUTOR WAS UNREACHABLE BEFORE APPROVAL",
      );

      return;
    }

    throw error;
  }
}

main().catch(
  (error) => {
    console.error(
      "AGENT_WALLET_PREFLIGHT_TEST_FAILED",
      error,
    );

    process.exit(1);
  },
);
