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
