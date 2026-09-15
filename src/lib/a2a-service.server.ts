import {
  CIRCLE_X402_NETWORK,
  CIRCLE_X402_PRICE_ATOMIC,
  CIRCLE_X402_PRICE_USDC,
  persistSettlementTelemetry,
  settleCircleX402,
} from "./circle-x402.server";
import {
  authenticateCommercialApiRequest,
  consumeCommercialCapability,
  ensureCommercialCreditAccount,
  resolveCommercialEntitlementForCapability,
  type CommercialPrincipal,
} from "./commercial-access.server";
import {
  runAgenticPreflightDemo,
  type AgenticDemoRunOptions,
} from "./agentic-demo-service.server";
import { requireRiskSupabase } from "./risk-supabase.server";
import {
  GEOMACRO_A2A_CAPABILITIES,
  GEOMACRO_A2A_PAYMENT_MODES,
  type A2ACallbackEnvelope,
  type A2ANegotiationEnvelope,
  type A2AStatusEnvelope,
  type A2ATaskEnvelope,
} from "./a2a-contract";
import {
  a2aPayloadHash,
  assertA2AEnvelopeFresh,
  createGeomacroSignedEnvelope,
  signGeomacroA2AValue,
  verifyA2AEnvelopeSignature,
} from "./a2a-signing.server";

export class A2AError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "A2AError";
    this.status = status;
    this.code = code;
  }
}

type Registration = {
  id: string;
  agent_id: string;
  key_id: string;
  public_key_spki_b64: string;
  status: string;
  allowed_capabilities: string[];
  allowed_payment_modes: string[];
  callback_hosts: string[];
  remote_base_url: string | null;
  commercial_principal_id: string | null;
};

type TaskRow = {
  id: string;
  direction: "inbound" | "outbound";
  caller_agent_id: string;
  remote_agent_id: string | null;
  external_task_id: string;
  capability: string;
  payment_mode: string;
  request_payload: unknown;
  request_hash: string;
  status: string;
  commercial_principal_id: string | null;
  settlement_reference: string | null;
  result_payload: unknown | null;
  result_hash: string | null;
  result_signature: unknown | null;
  callback_url: string | null;
  callback_status: string | null;
  callback_attempts: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

async function appendAudit(input: {
  taskId?: string | null;
  agentId: string;
  eventType: string;
  details?: Record<string, unknown>;
}) {
  const db = requireRiskSupabase();
  const createdAt = new Date().toISOString();
  const details = input.details ?? {};
  const eventHash = a2aPayloadHash({
    task_id: input.taskId ?? null,
    agent_id: input.agentId,
    event_type: input.eventType,
    details,
    created_at: createdAt,
  });
  const { error } = await db.from("a2a_audit_events").insert({
    task_id: input.taskId ?? null,
    agent_id: input.agentId,
    event_type: input.eventType,
    details,
    event_hash: eventHash,
    created_at: createdAt,
  });
  if (error) console.error("[a2a] audit append failed", error);
}

function registeredCallbackUrl(url: string | undefined, registration: Registration) {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new A2AError(400, "A2A_CALLBACK_INVALID", "callback_url is invalid.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new A2AError(400, "A2A_CALLBACK_INVALID", "callback_url must be credential-free HTTPS.");
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = registration.callback_hosts.map((item) => item.toLowerCase());
  if (!allowed.includes(host)) {
    throw new A2AError(403, "A2A_CALLBACK_HOST_NOT_REGISTERED", "callback_url host is not registered for this agent.");
  }
  return parsed.toString();
}

async function registrationForEnvelope(envelope: {
  agent_id: string;
  key_id: string;
  nonce: string;
  expires_at: string;
  signature: string;
  protocol_version: string;
  issued_at: string;
  payload: unknown;
}): Promise<Registration> {
  try {
    assertA2AEnvelopeFresh(envelope);
  } catch (error) {
    throw new A2AError(401, "A2A_ENVELOPE_EXPIRED", error instanceof Error ? error.message : "Envelope freshness check failed.");
  }

  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("a2a_agent_registrations")
    .select("id,agent_id,key_id,public_key_spki_b64,status,allowed_capabilities,allowed_payment_modes,callback_hosts,remote_base_url,commercial_principal_id")
    .eq("agent_id", envelope.agent_id)
    .eq("key_id", envelope.key_id)
    .maybeSingle();
  if (error) throw new A2AError(503, "A2A_REGISTRY_UNAVAILABLE", "A2A registry is temporarily unavailable.");
  if (!data || data.status !== "active") throw new A2AError(401, "A2A_AGENT_NOT_ACTIVE", "A2A agent identity is not active.");

  const registration: Registration = {
    id: String(data.id),
    agent_id: String(data.agent_id),
    key_id: String(data.key_id),
    public_key_spki_b64: String(data.public_key_spki_b64),
    status: String(data.status),
    allowed_capabilities: asStrings(data.allowed_capabilities),
    allowed_payment_modes: asStrings(data.allowed_payment_modes),
    callback_hosts: asStrings(data.callback_hosts),
    remote_base_url: data.remote_base_url ? String(data.remote_base_url) : null,
    commercial_principal_id: data.commercial_principal_id ? String(data.commercial_principal_id) : null,
  };

  if (!verifyA2AEnvelopeSignature(envelope, registration.public_key_spki_b64)) {
    throw new A2AError(401, "A2A_SIGNATURE_INVALID", "A2A request signature is invalid.");
  }

  const nonceInsert = await db.from("a2a_request_nonces").insert({
    agent_id: envelope.agent_id,
    key_id: envelope.key_id,
    nonce: envelope.nonce,
    expires_at: envelope.expires_at,
  });
  if (nonceInsert.error) {
    if ((nonceInsert.error as { code?: string }).code === "23505") {
      throw new A2AError(409, "A2A_REPLAY_DETECTED", "A2A nonce has already been used.");
    }
    throw new A2AError(503, "A2A_NONCE_REGISTRY_UNAVAILABLE", "A2A replay protection is temporarily unavailable.");
  }

  return registration;
}

export async function negotiateA2A(envelope: A2ANegotiationEnvelope) {
  const registration = await registrationForEnvelope(envelope);
  const capability = envelope.payload.desired_capabilities.find(
    (item) => GEOMACRO_A2A_CAPABILITIES.includes(item) && registration.allowed_capabilities.includes(item),
  );
  if (!capability) throw new A2AError(403, "A2A_CAPABILITY_NOT_ALLOWED", "No requested A2A capability is enabled for this agent.");

  const paymentModes = envelope.payload.payment_modes.filter(
    (item) => GEOMACRO_A2A_PAYMENT_MODES.includes(item) && registration.allowed_payment_modes.includes(item),
  );
  if (paymentModes.length === 0) throw new A2AError(403, "A2A_PAYMENT_MODE_NOT_ALLOWED", "No requested A2A payment mode is enabled for this agent.");

  const callbackUrl = registeredCallbackUrl(envelope.payload.callback_url, registration);
  const agreement = {
    accepted: true,
    protocol_version: envelope.protocol_version,
    agent_id: registration.agent_id,
    capability,
    payment_modes: paymentModes,
    transports: callbackUrl ? ["poll", "callback"] : ["poll"],
    callback_url: callbackUrl,
    execution_authorized: false,
    negotiated_at: new Date().toISOString(),
  };
  await appendAudit({ agentId: registration.agent_id, eventType: "negotiated", details: { capability, payment_modes: paymentModes, callback: Boolean(callbackUrl) } });
  return { ok: true as const, agreement, integrity: signGeomacroA2AValue(agreement) };
}

async function taskByIdentity(agentId: string, externalTaskId: string) {
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("a2a_tasks")
    .select("*")
    .eq("direction", "inbound")
    .eq("caller_agent_id", agentId)
    .eq("external_task_id", externalTaskId)
    .maybeSingle();
  if (error) throw new A2AError(503, "A2A_TASK_STORE_UNAVAILABLE", "A2A task store is temporarily unavailable.");
  return data as TaskRow | null;
}

async function ensureInboundTask(envelope: A2ATaskEnvelope, registration: Registration) {
  if (!registration.allowed_capabilities.includes(envelope.payload.capability)) {
    throw new A2AError(403, "A2A_CAPABILITY_NOT_ALLOWED", "A2A capability is not enabled for this agent.");
  }
  if (!registration.allowed_payment_modes.includes(envelope.payload.payment_mode)) {
    throw new A2AError(403, "A2A_PAYMENT_MODE_NOT_ALLOWED", "A2A payment mode is not enabled for this agent.");
  }
  const callbackUrl = registeredCallbackUrl(envelope.payload.callback_url, registration);
  const requestHash = a2aPayloadHash(envelope.payload);
  const existing = await taskByIdentity(registration.agent_id, envelope.payload.external_task_id);
  if (existing) {
    if (existing.request_hash !== requestHash) {
      throw new A2AError(409, "A2A_TASK_IDEMPOTENCY_CONFLICT", "external_task_id was already used with different task content.");
    }
    return existing;
  }

  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("a2a_tasks")
    .insert({
      direction: "inbound",
      caller_agent_id: registration.agent_id,
      external_task_id: envelope.payload.external_task_id,
      capability: envelope.payload.capability,
      payment_mode: envelope.payload.payment_mode,
      request_payload: envelope.payload,
      request_hash: requestHash,
      status: "accepted",
      commercial_principal_id: registration.commercial_principal_id,
      callback_url: callbackUrl,
      callback_status: callbackUrl ? "pending" : "not_requested",
    })
    .select("*")
    .single();
  if (error || !data) {
    const raced = await taskByIdentity(registration.agent_id, envelope.payload.external_task_id);
    if (raced?.request_hash === requestHash) return raced;
    throw new A2AError(503, "A2A_TASK_CREATE_FAILED", "A2A task could not be created.");
  }
  const task = data as TaskRow;
  await appendAudit({ taskId: task.id, agentId: registration.agent_id, eventType: "task_accepted", details: { capability: task.capability, payment_mode: task.payment_mode, request_hash: requestHash } });
  return task;
}

async function claimTask(task: TaskRow) {
  if (task.status === "completed" || task.status === "failed" || task.status === "cancelled" || task.status === "processing") return null;
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("a2a_tasks")
    .update({ status: "processing", error_code: null, error_message: null })
    .eq("id", task.id)
    .in("status", ["accepted", "payment_required"])
    .select("*")
    .maybeSingle();
  if (error) throw new A2AError(503, "A2A_TASK_CLAIM_FAILED", "A2A task processing could not be claimed.");
  return data as TaskRow | null;
}

async function authorizeCommercial(request: Request, registration: Registration, task: TaskRow): Promise<CommercialPrincipal> {
  const principal = await authenticateCommercialApiRequest(request);
  if (!registration.commercial_principal_id || principal.principal_id !== registration.commercial_principal_id) {
    throw new A2AError(403, "A2A_COMMERCIAL_PRINCIPAL_MISMATCH", "A2A agent is not bound to this commercial principal.");
  }
  const entitlement = await resolveCommercialEntitlementForCapability({ principal, capability: "risk_gate_bundle" });
  await ensureCommercialCreditAccount({ principal, tier: entitlement.tier });
  await consumeCommercialCapability({ principal, entitlement, requestId: task.id, capability: "risk_gate_bundle" });
  return principal;
}

async function updateTask(taskId: string, patch: Record<string, unknown>) {
  const db = requireRiskSupabase();
  const { data, error } = await db.from("a2a_tasks").update(patch).eq("id", taskId).select("*").single();
  if (error || !data) throw new A2AError(503, "A2A_TASK_UPDATE_FAILED", "A2A task state could not be updated.");
  return data as TaskRow;
}

async function deliverCallback(task: TaskRow, registration: Registration, result: unknown) {
  if (!task.callback_url) return;
  registeredCallbackUrl(task.callback_url, registration);
  const envelope = createGeomacroSignedEnvelope({
    external_task_id: task.external_task_id,
    remote_task_id: task.id,
    status: "completed",
    result,
  });
  const body = { operation: "callback", envelope };
  let lastError = "callback delivery failed";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(task.callback_url, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Geomacro-A2A/1.0" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5_000),
        redirect: "error",
      });
      if (response.ok) {
        await updateTask(task.id, { callback_status: "delivered", callback_attempts: attempt });
        await appendAudit({ taskId: task.id, agentId: registration.agent_id, eventType: "callback_delivered", details: { attempt, status: response.status } });
        return;
      }
      lastError = `callback HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "callback delivery failed";
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  await updateTask(task.id, { callback_status: "failed", callback_attempts: 3 });
  await appendAudit({ taskId: task.id, agentId: registration.agent_id, eventType: "callback_failed", details: { error: lastError } });
}

export async function submitA2ATask(request: Request, envelope: A2ATaskEnvelope) {
  const registration = await registrationForEnvelope(envelope);
  let task = await ensureInboundTask(envelope, registration);

  if (task.status === "completed") return { kind: "result" as const, task, idempotent_replay: true };
  if (task.status === "failed" || task.status === "cancelled") return { kind: "terminal" as const, task };
  if (task.status === "processing") return { kind: "processing" as const, task };

  if (task.payment_mode === "x402_testnet" && !request.headers.get("payment-signature")) {
    if (task.status !== "payment_required") task = await updateTask(task.id, { status: "payment_required" });
    await appendAudit({ taskId: task.id, agentId: registration.agent_id, eventType: "payment_required", details: { mode: "x402_testnet" } });
    return { kind: "payment_required" as const, task };
  }

  const claimed = await claimTask(task);
  if (!claimed) {
    const current = await taskByIdentity(registration.agent_id, envelope.payload.external_task_id);
    return { kind: current?.status === "completed" ? "result" as const : "processing" as const, task: current ?? task, idempotent_replay: true };
  }
  task = claimed;

  try {
    let settlementReference: string | null = null;
    let payment: NonNullable<AgenticDemoRunOptions["payment"]> = {
      required: false,
      note: "Authorized against the caller's Geomacro commercial credit entitlement.",
    };

    if (task.payment_mode === "commercial_credit") {
      const principal = await authorizeCommercial(request, registration, task);
      await appendAudit({ taskId: task.id, agentId: registration.agent_id, eventType: "commercial_credit_authorized", details: { principal_id: principal.principal_id } });
    } else {
      try {
        const settlement = await settleCircleX402(request);
        settlementReference = settlement.settlement_reference;
        payment = {
          required: true,
          provider: "circle_gateway_x402",
          asset: "USDC",
          network: CIRCLE_X402_NETWORK,
          amount_atomic: CIRCLE_X402_PRICE_ATOMIC,
          amount_usdc: CIRCLE_X402_PRICE_USDC,
          payer: settlement.payer,
          settlement_reference: settlement.settlement_reference,
          note: "Arc Testnet x402 technical proof only.",
        };
        await persistSettlementTelemetry({ requestId: task.id, payer: settlement.payer, settlementReference: settlement.settlement_reference });
        await appendAudit({ taskId: task.id, agentId: registration.agent_id, eventType: "x402_settled", details: { settlement_reference: settlement.settlement_reference } });
      } catch (error) {
        await updateTask(task.id, { status: "payment_required", error_code: "X402_PAYMENT_FAILED", error_message: "Payment signature could not be verified or settled." });
        throw new A2AError(402, "X402_PAYMENT_FAILED", error instanceof Error ? error.message : "x402 settlement failed");
      }
    }

    const result = await runAgenticPreflightDemo(envelope.payload.input, {
      mode: task.payment_mode === "x402_testnet" ? "X402_PAID" : "COMMERCIAL_PRIVATE_PILOT",
      recordTelemetry: false,
      requestId: task.id,
      payment,
      enforceDemoSubjectAllowlist: task.payment_mode === "x402_testnet",
    });
    if (result.risk_gate.execution_authorized !== false || result.boundaries.execution_authorized !== false) {
      throw new Error("A2A execution boundary violated");
    }

    const responseValue = {
      protocol_version: "geomacro-a2a/1.0",
      task_id: task.id,
      external_task_id: task.external_task_id,
      status: "completed",
      result,
      execution_authorized: false,
      completed_at: new Date().toISOString(),
    };
    const integrity = signGeomacroA2AValue(responseValue);
    task = await updateTask(task.id, {
      status: "completed",
      settlement_reference: settlementReference,
      result_payload: responseValue,
      result_hash: integrity.payload_hash,
      result_signature: integrity,
      completed_at: responseValue.completed_at,
      error_code: null,
      error_message: null,
    });
    await appendAudit({ taskId: task.id, agentId: registration.agent_id, eventType: "task_completed", details: { result_hash: integrity.payload_hash } });
    await deliverCallback(task, registration, responseValue);
    return { kind: "result" as const, task, response: { ...responseValue, integrity } };
  } catch (error) {
    if (error instanceof A2AError && error.status === 402) throw error;
    const message = error instanceof Error ? error.message : "A2A task failed closed";
    task = await updateTask(task.id, { status: "failed", error_code: "A2A_TASK_FAILED_CLOSED", error_message: message.slice(0, 1024), completed_at: new Date().toISOString() });
    await appendAudit({ taskId: task.id, agentId: registration.agent_id, eventType: "task_failed", details: { error: message.slice(0, 512) } });
    throw new A2AError(503, "A2A_TASK_FAILED_CLOSED", "A2A risk task failed closed.");
  }
}

export async function getA2ATaskStatus(envelope: A2AStatusEnvelope) {
  const registration = await registrationForEnvelope(envelope);
  const db = requireRiskSupabase();
  const { data, error } = await db.from("a2a_tasks").select("*").eq("id", envelope.payload.task_id).eq("caller_agent_id", registration.agent_id).maybeSingle();
  if (error) throw new A2AError(503, "A2A_TASK_STORE_UNAVAILABLE", "A2A task store is temporarily unavailable.");
  if (!data) throw new A2AError(404, "A2A_TASK_NOT_FOUND", "A2A task was not found.");
  const task = data as TaskRow;
  const status = {
    task_id: task.id,
    external_task_id: task.external_task_id,
    status: task.status,
    payment_mode: task.payment_mode,
    result: task.status === "completed" ? task.result_payload : null,
    result_integrity: task.status === "completed" ? task.result_signature : null,
    callback_status: task.callback_status,
    error: task.error_code ? { code: task.error_code, message: task.error_message } : null,
    execution_authorized: false,
    updated_at: task.updated_at,
  };
  return { ok: true as const, status, integrity: signGeomacroA2AValue(status) };
}

export async function receiveA2ACallback(envelope: A2ACallbackEnvelope) {
  const registration = await registrationForEnvelope(envelope);
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("a2a_tasks")
    .select("*")
    .eq("direction", "outbound")
    .eq("remote_agent_id", registration.agent_id)
    .eq("external_task_id", envelope.payload.external_task_id)
    .maybeSingle();
  if (error) throw new A2AError(503, "A2A_TASK_STORE_UNAVAILABLE", "A2A task store is temporarily unavailable.");
  if (!data) throw new A2AError(404, "A2A_OUTBOUND_TASK_NOT_FOUND", "Matching outbound A2A task was not found.");
  const status = envelope.payload.status === "completed" ? "completed" : envelope.payload.status === "cancelled" ? "cancelled" : "failed";
  const resultPayload = envelope.payload.result ?? null;
  const resultHash = resultPayload === null ? null : a2aPayloadHash(resultPayload);
  const task = await updateTask(String(data.id), {
    status,
    result_payload: resultPayload,
    result_hash: resultHash,
    error_code: envelope.payload.error?.code ?? null,
    error_message: envelope.payload.error?.message ?? null,
    completed_at: new Date().toISOString(),
  });
  await appendAudit({ taskId: task.id, agentId: registration.agent_id, eventType: "remote_callback_received", details: { status, result_hash: resultHash } });
  return { ok: true as const, task_id: task.id, accepted: true, execution_authorized: false };
}

export async function createOutboundA2ATask(input: {
  remoteAgentId: string;
  externalTaskId: string;
  capability: "risk_preflight";
  paymentMode: "commercial_credit" | "x402_testnet";
  requestPayload: unknown;
}) {
  const db = requireRiskSupabase();
  const requestHash = a2aPayloadHash(input.requestPayload);
  const { data, error } = await db
    .from("a2a_tasks")
    .insert({
      direction: "outbound",
      caller_agent_id: "geomacro",
      remote_agent_id: input.remoteAgentId,
      external_task_id: input.externalTaskId,
      capability: input.capability,
      payment_mode: input.paymentMode,
      request_payload: input.requestPayload,
      request_hash: requestHash,
      status: "accepted",
      callback_status: "not_requested",
    })
    .select("*")
    .single();
  if (error || !data) throw new A2AError(503, "A2A_OUTBOUND_TASK_CREATE_FAILED", "Outbound A2A task could not be persisted.");
  const task = data as TaskRow;
  await appendAudit({ taskId: task.id, agentId: "geomacro", eventType: "outbound_task_created", details: { remote_agent_id: input.remoteAgentId, request_hash: requestHash } });
  return task;
}
