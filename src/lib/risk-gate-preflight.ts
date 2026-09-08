import {
  RISK_GATE_SCHEMA_VERSION,
  type RiskGateDecision,
  type RiskGateResponse,
} from "./risk-gate-contract";

const VALID_DECISIONS =
  new Set<RiskGateDecision>([
    "CONTINUE",
    "REDUCE_LIMIT",
    "REQUIRE_APPROVAL",
    "PAUSE",
  ]);

export class RiskGatePreflightBoundaryError
  extends Error
{
  constructor(message: string) {
    super(message);
    this.name =
      "RiskGatePreflightBoundaryError";
  }
}

export class RiskGatePreflightBlockedError
  extends Error
{
  readonly response:
    RiskGateResponse;

  constructor(
    response:
      RiskGateResponse,
  ) {
    super(
      `Automatic execution blocked by Risk Gate: ${response.decision}`,
    );

    this.name =
      "RiskGatePreflightBlockedError";

    this.response =
      response;
  }
}

/**
 * Runtime boundary check.
 *
 * A caller must never treat Risk Gate as an
 * execution authorizer. The response must keep
 * execution_authorized=false even when the
 * policy decision is CONTINUE.
 */
export function
assertRiskGatePreflightBoundary(
  response:
    RiskGateResponse,
) {
  if (
    !response ||
    typeof response !==
      "object"
  ) {
    throw new RiskGatePreflightBoundaryError(
      "Risk Gate response is missing",
    );
  }

  if (
    response.schema_version !==
    RISK_GATE_SCHEMA_VERSION
  ) {
    throw new RiskGatePreflightBoundaryError(
      "Unsupported Risk Gate schema",
    );
  }

  if (
    !VALID_DECISIONS.has(
      response.decision,
    )
  ) {
    throw new RiskGatePreflightBoundaryError(
      "Unknown Risk Gate decision",
    );
  }

  if (
    response.execution_authorized !==
    false
  ) {
    throw new RiskGatePreflightBoundaryError(
      "Risk Gate execution_authorized boundary violated",
    );
  }

  if (
    !response.request_id ||
    !response.request_id.trim()
  ) {
    throw new RiskGatePreflightBoundaryError(
      "Risk Gate request_id is missing",
    );
  }
}

/**
 * Fail-closed automatic-execution policy.
 *
 * REDUCE_LIMIT blocks the original requested
 * action. A caller may construct a new reduced
 * action and run a fresh preflight.
 *
 * REQUIRE_APPROVAL requires an external approval
 * workflow.
 *
 * PAUSE is a hard stop.
 *
 * CONTINUE only means the caller's own policy may
 * proceed to its execution layer. It is NOT an
 * authorization issued by Geomacro.
 */
export function
assertAutomaticExecutionCanProceed(
  response:
    RiskGateResponse,
) {
  assertRiskGatePreflightBoundary(
    response,
  );

  if (
    response.decision !==
    "CONTINUE"
  ) {
    throw new RiskGatePreflightBlockedError(
      response,
    );
  }
}

export async function
withRiskGatePreflight<
  TEvaluated extends {
    response:
      RiskGateResponse;
  },
  TResult,
>({
  evaluate,
  execute,
}: {
  evaluate:
    () => Promise<
      TEvaluated
    >;

  execute:
    (
      evaluated:
        TEvaluated,
    ) => Promise<TResult>;
}) {
  /*
   * Evaluation happens before the executor is
   * even reachable.
   *
   * If evaluation throws, execution never runs.
   */
  const evaluated =
    await evaluate();

  assertAutomaticExecutionCanProceed(
    evaluated.response,
  );

  const executionResult =
    await execute(
      evaluated,
    );

  return {
    evaluated,

    execution_result:
      executionResult,
  };
}
