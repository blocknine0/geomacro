/**
 * Geomacro Risk Gate service boundary.
 *
 * Responsibilities:
 * - validate the externally supplied Risk Gate request
 * - load the latest compatible persisted GRO
 * - evaluate customer policy against that GRO
 * - return machine-readable decision context
 *
 * Product boundary:
 * - this service provides external-world risk context
 * - customer / agent policy determines the decision
 * - this service never authorizes or submits execution
 */

import {
  getLatestCompatibleCountryRiskObjectAtOrBefore,
} from "./risk-object-store.server";

import {
  evaluateRiskGate,
} from "./risk-gate-engine";

import type {
  RiskGatePolicy,
  RiskGateRequest,
  RiskGateResponse,
} from "./risk-gate-contract";


export type CountryRiskGateServiceInput = {
  request_id: string;

  country_iso3: string;

  action_context?: {
    action_type?: string;
    amount?: number;
    currency?: string;
    destination?: string;

    metadata?: Record<
      string,
      unknown
    >;
  };

  policy: RiskGatePolicy;

  /**
   * Evaluation clock.
   *
   * Defaults to current time.
   * Can be frozen for deterministic testing.
   */
  evaluated_at?: string;
};


export type CountryRiskGateServiceResult = {
  request: RiskGateRequest;

  response: RiskGateResponse;

  context: {
    country_iso3: string;

    risk_object_id: string;

    methodology_version: string;

    evaluated_at: string;

    execution_authorized: false;
  };
};


function normalizeCountryIso3(
  value: string,
) {
  const iso3 =
    value
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      iso3,
    )
  ) {
    throw new Error(
      "country_iso3 must be ISO3",
    );
  }

  return iso3;
}


function requireNonEmptyString(
  value: string,
  field: string,
) {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${field} is required`,
    );
  }

  return normalized;
}


function normalizeEvaluationTime(
  value?: string,
) {
  const evaluatedAt =
    value
      ? new Date(value)
      : new Date();

  if (
    Number.isNaN(
      evaluatedAt.getTime(),
    )
  ) {
    throw new Error(
      "Invalid evaluated_at timestamp",
    );
  }

  return evaluatedAt;
}


/**
 * Evaluate the latest persisted country GRO
 * against a caller-supplied policy.
 *
 * No execution capability exists here.
 */
export async function
evaluateCountryRiskGate(
  input: CountryRiskGateServiceInput,
): Promise<
  CountryRiskGateServiceResult
> {
  const requestId =
    requireNonEmptyString(
      input.request_id,
      "request_id",
    );

  const countryIso3 =
    normalizeCountryIso3(
      input.country_iso3,
    );

  const evaluatedAt =
    normalizeEvaluationTime(
      input.evaluated_at,
    );

  const riskObject =
    await getLatestCompatibleCountryRiskObjectAtOrBefore(
      countryIso3,
      evaluatedAt.toISOString(),
    );

  if (!riskObject) {
    throw new Error(
      `No compatible country risk object found for ${countryIso3}`,
    );
  }

  if (
    riskObject.subject.type !==
      "country" ||
    riskObject.subject.id !==
      countryIso3
  ) {
    throw new Error(
      "Risk object subject mismatch",
    );
  }

  const request: RiskGateRequest = {
    request_id:
      requestId,

    subject: {
      type: "country",
      id: countryIso3,
    },

    action_context:
      input.action_context,

    policy:
      input.policy,
  };

  const response =
    evaluateRiskGate(
      request,
      riskObject,
    );

  if (
    response.execution_authorized !==
      false
  ) {
    throw new Error(
      "Risk Gate execution boundary violation",
    );
  }

  return {
    request,

    response,

    context: {
      country_iso3:
        countryIso3,

      risk_object_id:
        riskObject.object_id,

      methodology_version:
        riskObject.methodology_version,

      evaluated_at:
        evaluatedAt.toISOString(),

      execution_authorized:
        false,
    },
  };
}
