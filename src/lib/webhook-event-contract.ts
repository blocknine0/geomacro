import type {
  RiskGateResponse,
} from "./risk-gate-contract";


export const WEBHOOK_EVENT_SCHEMA_VERSION =
  "geomacro-webhook-1.0" as const;

export const WEBHOOK_EVENT_CANONICALIZATION =
  "geomacro-canonical-json-1.0" as const;

export const WEBHOOK_EVENT_SIGNATURE_SCHEME =
  "Ed25519" as const;

export const RISK_GATE_DECISION_EVENT_TYPE =
  "risk_gate.decision.created" as const;


export type RiskGateDecisionWebhookData = {
  audit_id: string;
  request_id: string;
  decision:
    RiskGateResponse["decision"];
  recommended_action:
    RiskGateResponse[
      "recommended_action"
    ];
  reason_codes:
    RiskGateResponse[
      "reason_codes"
    ];
  counterfactual:
    RiskGateResponse[
      "counterfactual"
    ];
  subject:
    RiskGateResponse["subject"];
  risk:
    RiskGateResponse["risk"];
  top_drivers:
    RiskGateResponse[
      "top_drivers"
    ];
  policy:
    RiskGateResponse["policy"];
  execution_authorized:
    false;
};


export type RiskGateDecisionWebhookEvent = {
  schema_version:
    typeof WEBHOOK_EVENT_SCHEMA_VERSION;
  event_id: string;
  event_type:
    typeof RISK_GATE_DECISION_EVENT_TYPE;
  occurred_at: string;
  client_id: string;
  data:
    RiskGateDecisionWebhookData;
  integrity: {
    canonicalization:
      typeof WEBHOOK_EVENT_CANONICALIZATION;
    payload_hash:
      string | null;
    signature_scheme:
      typeof WEBHOOK_EVENT_SIGNATURE_SCHEME;
    signing_key_id:
      string | null;
    signature:
      string | null;
  };
};


function requiredToken(
  value: string,
  field: string,
  maxLength: number,
): string {
  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      maxLength ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(
      normalized,
    )
  ) {
    throw new Error(
      `${field} is invalid`,
    );
  }

  return normalized;
}


function isoTimestamp(
  value: string,
  field: string,
): string {
  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    throw new Error(
      `${field} must be a valid timestamp`,
    );
  }

  return parsed.toISOString();
}


/**
 * Build a customer-deliverable Risk Gate webhook event from the already
 * structured Risk Gate response. No request body, raw evidence row, private
 * warehouse record, source artifact or unbounded metadata field is copied into
 * this envelope.
 */
export function buildRiskGateDecisionWebhookEvent(
  input: {
    event_id: string;
    client_id: string;
    audit_id: string;
    occurred_at: string;
    risk_gate:
      RiskGateResponse;
  },
): RiskGateDecisionWebhookEvent {
  if (
    input.risk_gate
      .execution_authorized !==
    false
  ) {
    throw new Error(
      "Webhook event cannot authorize execution",
    );
  }

  const eventId =
    requiredToken(
      input.event_id,
      "event_id",
      128,
    );

  const clientId =
    requiredToken(
      input.client_id,
      "client_id",
      256,
    );

  const auditId =
    requiredToken(
      input.audit_id,
      "audit_id",
      256,
    );

  return {
    schema_version:
      WEBHOOK_EVENT_SCHEMA_VERSION,

    event_id:
      eventId,

    event_type:
      RISK_GATE_DECISION_EVENT_TYPE,

    occurred_at:
      isoTimestamp(
        input.occurred_at,
        "occurred_at",
      ),

    client_id:
      clientId,

    data: {
      audit_id:
        auditId,

      request_id:
        input.risk_gate
          .request_id,

      decision:
        input.risk_gate
          .decision,

      recommended_action:
        input.risk_gate
          .recommended_action,

      reason_codes:
        [...input.risk_gate
          .reason_codes],

      counterfactual:
        input.risk_gate
          .counterfactual,

      subject:
        input.risk_gate
          .subject,

      risk:
        input.risk_gate
          .risk,

      top_drivers:
        input.risk_gate
          .top_drivers.map(
            (driver) => ({
              ...driver,
            }),
          ),

      policy:
        input.risk_gate
          .policy,

      execution_authorized:
        false,
    },

    integrity: {
      canonicalization:
        WEBHOOK_EVENT_CANONICALIZATION,

      payload_hash:
        null,

      signature_scheme:
        WEBHOOK_EVENT_SIGNATURE_SCHEME,

      signing_key_id:
        null,

      signature:
        null,
    },
  };
}
