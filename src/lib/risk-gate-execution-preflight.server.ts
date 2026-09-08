import {
  evaluateCountryRiskGate,
  type CountryRiskGateServiceInput,
  type CountryRiskGateServiceResult,
} from "./risk-gate-service.server";

import {
  withRiskGatePreflight,
} from "./risk-gate-preflight";

/**
 * Server-side adapter for autonomous agents,
 * custodial wallets, treasury executors and
 * future corridor execution adapters.
 *
 * Geomacro evaluates risk first.
 * The caller-owned executor is unreachable unless
 * the Risk Gate decision is CONTINUE.
 *
 * Geomacro still never signs or broadcasts the
 * transaction here.
 */
export async function
runCountryRiskGatedExecution<
  TResult,
>(
  input:
    CountryRiskGateServiceInput,

  execute:
    (
      evaluated:
        CountryRiskGateServiceResult,
    ) => Promise<TResult>,
) {
  return withRiskGatePreflight<
    CountryRiskGateServiceResult,
    TResult
  >({
    evaluate: () =>
      evaluateCountryRiskGate(
        input,
      ),

    execute,
  });
}


import {
  evaluateCorridorRiskGate,
  type CorridorRiskGateServiceInput,
  type CorridorRiskGateServiceResult,
} from "./corridor-risk-gate-service.server";


/**
 * Corridor-aware autonomous agent / wallet guard.
 *
 * Caller execution remains unreachable unless the
 * corridor Risk Gate returns CONTINUE.
 *
 * Geomacro still does not sign or broadcast the
 * transaction here.
 */
export async function
runCorridorRiskGatedExecution<
  TResult,
>(
  input:
    CorridorRiskGateServiceInput,

  execute:
    (
      evaluated:
        CorridorRiskGateServiceResult,
    ) => Promise<TResult>,
) {
  return withRiskGatePreflight<
    CorridorRiskGateServiceResult,
    TResult
  >({
    evaluate: () =>
      evaluateCorridorRiskGate(
        input,
      ),

    execute,
  });
}
