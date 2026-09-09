import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

import {
  canonicalJson,
} from "./canonical-json";
import {
  handleExternalRiskGateRequest,
  readExternalRiskGateJsonBody,
} from "./risk-gate-api.server";
import {
  requireRiskSupabase,
} from "./risk-supabase.server";
import {
  ensureRiskGateWebhookEvent,
} from "./webhook-event-outbox.server";


type ApiClientRow = {
  client_id: string;
  api_key_hash: string;
  enabled: boolean;
};


type ClaimDisposition =
  | "CLAIMED"
  | "REPLAY"
  | "CONFLICT"
  | "IN_PROGRESS";


type ClaimRow = {
  disposition: ClaimDisposition;
  claim_token: string | null;
  audit_id: string | null;
  response_payload: unknown;
  http_status: number | null;
};


type SuccessfulRiskGateBody = {
  audit_id?: unknown;
  [key: string]: unknown;
};


function sha256Text(
  value: string,
): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}


function secureHashEqual(
  left: string,
  right: string,
): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return (
    a.length === b.length &&
    timingSafeEqual(a, b)
  );
}


function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value),
  );
}


function requestIdFromPayload(
  payload: unknown,
): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.request_id !== "string") return null;
  const requestId = payload.request_id.trim();
  if (
    requestId.length < 1 ||
    requestId.length > 256
  ) {
    return null;
  }
  return requestId;
}


function extractBearerToken(
  request: Request,
): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() ?? "";
  if (
    token.length < 32 ||
    token.length > 512
  ) {
    return null;
  }
  return token;
}


/**
 * Identify the authenticated API client for the idempotency ledger without
 * changing the canonical authentication/rate-limit behavior inside the Risk
 * Gate handler. Invalid credentials deliberately return null so the canonical
 * handler produces the authoritative auth response and audit behavior.
 */
async function identifyClient(
  request: Request,
): Promise<ApiClientRow | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  const tokenHash = sha256Text(token);
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("risk_gate_api_clients")
    .select("client_id,api_key_hash,enabled")
    .eq("api_key_hash", tokenHash)
    .maybeSingle();

  if (
    error ||
    !data
  ) {
    return null;
  }

  const client = data as unknown as ApiClientRow;
  if (
    !client.enabled ||
    !secureHashEqual(client.api_key_hash, tokenHash)
  ) {
    return null;
  }

  return client;
}


function jsonError(
  status: number,
  code: string,
  message: string,
  extraHeaders?: Record<string, string>,
): Response {
  return Response.json(
    {
      ok: false,
      error: { code, message },
      execution_authorized: false,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...extraHeaders,
      },
    },
  );
}


async function claimRequest(
  clientId: string,
  requestId: string,
  requestHash: string,
): Promise<ClaimRow> {
  const db = requireRiskSupabase();
  const { data, error } = await db.rpc(
    "claim_risk_gate_idempotency",
    {
      p_client_id: clientId,
      p_request_id: requestId,
      p_request_hash: requestHash,
    },
  );

  if (
    error ||
    !Array.isArray(data) ||
    data.length !== 1
  ) {
    throw new Error(
      `Risk Gate idempotency claim failed${error?.message ? `: ${error.message}` : ""}`,
    );
  }

  const row = data[0] as ClaimRow;
  if (
    ![
      "CLAIMED",
      "REPLAY",
      "CONFLICT",
      "IN_PROGRESS",
    ].includes(row.disposition)
  ) {
    throw new Error("Risk Gate idempotency backend returned an invalid disposition");
  }

  return row;
}


async function releaseClaim(
  clientId: string,
  requestId: string,
  requestHash: string,
  claimToken: string,
): Promise<void> {
  const db = requireRiskSupabase();
  const { error } = await db.rpc(
    "release_risk_gate_idempotency",
    {
      p_client_id: clientId,
      p_request_id: requestId,
      p_request_hash: requestHash,
      p_claim_token: claimToken,
    },
  );

  if (error) {
    console.error(
      "[risk-gate] idempotency release failed",
      error.message,
    );
  }
}


async function completeClaim(
  clientId: string,
  requestId: string,
  requestHash: string,
  claimToken: string,
  auditId: string,
): Promise<boolean> {
  const db = requireRiskSupabase();
  const { data, error } = await db.rpc(
    "complete_risk_gate_idempotency",
    {
      p_client_id: clientId,
      p_request_id: requestId,
      p_request_hash: requestHash,
      p_claim_token: claimToken,
      p_audit_id: auditId,
    },
  );

  if (error) {
    throw new Error(
      `Risk Gate idempotency completion failed: ${error.message}`,
    );
  }

  return data === true;
}


function validReplayState(
  row: ClaimRow,
): row is ClaimRow & {
  audit_id: string;
  response_payload: Record<string, unknown>;
  http_status: number;
} {
  return Boolean(
    row.audit_id &&
    isRecord(row.response_payload) &&
    Number.isInteger(row.http_status) &&
    (row.http_status as number) >= 200 &&
    (row.http_status as number) <= 299,
  );
}


function replayResponse(
  row: ClaimRow,
): Response {
  if (!validReplayState(row)) {
    return jsonError(
      503,
      "IDEMPOTENCY_BACKEND_INVALID",
      "Risk Gate replay state is invalid",
    );
  }

  return Response.json(
    {
      ...row.response_payload,
      audit_id: row.audit_id,
    },
    {
      status: row.http_status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Geomacro-Idempotent-Replay": "true",
      },
    },
  );
}


async function ensureWebhookBeforeDelivery(
  input: {
    client_id: string;
    audit_id: string;
    response_payload: unknown;
  },
): Promise<Response | null> {
  try {
    await ensureRiskGateWebhookEvent(
      input,
    );
    return null;
  } catch (error) {
    console.error(
      "[risk-gate] signed webhook outbox unavailable",
      error,
    );

    return jsonError(
      503,
      "WEBHOOK_OUTBOX_UNAVAILABLE",
      "Risk Gate result was audited but its signed delivery event is not durable yet",
      {
        "Retry-After": "2",
      },
    );
  }
}


/**
 * External Risk Gate reliability wrapper.
 *
 * The existing handler remains authoritative for authentication, request
 * validation, rate limiting, evaluation and immutable audit persistence. This
 * wrapper adds a server-only 24-hour request-id ledger around successful
 * deliveries so retries cannot double-evaluate the same client/request_id.
 * Request hashes use canonical JSON, so semantically identical JSON bodies do
 * not conflict solely because object keys were serialized in a different order.
 *
 * When WEBHOOK_OUTBOX_ENABLED=true, a successful Risk Gate response is not
 * returned until one immutable signed structured webhook event is durable for
 * its audit_id. If audit persistence succeeded but event persistence failed,
 * the exact retry path reconstructs the missing event from the immutable audit
 * response before replaying the 200 response. No outbound HTTP request occurs
 * in this wrapper.
 *
 * IMPORTANT: idempotency/webhook reliability never changes the execution
 * boundary. Every response, including errors and replays, remains
 * non-authorizing.
 */
export async function
handleIdempotentExternalRiskGateRequest(
  request: Request,
): Promise<Response> {
  let payload: unknown;

  try {
    payload = await readExternalRiskGateJsonBody(request.clone());
  } catch {
    // Preserve the canonical malformed-body response/audit path.
    return handleExternalRiskGateRequest(request);
  }

  const requestId = requestIdFromPayload(payload);
  if (!requestId) {
    return handleExternalRiskGateRequest(request);
  }

  let client: ApiClientRow | null;
  try {
    client = await identifyClient(request);
  } catch (error) {
    console.error("[risk-gate] idempotency pre-auth unavailable", error);
    return jsonError(
      503,
      "IDEMPOTENCY_BACKEND_UNAVAILABLE",
      "Risk Gate request reliability layer is unavailable",
    );
  }

  if (!client) {
    // Keep the existing authoritative auth failure semantics.
    return handleExternalRiskGateRequest(request);
  }

  let requestHash: string;
  try {
    requestHash = sha256Text(
      canonicalJson(payload),
    );
  } catch (error) {
    console.error("[risk-gate] canonical idempotency hashing failed", error);
    return jsonError(
      400,
      "INVALID_REQUEST_PAYLOAD",
      "Risk Gate request payload is not canonical JSON data",
    );
  }

  let claim: ClaimRow;

  try {
    claim = await claimRequest(
      client.client_id,
      requestId,
      requestHash,
    );
  } catch (error) {
    console.error("[risk-gate] idempotency claim unavailable", error);
    return jsonError(
      503,
      "IDEMPOTENCY_BACKEND_UNAVAILABLE",
      "Risk Gate request reliability layer is unavailable",
    );
  }

  if (claim.disposition === "REPLAY") {
    if (!validReplayState(claim)) {
      return replayResponse(claim);
    }

    const webhookFailure =
      await ensureWebhookBeforeDelivery({
        client_id:
          client.client_id,
        audit_id:
          claim.audit_id,
        response_payload:
          claim.response_payload,
      });

    if (webhookFailure) {
      return webhookFailure;
    }

    return replayResponse(claim);
  }

  if (claim.disposition === "CONFLICT") {
    return jsonError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "request_id was already used with a different request payload",
    );
  }

  if (claim.disposition === "IN_PROGRESS") {
    return jsonError(
      409,
      "REQUEST_IN_PROGRESS",
      "An identical Risk Gate request is already being evaluated",
      { "Retry-After": "2" },
    );
  }

  const claimToken = claim.claim_token;
  if (!claimToken) {
    return jsonError(
      503,
      "IDEMPOTENCY_BACKEND_INVALID",
      "Risk Gate request claim is invalid",
    );
  }

  let response: Response;
  try {
    response = await handleExternalRiskGateRequest(request);
  } catch (error) {
    await releaseClaim(
      client.client_id,
      requestId,
      requestHash,
      claimToken,
    );
    throw error;
  }

  if (
    response.status < 200 ||
    response.status > 299
  ) {
    await releaseClaim(
      client.client_id,
      requestId,
      requestHash,
      claimToken,
    );
    return response;
  }

  let body: SuccessfulRiskGateBody;
  try {
    body = await response.clone().json() as SuccessfulRiskGateBody;
  } catch {
    return jsonError(
      503,
      "IDEMPOTENCY_COMPLETION_FAILED",
      "Risk Gate result could not be finalized for safe replay",
    );
  }

  const auditId =
    typeof body.audit_id === "string"
      ? body.audit_id
      : "";

  if (!auditId) {
    return jsonError(
      503,
      "IDEMPOTENCY_COMPLETION_FAILED",
      "Risk Gate result has no immutable audit identifier",
    );
  }

  const webhookFailure =
    await ensureWebhookBeforeDelivery({
      client_id:
        client.client_id,
      audit_id:
        auditId,
      response_payload:
        body,
    });

  if (webhookFailure) {
    // Do not release the claim here. The delivered audit row already exists.
    // On exact retry, claim_risk_gate_idempotency() reconciles that immutable
    // audit row and the REPLAY path repairs/validates the signed webhook event.
    return webhookFailure;
  }

  try {
    const completed = await completeClaim(
      client.client_id,
      requestId,
      requestHash,
      claimToken,
      auditId,
    );

    if (!completed) {
      throw new Error("idempotency claim was not completed");
    }
  } catch (error) {
    console.error("[risk-gate] idempotency completion failed", error);
    // Fail closed. The delivered audit row already exists; a subsequent exact
    // retry can reconcile that row through claim_risk_gate_idempotency().
    return jsonError(
      503,
      "IDEMPOTENCY_COMPLETION_FAILED",
      "Risk Gate result was audited but could not be finalized for safe replay",
      { "Retry-After": "2" },
    );
  }

  return response;
}
