import {
  buildRiskGateDecisionWebhookEvent,
  type RiskGateDecisionWebhookEvent,
} from "./webhook-event-contract";
import {
  signWebhookEvent,
  webhookOutboxEnabled,
} from "./webhook-event-signing.server";
import type {
  RiskGateResponse,
} from "./risk-gate-contract";
import {
  requireRiskSupabase,
} from "./risk-supabase.server";


type ExistingWebhookRow = {
  event_id: string;
  payload_hash: string;
  signing_key_id: string;
};


type SuccessfulRiskGatePayload = {
  risk_gate:
    RiskGateResponse;
  context?: {
    evaluated_at?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};


function isRecord(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value),
  );
}


function deterministicEventId(
  auditId: string,
): string {
  const normalized =
    auditId.trim();

  if (
    !/^rga_[A-Za-z0-9-]+$/.test(
      normalized,
    )
  ) {
    throw new Error(
      "Webhook audit_id is invalid",
    );
  }

  return `gwe_${normalized.slice(4)}`;
}


function successfulRiskGatePayload(
  value: unknown,
): SuccessfulRiskGatePayload {
  if (
    !isRecord(value) ||
    !isRecord(value.risk_gate)
  ) {
    throw new Error(
      "Webhook source Risk Gate payload is invalid",
    );
  }

  const riskGate =
    value.risk_gate as
      unknown as RiskGateResponse;

  if (
    riskGate
      .execution_authorized !==
      false ||
    typeof riskGate
      .request_id !==
      "string" ||
    typeof riskGate
      .decision !==
      "string" ||
    typeof riskGate
      .recommended_action !==
      "string" ||
    !Array.isArray(
      riskGate.reason_codes,
    )
  ) {
    throw new Error(
      "Webhook source Risk Gate decision is invalid",
    );
  }

  return {
    ...value,
    risk_gate:
      riskGate,
    context:
      isRecord(value.context)
        ? value.context
        : undefined,
  };
}


function eventOccurredAt(
  payload:
    SuccessfulRiskGatePayload,
): string {
  const candidates = [
    payload.context
      ?.evaluated_at,
    payload.risk_gate
      .risk?.generated_at,
  ];

  for (const candidate of candidates) {
    if (
      typeof candidate !==
      "string"
    ) {
      continue;
    }

    const parsed =
      new Date(candidate);

    if (
      !Number.isNaN(
        parsed.getTime(),
      )
    ) {
      return parsed.toISOString();
    }
  }

  throw new Error(
    "Webhook source has no valid event timestamp",
  );
}


async function existingEvent(
  auditId: string,
): Promise<ExistingWebhookRow | null> {
  const db =
    requireRiskSupabase();

  const {
    data,
    error,
  } =
    await db
      .from(
        "webhook_event_outbox",
      )
      .select(
        "event_id,payload_hash,signing_key_id",
      )
      .eq(
        "audit_id",
        auditId,
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Webhook outbox lookup failed: ${error.message}`,
    );
  }

  return data
    ? data as unknown as ExistingWebhookRow
    : null;
}


function assertStoredEventMatches(
  row: ExistingWebhookRow,
  event:
    RiskGateDecisionWebhookEvent,
) {
  if (
    !event.integrity
      .payload_hash ||
    !event.integrity
      .signing_key_id ||
    row.event_id !==
      event.event_id ||
    row.payload_hash !==
      event.integrity
        .payload_hash ||
    row.signing_key_id !==
      event.integrity
        .signing_key_id
  ) {
    throw new Error(
      "Webhook outbox contains a conflicting event for audit_id",
    );
  }
}


/**
 * Ensure one immutable signed structured webhook event exists for a delivered
 * Risk Gate audit. This function performs no outbound network request.
 *
 * If the first response path persisted the audit but failed before the outbox
 * insert completed, an exact idempotent retry can call this function again and
 * repair the missing event before the response is replayed to the client.
 */
export async function ensureRiskGateWebhookEvent(
  input: {
    client_id: string;
    audit_id: string;
    response_payload:
      unknown;
  },
): Promise<
  | {
      enabled: false;
    }
  | {
      enabled: true;
      event_id: string;
      payload_hash: string;
      signing_key_id: string;
    }
> {
  if (!webhookOutboxEnabled()) {
    return {
      enabled: false,
    };
  }

  const auditId =
    input.audit_id.trim();

  const alreadyStored =
    await existingEvent(
      auditId,
    );

  if (alreadyStored) {
    return {
      enabled: true,
      event_id:
        alreadyStored.event_id,
      payload_hash:
        alreadyStored.payload_hash,
      signing_key_id:
        alreadyStored.signing_key_id,
    };
  }

  const payload =
    successfulRiskGatePayload(
      input.response_payload,
    );

  const signed =
    signWebhookEvent(
      buildRiskGateDecisionWebhookEvent({
        event_id:
          deterministicEventId(
            auditId,
          ),
        client_id:
          input.client_id,
        audit_id:
          auditId,
        occurred_at:
          eventOccurredAt(
            payload,
          ),
        risk_gate:
          payload.risk_gate,
      }),
    );

  const payloadHash =
    signed.integrity
      .payload_hash;
  const signingKeyId =
    signed.integrity
      .signing_key_id;
  const signature =
    signed.integrity
      .signature;

  if (
    !payloadHash ||
    !signingKeyId ||
    !signature
  ) {
    throw new Error(
      "Webhook signing did not produce a complete integrity envelope",
    );
  }

  const db =
    requireRiskSupabase();

  const {
    error,
  } =
    await db
      .from(
        "webhook_event_outbox",
      )
      .insert({
        event_id:
          signed.event_id,
        audit_id:
          auditId,
        client_id:
          input.client_id,
        schema_version:
          signed.schema_version,
        event_type:
          signed.event_type,
        occurred_at:
          signed.occurred_at,
        payload:
          signed,
        payload_hash:
          payloadHash,
        signature_scheme:
          signed.integrity
            .signature_scheme,
        signing_key_id:
          signingKeyId,
        signature,
      });

  if (error) {
    // A concurrent exact retry may have inserted the same deterministic event.
    // Re-read and accept only an exact integrity match; all other errors fail.
    const raced =
      await existingEvent(
        auditId,
      );

    if (!raced) {
      throw new Error(
        `Webhook outbox insert failed: ${error.message}`,
      );
    }

    assertStoredEventMatches(
      raced,
      signed,
    );
  }

  return {
    enabled: true,
    event_id:
      signed.event_id,
    payload_hash:
      payloadHash,
    signing_key_id:
      signingKeyId,
  };
}
