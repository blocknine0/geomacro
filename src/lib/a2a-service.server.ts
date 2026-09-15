import { createHash, randomUUID } from "node:crypto";

import {
  A2A_TASK_STATES,
  GEOMACRO_A2A_PROTOCOL_VERSION,
  GEOMACRO_A2A_SKILL_ID,
  a2aPushNotificationConfigSchema,
  extractA2ARiskPreflightInput,
  type A2AMessage,
  type A2APushNotificationConfig,
  type A2ASendMessageRequest,
  type A2ATaskState,
} from "./a2a-contract";
import { fetchA2AJson, assertA2APublicHttpsUrl } from "./a2a-network-safety.server";
import {
  CommercialAccessError,
  consumeCommercialCapability,
  ensureCommercialCreditAccount,
  resolveCommercialEntitlementForCapability,
  type CommercialCreditResult,
  type CommercialPrincipal,
} from "./commercial-access.server";
import { recordCommercialUsageEvent } from "./commercial-ops.server";
import { requireRiskSupabase } from "./risk-supabase.server";
import { structuredDeliveryPolicy } from "./structured-data-entitlement-registry";
import { settleTestnetApiCall } from "./testnet-api-payment.server";
import { runCanonicalTestnetIntelligence } from "./testnet-intelligence-capability.server";
import {
  testnetIntelligenceRequestSchema,
  type TestnetIntelligenceRequest,
} from "./testnet-intelligence-contract";
import { preflightTestnetIntelligenceAvailability } from "./testnet-intelligence-preflight.server";

export class A2AServiceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "A2AServiceError";
    this.status = status;
    this.code = code;
  }
}

type A2ATaskRow = {
  id: string;
  principal_id: string;
  direction: "inbound" | "outbound";
  context_id: string;
  skill_id: string;
  state: A2ATaskState;
  remote_agent_id: string | null;
  remote_agent_url: string | null;
  remote_task_id: string | null;
  request_sha256: string;
  response_sha256: string | null;
  input_json: Record<string, unknown>;
  output_json: Record<string, unknown> | null;
  error_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  canceled_at: string | null;
};

type A2AMessageRow = {
  task_id: string;
  message_id: string;
  role: "ROLE_USER" | "ROLE_AGENT";
  payload: A2AMessage;
  created_at: string;
};

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function isTerminalState(state: string): boolean {
  return [
    "TASK_STATE_COMPLETED",
    "TASK_STATE_CANCELED",
    "TASK_STATE_FAILED",
    "TASK_STATE_REJECTED",
  ].includes(state);
}

function statusMessage(task: A2ATaskRow): A2AMessage | undefined {
  const output = task.output_json ?? {};
  const stored = output.status_message;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return undefined;
  return stored as A2AMessage;
}

function artifacts(task: A2ATaskRow): unknown[] | undefined {
  const value = task.output_json?.artifacts;
  return Array.isArray(value) ? value : undefined;
}

function taskStatus(task: A2ATaskRow) {
  return {
    state: task.state,
    timestamp: task.updated_at,
    ...(statusMessage(task) ? { message: statusMessage(task) } : {}),
  };
}

function publicTask(task: A2ATaskRow, history?: A2AMessageRow[]) {
  return {
    id: task.id,
    contextId: task.context_id,
    status: taskStatus(task),
    ...(artifacts(task) ? { artifacts: artifacts(task) } : {}),
    ...(history
      ? {
          history: history.map((row) => row.payload),
        }
      : {}),
    metadata: {
      skillId: task.skill_id,
      direction: task.direction,
      protocolVersion: GEOMACRO_A2A_PROTOCOL_VERSION,
      execution_authorized: false,
      ...(task.output_json?.payment ? { payment: task.output_json.payment } : {}),
    },
  };
}

function dbTask(row: Record<string, unknown>): A2ATaskRow {
  return row as unknown as A2ATaskRow;
}

async function loadTaskRow(principalId: string, taskId: string): Promise<A2ATaskRow> {
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("a2a_tasks")
    .select("*")
    .eq("id", taskId)
    .eq("principal_id", principalId)
    .maybeSingle();
  if (error) throw new A2AServiceError(503, "A2A_TASK_STORE_UNAVAILABLE", "A2A task storage is temporarily unavailable.");
  if (!data) throw new A2AServiceError(404, "A2A_TASK_NOT_FOUND", "A2A task not found.");
  return dbTask(data as Record<string, unknown>);
}

async function loadTaskHistory(taskId: string, principalId: string, limit = 20) {
  const db = requireRiskSupabase();
  const bounded = Math.max(0, Math.min(50, Math.trunc(limit)));
  if (bounded === 0) return [] as A2AMessageRow[];
  const { data, error } = await db
    .from("a2a_messages")
    .select("task_id,message_id,role,payload,created_at")
    .eq("task_id", taskId)
    .eq("principal_id", principalId)
    .order("created_at", { ascending: true })
    .limit(bounded);
  if (error) throw new A2AServiceError(503, "A2A_MESSAGE_STORE_UNAVAILABLE", "A2A message history is temporarily unavailable.");
  return (data ?? []) as unknown as A2AMessageRow[];
}

async function audit(input: {
  taskId?: string | null;
  principalId: string;
  direction: "inbound" | "outbound" | "callback";
  eventType: string;
  requestHash?: string | null;
  responseHash?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const db = requireRiskSupabase();
    await db.from("a2a_audit_events").insert({
      task_id: input.taskId ?? null,
      principal_id: input.principalId,
      direction: input.direction,
      event_type: input.eventType,
      request_sha256: input.requestHash ?? null,
      response_sha256: input.responseHash ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.error("[a2a] audit write failed", error);
  }
}

async function persistMessage(input: {
  principalId: string;
  taskId: string;
  message: A2AMessage;
}) {
  const db = requireRiskSupabase();
  const payloadHash = sha256Json(input.message);
  const { error } = await db.from("a2a_messages").insert({
    task_id: input.taskId,
    principal_id: input.principalId,
    message_id: input.message.messageId,
    role: input.message.role,
    payload: input.message,
    payload_sha256: payloadHash,
  });
  if (error) {
    const duplicate = String((error as { code?: unknown }).code ?? "") === "23505";
    if (!duplicate) {
      throw new A2AServiceError(503, "A2A_MESSAGE_STORE_UNAVAILABLE", "A2A message could not be persisted.");
    }
  }
}

function statusAgentMessage(taskId: string, contextId: string, data: Record<string, unknown>): A2AMessage {
  return {
    messageId: randomUUID(),
    taskId,
    contextId,
    role: "ROLE_AGENT",
    parts: [{ data, mediaType: "application/json" }],
  };
}

function normalizeA2AError(error: unknown) {
  if (error instanceof A2AServiceError || error instanceof CommercialAccessError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  const code = error instanceof Error ? error.message : "A2A_TASK_FAILED";
  if (code === "STRUCTURAL_DATA_UNAVAILABLE" || code === "SIGNED_RISK_OBJECT_UNAVAILABLE") {
    return { status: 404, code, message: "Requested risk context is unavailable for this subject." };
  }
  if (
    code === "STRUCTURAL_DATA_NOT_CONFIGURED" ||
    code === "SIGNED_RISK_OBJECT_NOT_VERIFIED" ||
    code.includes("Risk object") ||
    code.includes("risk object")
  ) {
    return { status: 503, code: code.slice(0, 120), message: "Requested risk context failed closed." };
  }
  return { status: 503, code: "A2A_TASK_FAILED", message: "A2A task failed closed." };
}

async function configurePushNotification(input: {
  principalId: string;
  taskId: string;
  config: A2APushNotificationConfig;
}) {
  if (input.config.authentication && Object.keys(input.config.authentication).length > 0) {
    throw new A2AServiceError(
      400,
      "A2A_PUSH_AUTHENTICATION_NOT_SUPPORTED",
      "Remote push Authorization credentials are not accepted. Use the task-scoped notification token instead.",
    );
  }
  const url = await assertA2APublicHttpsUrl(input.config.url);
  const db = requireRiskSupabase();
  const row = {
    task_id: input.taskId,
    principal_id: input.principalId,
    callback_url: url.toString(),
    callback_token: input.config.token ?? null,
    enabled: true,
  };

  const result = input.config.id
    ? await db
        .from("a2a_push_notification_configs")
        .update(row)
        .eq("id", input.config.id)
        .eq("task_id", input.taskId)
        .eq("principal_id", input.principalId)
        .select("id,task_id,callback_url,callback_token,enabled,created_at,updated_at")
        .maybeSingle()
    : await db
        .from("a2a_push_notification_configs")
        .insert(row)
        .select("id,task_id,callback_url,callback_token,enabled,created_at,updated_at")
        .single();

  if (result.error || !result.data) {
    throw new A2AServiceError(503, "A2A_PUSH_CONFIG_UNAVAILABLE", "A2A push notification configuration could not be stored.");
  }
  return result.data as Record<string, unknown>;
}

function publicPushConfig(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    url: String(row.callback_url),
    ...(row.callback_token ? { token: String(row.callback_token) } : {}),
  };
}

async function deliverPushNotifications(task: A2ATaskRow) {
  const db = requireRiskSupabase();
  const configs = await db
    .from("a2a_push_notification_configs")
    .select("id,callback_url,callback_token,consecutive_failures")
    .eq("task_id", task.id)
    .eq("principal_id", task.principal_id)
    .eq("enabled", true)
    .limit(8);
  if (configs.error) {
    console.error("[a2a] push config read failed", configs.error);
    return;
  }
  if (!configs.data?.length) return;

  const payload = publicTask(task);
  for (const config of configs.data as Array<Record<string, unknown>>) {
    let delivered = false;
    let status = 0;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetchA2AJson(String(config.callback_url), {
          method: "POST",
          timeoutMs: 2_000,
          headers: {
            "Content-Type": "application/a2a+json",
            "A2A-Version": GEOMACRO_A2A_PROTOCOL_VERSION,
            ...(config.callback_token
              ? { "X-A2A-Notification-Token": String(config.callback_token) }
              : {}),
          },
          body: JSON.stringify(payload),
        });
        status = response.status;
        if (response.ok) {
          delivered = true;
          break;
        }
      } catch {
        status = 0;
      }
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 150));
    }

    const failures = delivered ? 0 : Number(config.consecutive_failures ?? 0) + 1;
    await db
      .from("a2a_push_notification_configs")
      .update({
        consecutive_failures: failures,
        last_delivery_status: status || null,
        last_delivery_at: nowIso(),
        enabled: failures < 5,
      })
      .eq("id", String(config.id))
      .eq("task_id", task.id)
      .eq("principal_id", task.principal_id);

    await audit({
      taskId: task.id,
      principalId: task.principal_id,
      direction: "callback",
      eventType: delivered ? "push_delivered" : "push_failed",
      responseHash: sha256Json(payload),
      metadata: { status, attempt_limit: 2, disabled_after_failures: failures >= 5 },
    });
  }
}

async function maybeExistingMessageTask(principalId: string, messageId: string) {
  const db = requireRiskSupabase();
  const existing = await db
    .from("a2a_messages")
    .select("task_id")
    .eq("principal_id", principalId)
    .eq("message_id", messageId)
    .maybeSingle();
  if (existing.error) {
    throw new A2AServiceError(503, "A2A_MESSAGE_STORE_UNAVAILABLE", "A2A message storage is temporarily unavailable.");
  }
  return existing.data?.task_id ? String(existing.data.task_id) : null;
}

async function createInboundTask(input: {
  principal: CommercialPrincipal;
  request: A2ASendMessageRequest;
  riskInput: ReturnType<typeof extractA2ARiskPreflightInput>;
}) {
  const db = requireRiskSupabase();
  const contextId = input.request.message.contextId ?? randomUUID();
  const requestHash = sha256Json(input.request.message);
  const { data, error } = await db
    .from("a2a_tasks")
    .insert({
      principal_id: input.principal.principal_id,
      direction: "inbound",
      context_id: contextId,
      skill_id: GEOMACRO_A2A_SKILL_ID,
      state: "TASK_STATE_SUBMITTED",
      remote_agent_id: input.principal.principal_external_id,
      request_sha256: requestHash,
      input_json: input.riskInput,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new A2AServiceError(503, "A2A_TASK_STORE_UNAVAILABLE", "A2A task could not be created.");
  }
  return dbTask(data as Record<string, unknown>);
}

async function prepareTask(input: {
  principal: CommercialPrincipal;
  request: A2ASendMessageRequest;
  riskInput: ReturnType<typeof extractA2ARiskPreflightInput>;
}) {
  const replayTaskId = await maybeExistingMessageTask(
    input.principal.principal_id,
    input.request.message.messageId,
  );
  if (replayTaskId) {
    return { task: await loadTaskRow(input.principal.principal_id, replayTaskId), replay: true };
  }

  let task: A2ATaskRow;
  if (input.request.message.taskId) {
    task = await loadTaskRow(input.principal.principal_id, input.request.message.taskId);
    if (isTerminalState(task.state)) {
      return { task, replay: true };
    }
    if (
      input.request.message.contextId &&
      input.request.message.contextId !== task.context_id
    ) {
      throw new A2AServiceError(409, "A2A_CONTEXT_CONFLICT", "The supplied contextId does not match the existing task.");
    }
  } else {
    task = await createInboundTask(input);
  }

  await persistMessage({
    principalId: input.principal.principal_id,
    taskId: task.id,
    message: { ...input.request.message, taskId: task.id, contextId: task.context_id },
  });

  if (input.request.configuration?.taskPushNotificationConfig) {
    await configurePushNotification({
      principalId: input.principal.principal_id,
      taskId: task.id,
      config: input.request.configuration.taskPushNotificationConfig,
    });
  }

  const db = requireRiskSupabase();
  const moved = await db
    .from("a2a_tasks")
    .update({
      state: "TASK_STATE_WORKING",
      input_json: input.riskInput,
      error_json: null,
    })
    .eq("id", task.id)
    .eq("principal_id", input.principal.principal_id)
    .select("*")
    .single();
  if (moved.error || !moved.data) {
    throw new A2AServiceError(503, "A2A_TASK_STORE_UNAVAILABLE", "A2A task state could not be updated.");
  }
  task = dbTask(moved.data as Record<string, unknown>);
  return { task, replay: false };
}

function toIntelligenceRequest(taskId: string, input: ReturnType<typeof extractA2ARiskPreflightInput>): TestnetIntelligenceRequest {
  return testnetIntelligenceRequestSchema.parse({
    request_id: taskId,
    capability: "risk_gate_bundle",
    subject: input.subject,
    policy_preset: input.policy_preset,
    action_type: input.action_type,
    amount_usdc: input.amount_usdc,
    payment: input.payment,
  });
}

function assertExecutionBoundary(data: Record<string, unknown>) {
  if (data.execution_authorized !== false) {
    throw new A2AServiceError(503, "A2A_EXECUTION_BOUNDARY_VIOLATION", "A2A delivery failed closed.");
  }
  const riskGate = data.risk_gate;
  if (
    riskGate &&
    typeof riskGate === "object" &&
    !Array.isArray(riskGate) &&
    (riskGate as Record<string, unknown>).execution_authorized !== false
  ) {
    throw new A2AServiceError(503, "A2A_EXECUTION_BOUNDARY_VIOLATION", "A2A delivery failed closed.");
  }
}

async function updateTask(input: {
  task: A2ATaskRow;
  state: A2ATaskState;
  output?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
  completed?: boolean;
}) {
  const db = requireRiskSupabase();
  const responseHash = input.output ? sha256Json(input.output) : null;
  const result = await db
    .from("a2a_tasks")
    .update({
      state: input.state,
      output_json: input.output ?? null,
      error_json: input.error ?? null,
      response_sha256: responseHash,
      completed_at: input.completed ? nowIso() : null,
    })
    .eq("id", input.task.id)
    .eq("principal_id", input.task.principal_id)
    .select("*")
    .single();
  if (result.error || !result.data) {
    throw new A2AServiceError(503, "A2A_TASK_STORE_UNAVAILABLE", "A2A task state could not be persisted.");
  }
  return dbTask(result.data as Record<string, unknown>);
}

export async function sendA2AMessage(input: {
  principal: CommercialPrincipal;
  request: A2ASendMessageRequest;
}) {
  if (input.request.message.role !== "ROLE_USER") {
    throw new A2AServiceError(400, "A2A_USER_ROLE_REQUIRED", "Inbound message/send requires ROLE_USER.");
  }
  if (input.request.configuration?.returnImmediately === true) {
    throw new A2AServiceError(
      400,
      "A2A_ASYNC_RETURN_NOT_SUPPORTED",
      "returnImmediately is not enabled until a durable background worker is configured.",
    );
  }
  const modes = input.request.configuration?.acceptedOutputModes;
  if (modes?.length && !modes.includes("application/json")) {
    throw new A2AServiceError(406, "A2A_OUTPUT_MODE_NOT_ACCEPTABLE", "Geomacro A2A risk_preflight returns application/json.");
  }

  const riskInput = extractA2ARiskPreflightInput(input.request.message);
  const prepared = await prepareTask({
    principal: input.principal,
    request: input.request,
    riskInput,
  });
  if (prepared.replay) {
    const history = await loadTaskHistory(
      prepared.task.id,
      input.principal.principal_id,
      input.request.configuration?.historyLength ?? 20,
    );
    return publicTask(prepared.task, history);
  }

  let task = prepared.task;
  const intelligenceRequest = toIntelligenceRequest(task.id, riskInput);

  try {
    await preflightTestnetIntelligenceAvailability(intelligenceRequest);
    const entitlement = await resolveCommercialEntitlementForCapability({
      principal: input.principal,
      capability: "risk_gate_bundle",
    });
    const policy = structuredDeliveryPolicy(entitlement.tier, "risk_gate_bundle");
    if (!policy.allowed || !entitlement.policy.allowed || !policy.product.subject_types.includes(riskInput.subject.type)) {
      throw new CommercialAccessError(403, "CAPABILITY_NOT_INCLUDED", "Risk Gate is not included in this Geomacro entitlement.");
    }

    let usage: CommercialCreditResult;
    let paymentEventId: string | null = null;
    let payment: Record<string, unknown> | null = null;

    if (entitlement.tier === "testnet_tester") {
      const settlement = await settleTestnetApiCall({
        principal: input.principal,
        entitlement,
        request_id: task.id,
        capability: "risk_gate_bundle",
        payment: riskInput.payment,
      });
      if (settlement.status === "payment_required") {
        const message = statusAgentMessage(task.id, task.context_id, {
          code: "TESTNET_PAYMENT_REQUIRED",
          message: "Pay the quoted Testnet USDC amount, then send another ROLE_USER message on this same taskId with the payment proof.",
          payment: settlement.quote,
          execution_authorized: false,
        });
        await persistMessage({
          principalId: input.principal.principal_id,
          taskId: task.id,
          message,
        });
        task = await updateTask({
          task,
          state: "TASK_STATE_INPUT_REQUIRED",
          output: {
            status_message: message,
            payment: settlement.quote,
            execution_authorized: false,
          },
        });
        await audit({
          taskId: task.id,
          principalId: input.principal.principal_id,
          direction: "inbound",
          eventType: "payment_input_required",
          requestHash: task.request_sha256,
          responseHash: task.response_sha256,
          metadata: { capability: "risk_gate_bundle", execution_authorized: false },
        });
        await deliverPushNotifications(task);
        const history = await loadTaskHistory(task.id, input.principal.principal_id, input.request.configuration?.historyLength ?? 20);
        return publicTask(task, history);
      }
      usage = settlement.usage;
      paymentEventId = settlement.payment.payment_event_id;
      payment = settlement.payment;
    } else {
      await ensureCommercialCreditAccount({ principal: input.principal, tier: entitlement.tier });
      usage = await consumeCommercialCapability({
        principal: input.principal,
        entitlement,
        requestId: task.id,
        capability: "risk_gate_bundle",
      });
    }

    const delivery = await runCanonicalTestnetIntelligence({
      request: intelligenceRequest,
      max_structural_observations: policy.tier.max_structural_observations,
      max_evidence_references: policy.tier.max_evidence_references,
    });
    assertExecutionBoundary(delivery.data);

    const artifact = {
      artifactId: randomUUID(),
      name: "geomacro-risk-preflight",
      description: "Geomacro Risk Gate preflight result. Advisory/read-only; execution_authorized is always false.",
      parts: [
        {
          data: delivery.data,
          mediaType: "application/json",
        },
      ],
      metadata: {
        capability: "risk_gate_bundle",
        response_sha256: sha256Json(delivery.data),
        execution_authorized: false,
      },
    };
    const message = statusAgentMessage(task.id, task.context_id, {
      code: "RISK_PREFLIGHT_COMPLETED",
      message: "Geomacro Risk Gate preflight completed.",
      execution_authorized: false,
    });
    await persistMessage({ principalId: input.principal.principal_id, taskId: task.id, message });
    task = await updateTask({
      task,
      state: "TASK_STATE_COMPLETED",
      output: {
        status_message: message,
        artifacts: [artifact],
        ...(payment ? { payment } : {}),
        execution_authorized: false,
      },
      completed: true,
    });

    try {
      await recordCommercialUsageEvent({
        environment: entitlement.tier === "testnet_tester" ? "testnet" : "internal",
        access_surface: entitlement.tier === "testnet_tester" ? "testnet_tester" : "agent_payment",
        principal_id: input.principal.principal_id,
        principal_type: input.principal.principal_type,
        entitlement_grant_id: entitlement.grant_id,
        payment_event_id: paymentEventId,
        offer_id: entitlement.policy.offer_id,
        tier: entitlement.tier,
        registry_version: policy.registry_version,
        contract_version: policy.credit_contract_version,
        request_id: task.id,
        delivery_id: artifact.artifactId,
        capability: "risk_gate_bundle",
        subject_type: delivery.subject_type,
        subject_key: delivery.subject_key,
        credits_charged: usage.idempotent_replay ? 0 : usage.credit_cost ?? 15,
        credits_remaining: usage.credits_remaining ?? null,
        idempotent_replay: usage.idempotent_replay ?? false,
        http_status: 200,
        success: true,
        response_sha256: sha256Json(delivery.data),
        response_bytes: new TextEncoder().encode(JSON.stringify(delivery.data)).byteLength,
        structural_observation_count: delivery.structural_observation_count,
        evidence_reference_count: delivery.evidence_reference_count,
        risk_object_signed: true,
        risk_gate_included: true,
        risk_gate_decision:
          delivery.data.risk_gate && typeof delivery.data.risk_gate === "object"
            ? String((delivery.data.risk_gate as Record<string, unknown>).decision ?? "") || null
            : null,
        execution_authorized: false,
        shareable: false,
        metadata: {
          a2a_protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
          a2a_task_id: task.id,
          execution_authorized: false,
        },
      });
    } catch (error) {
      console.error("[a2a] commercial usage evidence write failed", error);
    }

    await audit({
      taskId: task.id,
      principalId: input.principal.principal_id,
      direction: "inbound",
      eventType: "task_completed",
      requestHash: task.request_sha256,
      responseHash: task.response_sha256,
      metadata: { capability: "risk_gate_bundle", execution_authorized: false },
    });
    await deliverPushNotifications(task);
    const history = await loadTaskHistory(task.id, input.principal.principal_id, input.request.configuration?.historyLength ?? 20);
    return publicTask(task, history);
  } catch (error) {
    const normalized = normalizeA2AError(error);
    const message = statusAgentMessage(task.id, task.context_id, {
      code: normalized.code,
      message: normalized.message,
      execution_authorized: false,
    });
    try {
      await persistMessage({ principalId: input.principal.principal_id, taskId: task.id, message });
      task = await updateTask({
        task,
        state: normalized.status >= 500 ? "TASK_STATE_FAILED" : "TASK_STATE_REJECTED",
        output: { status_message: message, execution_authorized: false },
        error: { code: normalized.code, message: normalized.message },
        completed: true,
      });
      await audit({
        taskId: task.id,
        principalId: input.principal.principal_id,
        direction: "inbound",
        eventType: "task_failed_closed",
        requestHash: task.request_sha256,
        responseHash: task.response_sha256,
        metadata: { code: normalized.code, http_status: normalized.status, execution_authorized: false },
      });
      await deliverPushNotifications(task);
    } catch (persistError) {
      console.error("[a2a] failed task persistence failed", persistError);
    }
    throw new A2AServiceError(normalized.status, normalized.code, normalized.message);
  }
}

export async function getA2ATask(input: {
  principal: CommercialPrincipal;
  taskId: string;
  historyLength?: number;
}) {
  const task = await loadTaskRow(input.principal.principal_id, input.taskId);
  const history = await loadTaskHistory(task.id, input.principal.principal_id, input.historyLength ?? 20);
  return publicTask(task, history);
}

export async function listA2ATasks(input: {
  principal: CommercialPrincipal;
  limit?: number;
  state?: string | null;
}) {
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 20)));
  if (input.state && !A2A_TASK_STATES.includes(input.state as A2ATaskState)) {
    throw new A2AServiceError(400, "A2A_TASK_STATE_INVALID", "Invalid A2A task state filter.");
  }
  const db = requireRiskSupabase();
  let query = db
    .from("a2a_tasks")
    .select("*")
    .eq("principal_id", input.principal.principal_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (input.state) query = query.eq("state", input.state);
  const result = await query;
  if (result.error) throw new A2AServiceError(503, "A2A_TASK_STORE_UNAVAILABLE", "A2A tasks are temporarily unavailable.");
  return {
    tasks: (result.data ?? []).map((row) => publicTask(dbTask(row as Record<string, unknown>))),
    nextPageToken: null,
    pageSize: limit,
    totalSize: (result.data ?? []).length,
  };
}

export async function cancelA2ATask(input: {
  principal: CommercialPrincipal;
  taskId: string;
}) {
  let task = await loadTaskRow(input.principal.principal_id, input.taskId);
  if (isTerminalState(task.state)) {
    if (task.state === "TASK_STATE_CANCELED") return publicTask(task);
    throw new A2AServiceError(409, "A2A_TASK_NOT_CANCELABLE", "A terminal A2A task cannot be canceled.");
  }
  const message = statusAgentMessage(task.id, task.context_id, {
    code: "TASK_CANCELED",
    message: "A2A task canceled by the authenticated caller.",
    execution_authorized: false,
  });
  await persistMessage({ principalId: input.principal.principal_id, taskId: task.id, message });
  const db = requireRiskSupabase();
  const result = await db
    .from("a2a_tasks")
    .update({
      state: "TASK_STATE_CANCELED",
      canceled_at: nowIso(),
      completed_at: nowIso(),
      output_json: { status_message: message, execution_authorized: false },
      response_sha256: sha256Json(message),
    })
    .eq("id", task.id)
    .eq("principal_id", input.principal.principal_id)
    .select("*")
    .single();
  if (result.error || !result.data) throw new A2AServiceError(503, "A2A_TASK_STORE_UNAVAILABLE", "A2A task could not be canceled.");
  task = dbTask(result.data as Record<string, unknown>);
  await audit({
    taskId: task.id,
    principalId: input.principal.principal_id,
    direction: "inbound",
    eventType: "task_canceled",
    responseHash: task.response_sha256,
  });
  await deliverPushNotifications(task);
  return publicTask(task);
}

export async function createA2APushConfig(input: {
  principal: CommercialPrincipal;
  taskId: string;
  config: unknown;
}) {
  await loadTaskRow(input.principal.principal_id, input.taskId);
  const config = a2aPushNotificationConfigSchema.parse({
    ...(input.config as Record<string, unknown>),
    taskId: input.taskId,
  });
  return publicPushConfig(
    await configurePushNotification({
      principalId: input.principal.principal_id,
      taskId: input.taskId,
      config,
    }),
  );
}

export async function listA2APushConfigs(input: {
  principal: CommercialPrincipal;
  taskId: string;
}) {
  await loadTaskRow(input.principal.principal_id, input.taskId);
  const db = requireRiskSupabase();
  const result = await db
    .from("a2a_push_notification_configs")
    .select("id,task_id,callback_url,callback_token,enabled,created_at,updated_at")
    .eq("task_id", input.taskId)
    .eq("principal_id", input.principal.principal_id)
    .eq("enabled", true)
    .order("created_at", { ascending: true });
  if (result.error) throw new A2AServiceError(503, "A2A_PUSH_CONFIG_UNAVAILABLE", "A2A push notification configurations are temporarily unavailable.");
  return (result.data ?? []).map((row) => publicPushConfig(row as Record<string, unknown>));
}

export async function getA2APushConfig(input: {
  principal: CommercialPrincipal;
  taskId: string;
  configId: string;
}) {
  await loadTaskRow(input.principal.principal_id, input.taskId);
  const db = requireRiskSupabase();
  const result = await db
    .from("a2a_push_notification_configs")
    .select("id,task_id,callback_url,callback_token,enabled,created_at,updated_at")
    .eq("id", input.configId)
    .eq("task_id", input.taskId)
    .eq("principal_id", input.principal.principal_id)
    .eq("enabled", true)
    .maybeSingle();
  if (result.error) throw new A2AServiceError(503, "A2A_PUSH_CONFIG_UNAVAILABLE", "A2A push notification configuration is temporarily unavailable.");
  if (!result.data) throw new A2AServiceError(404, "A2A_PUSH_CONFIG_NOT_FOUND", "A2A push notification configuration not found.");
  return publicPushConfig(result.data as Record<string, unknown>);
}

export async function deleteA2APushConfig(input: {
  principal: CommercialPrincipal;
  taskId: string;
  configId: string;
}) {
  await loadTaskRow(input.principal.principal_id, input.taskId);
  const db = requireRiskSupabase();
  const result = await db
    .from("a2a_push_notification_configs")
    .update({ enabled: false, callback_token: null })
    .eq("id", input.configId)
    .eq("task_id", input.taskId)
    .eq("principal_id", input.principal.principal_id)
    .select("id")
    .maybeSingle();
  if (result.error) throw new A2AServiceError(503, "A2A_PUSH_CONFIG_UNAVAILABLE", "A2A push notification configuration could not be removed.");
  if (!result.data) throw new A2AServiceError(404, "A2A_PUSH_CONFIG_NOT_FOUND", "A2A push notification configuration not found.");
  return { ok: true };
}
