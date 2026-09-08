import {
  corridorSubjectId,
} from "./corridor-risk-engine";

import {
  verifyRiskObjectSignature,
} from "./risk-object-signing.server";

import {
  getLatestCompatibleCorridorRiskObjectAtOrBefore,
} from "./risk-object-store.server";

import {
  evaluateRiskGate,
} from "./risk-gate-engine";

import type {
  RiskGatePolicy,
  RiskGateRequest,
  RiskGateResponse,
} from "./risk-gate-contract";


export type CorridorRiskGateServiceInput = {
  request_id: string;

  origin_country_iso3:
    string;

  destination_country_iso3:
    string;

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

  policy:
    RiskGatePolicy;

  evaluated_at?: string;
};


export type CorridorRiskGateServiceResult = {
  request:
    RiskGateRequest;

  response:
    RiskGateResponse;

  context: {
    corridor_id:
      string;

    origin_country_iso3:
      string;

    destination_country_iso3:
      string;

    risk_object_id:
      string;

    methodology_version:
      string;

    evaluated_at:
      string;

    execution_authorized:
      false;
  };
};


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


export async function
evaluateCorridorRiskGate(
  input:
    CorridorRiskGateServiceInput,
): Promise<
  CorridorRiskGateServiceResult
> {
  const requestId =
    requireNonEmptyString(
      input.request_id,
      "request_id",
    );

  const corridorId =
    corridorSubjectId(
      input.origin_country_iso3,
      input.destination_country_iso3,
    );

  const [
    originIso3,
    destinationIso3,
  ] =
    corridorId.split(">");

  const evaluatedAt =
    normalizeEvaluationTime(
      input.evaluated_at,
    );

  const riskObject =
    await getLatestCompatibleCorridorRiskObjectAtOrBefore(
      corridorId,
      evaluatedAt.toISOString(),
    );

  if (!riskObject) {
    throw new Error(
      `No compatible corridor risk object found for ${corridorId}`,
    );
  }

  const signatureCheck =
    verifyRiskObjectSignature(
      riskObject,
    );

  if (
    !signatureCheck.valid
  ) {
    throw new Error(
      `Corridor risk object signature verification failed: ${signatureCheck.reason}`,
    );
  }

  if (
    riskObject.subject.type !==
      "corridor" ||
    riskObject.subject.id !==
      corridorId
  ) {
    throw new Error(
      "Corridor risk object subject mismatch",
    );
  }

  const context =
    riskObject
      .corridor_context;

  if (
    !context ||
    context.origin_country_iso3 !==
      originIso3 ||
    context.destination_country_iso3 !==
      destinationIso3
  ) {
    throw new Error(
      "Corridor risk object endpoint context mismatch",
    );
  }

  const request:
    RiskGateRequest = {
      request_id:
        requestId,

      subject: {
        type:
          "corridor",

        id:
          corridorId,
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
      evaluatedAt,
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
      corridor_id:
        corridorId,

      origin_country_iso3:
        originIso3,

      destination_country_iso3:
        destinationIso3,

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
