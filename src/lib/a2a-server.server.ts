import { randomUUID } from "node:crypto";
import { ZodError } from "zod";

import {
  a2aCreatePushConfigParamsSchema,
  a2aDeletePushConfigParamsSchema,
  a2aJsonRpcError,
  a2aJsonRpcSuccess,
  a2aListTasksParamsSchema,
  a2aPushConfigLookupSchema,
  a2aSendMessageParamsSchema,
  a2aTaskIdParamsSchema,
  geomacroA2AAgentCard,
  riskPreflightFromMessage,
  type A2AMessage,
} from "./a2a-contract";
import {
  authenticateCommercialApiRequest,
  CommercialAccessError,
  consumeCommercialCapability,
  ensureCommercialCreditAccount,
  resolveCommercialEntitlementForCapability,
  type CommercialPrincipal,
} from "./commercial-access.server";
import {
  isCircleX402Configured,
  circleX402PaymentRequiredResponse,
  circleX402PaymentResponseHeader,
  persistSettlementTelemetry,
  settleCircleX402,
} from "./circle-x402.server";
import { assertNoExecutionAuthorization, runA2ARiskPreflight } from "./a2a-risk-preflight.server";
import {
  cancelA2ATask,
  createA2APushConfig,
  createA2ATask,
  deleteA2APushConfig,
  getA2APushConfig,
  getA2ATask,
  listA2APushConfigs,
  listA2ATasks,
  transitionA2ATask,
  type A2AStoredTask,
} from "./a2a-store.server";
import { deliverA2ATaskPush, publicA2APushConfig, validateA2APushConfig } from "./a2a-push.server";

export class A2AProtocolError extends Error {
  constructor(
    readonly rpcCode: number,
    readonly httpStatus: number,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "A2AProtocolError";
  }
}

function taskView(row: A2AStoredTask, historyLength?: number) {
  const payload = row.task_payload ?? {
    id: row.id,
    contextId: row.context_id,
    status: { state: row.state, timestamp: row.updated_at },
  };
  const history = Array.isArray(row.history) ? row.history : [];
  const limited =
    historyLength === 0
      ? undefined
      : historyLength === undefined
        ? history
        : history.slice(Math.max(0, history.length - historyLength));
  return {
    ...payload,
    id: row.id,
    contextId: row.context_id,
    status: {
      ...((payload.status as Record<string, unknown> | undefined) ?? {}),
      state: row.state,
      timestamp: row.updated_at,
    },
    ...(limited === undefined ? { history: undefined } : { history: limited }),
  };
}

function agentMessage(input: {
  contextId: string;
  taskId?: string;
  data: Record<string, unknown>;
}): A2AMessage {
  assertNoExecutionAuthorization(input.data);
  return {
    role: "ROLE_AGENT",
    messageId: `msg_${randomUUID()}`,
    contextId: input.contextId,
    ...(input.taskId ? { taskId: input.taskId } : {}),
    parts: [{ data: input.data, mediaType: "application/json" }],
  };
}

function completedTask(input: {
  taskId: string;
  contextId: string;
  result: Record<string, unknown>;
  userMessage: A2AMessage;
  agentMessage: A2AMessage;
}) {
  assertNoExecutionAuthorization(input.result);
  return {
    id: input.taskId,
    contextId: input.contextId,
    status: {
      state: "TASK_STATE_COMPLETED" as const,
      timestamp: new Date().toISOString(),
    },
    artifacts: [
      {
        artifactId: `artifact_${randomUUID()}`,
        name: "geomacro-risk-preflight.json",
        description: "Geomacro signed risk pre-flight and Risk Gate decision context.",
        parts: [{ data: input.result, mediaType: "application/json" }],
        metadata: { execution_authorized: false },
      },
    ],
    history: [input.userMessage, input.agentMessage],
    metadata: {
      skill: "risk_preflight",
      protocolVersion: "1.0",
      execution_authorized: false,
    },
  };
}

function streamResponseForTask(task: Record<string, unknown>) {
  return {
    task,
    metadata: { source: "geomacro", execution_authorized: false },
  };
}

async function commercialPrincipal(request: Request) {
  return authenticateCommercialApiRequest(request);
}

async function prepareCommercialAccess(principal: CommercialPrincipal) {
  const entitlement = await resolveCommercialEntitlementForCapability({
    principal,
    capability: "risk_gate_bundle",
  });
  if (entitlement.tier === "testnet_tester") {
    throw new CommercialAccessError(
      403,
      "A2A_COMMERCIAL_OR_X402_REQUIRED",
      "Testnet developer credentials cannot bypass the A2A payment boundary. Use a commercial entitlement or the Arc Testnet x402 technical-proof path.",
    );
  }
  await ensureCommercialCreditAccount({ principal, tier: entitlement.tier });
  return entitlement;
}

async function commercialSendMessage(request: Request, paramsRaw: unknown) {
  const principal = await commercialPrincipal(request);
  const entitlement = await prepareCommercialAccess(principal);
  const params = a2aSendMessageParamsSchema.parse(paramsRaw);
  const accepted = params.configuration?.acceptedOutputModes;
  if (accepted?.length && !accepted.includes("application/json")) {
    throw new A2AProtocolError(-32005, 400, "ContentTypeNotSupportedError");
  }
  if (params.configuration?.taskPushNotificationConfig?.taskId) {
    throw new A2AProtocolError(-32602, 400, "Invalid params", {
      detail: "taskPushNotificationConfig.taskId must be omitted when sent with SendMessage.",
    });
  }
  if (params.message.taskId) {
    const prior = await getA2ATask({ taskId: params.message.taskId, principalId: principal.principal_id });
    if (!prior) throw new A2AProtocolError(-32001, 404, "TaskNotFoundError");
    throw new A2AProtocolError(-32004, 400, "UnsupportedOperationError", {
      detail: "Geomacro risk_preflight tasks are immutable after completion. Start a new task in the same contextId for a refreshed risk decision.",
    });
  }

  const riskInput = riskPreflightFromMessage(params.message);
  const created = await createA2ATask({
    principalId: principal.principal_id,
    message: params.message,
    requestPayload: params as unknown as Record<string, unknown>,
  });
  if (created.replay && created.task.task_payload) {
    return { task: taskView(created.task, params.configuration?.historyLength) };
  }

  let working = created.task;
  if (working.state === "TASK_STATE_SUBMITTED") {
    working = await transitionA2ATask({
      taskId: working.id,
      principalId: principal.principal_id,
      state: "TASK_STATE_WORKING",
      eventType: "TASK_WORKING",
    });
  }

  try {
    const result = await runA2ARiskPreflight(riskInput, { requestId: working.id });
    assertNoExecutionAuthorization(result);
    await consumeCommercialCapability({
      principal,
      entitlement,
      requestId: working.id,
      capability: "risk_gate_bundle",
    });

    const reply = agentMessage({
      contextId: working.context_id,
      taskId: working.id,
      data: result as unknown as Record<string, unknown>,
    });
    const task = completedTask({
      taskId: working.id,
      contextId: working.context_id,
      result: result as unknown as Record<string, unknown>,
      userMessage: params.message,
      agentMessage: reply,
    });
    const completed = await transitionA2ATask({
      taskId: working.id,
      principalId: principal.principal_id,
      state: "TASK_STATE_COMPLETED",
      taskPayload: task,
      appendHistory: reply,
      eventType: "TASK_COMPLETED",
    });

    const pushConfig = params.configuration?.taskPushNotificationConfig;
    if (pushConfig) {
      const callback = validateA2APushConfig(pushConfig);
      const stored = await createA2APushConfig({
        principalId: principal.principal_id,
        taskId: working.id,
        config: pushConfig,
        callbackOrigin: callback.origin,
      });
      await deliverA2ATaskPush({
        principalId: principal.principal_id,
        taskId: working.id,
        configId: String(stored.id),
        config: pushConfig,
        streamResponse: streamResponseForTask(task),
      });
    }

    return { task: taskView(completed, params.configuration?.historyLength) };
  } catch (error) {
    await transitionA2ATask({
      taskId: working.id,
      principalId: principal.principal_id,
      state: "TASK_STATE_FAILED",
      taskPayload: {
        id: working.id,
        contextId: working.context_id,
        status: { state: "TASK_STATE_FAILED", timestamp: new Date().toISOString() },
        metadata: { execution_authorized: false },
      },
      eventType: "TASK_FAILED",
    }).catch(() => undefined);
    throw error;
  }
}

async function x402SendMessage(request: Request, paramsRaw: unknown) {
  if (!isCircleX402Configured()) {
    throw new A2AProtocolError(
      -32004,
      503,
      "A2A authentication is required and the x402 technical-proof path is not configured.",
    );
  }
  const params = a2aSendMessageParamsSchema.parse(paramsRaw);
  if (params.configuration?.taskPushNotificationConfig) {
    throw new A2AProtocolError(-32004, 400, "UnsupportedOperationError", {
      detail: "x402 one-shot A2A responses do not create persistent tasks or callback registrations.",
    });
  }
  const riskInput = riskPreflightFromMessage(params.message);
  if (!request.headers.get("payment-signature")) {
    return { paymentRequired: circleX402PaymentRequiredResponse(request) } as const;
  }

  const settlement = await settleCircleX402(request);
  const telemetryId = randomUUID();
  const result = await runA2ARiskPreflight(riskInput, { requestId: telemetryId });
  assertNoExecutionAuthorization(result);
  await persistSettlementTelemetry({
    requestId: telemetryId,
    payer: settlement.payer,
    settlementReference: settlement.settlement_reference,
  });
  const contextId = params.message.contextId ?? `ctx_${randomUUID()}`;
  const message = agentMessage({
    contextId,
    data: {
      ...result,
      payment: {
        required: true,
        provider: "circle_gateway_x402",
        asset: "USDC",
        network: settlement.network,
        amount_atomic: settlement.amount_atomic,
        amount_usdc: settlement.amount_usdc,
        payer: settlement.payer,
        settlement_reference: settlement.settlement_reference,
        commercial_revenue: false,
      },
    },
  });
  return { message, paymentResponse: circleX402PaymentResponseHeader(settlement) } as const;
}

function authHeadersPresent(request: Request) {
  return Boolean(
    request.headers.get("authorization") ||
      request.headers.get("x-geomacro-api-key") ||
      request.headers.get("x-geomacro-api-secret"),
  );
}

async function handleAuthenticatedMethod(request: Request, method: string, paramsRaw: unknown) {
  const principal = await commercialPrincipal(request);

  if (method === "GetTask") {
    const params = a2aTaskIdParamsSchema.parse(paramsRaw);
    const task = await getA2ATask({ taskId: params.id, principalId: principal.principal_id });
    if (!task) throw new A2AProtocolError(-32001, 404, "TaskNotFoundError");
    return taskView(task, params.historyLength);
  }

  if (method === "ListTasks") {
    const params = a2aListTasksParamsSchema.parse(paramsRaw ?? {});
    const listed = await listA2ATasks({
      principalId: principal.principal_id,
      pageSize: params.pageSize,
      pageToken: params.pageToken,
      contextId: params.contextId,
      state: params.status,
    });
    return {
      tasks: listed.tasks.map((task) => taskView(task, params.historyLength)),
      nextPageToken: listed.nextPageToken,
    };
  }

  if (method === "CancelTask") {
    const params = a2aTaskIdParamsSchema.parse(paramsRaw);
    const canceled = await cancelA2ATask({ taskId: params.id, principalId: principal.principal_id });
    if (canceled.code === "NOT_FOUND") throw new A2AProtocolError(-32001, 404, "TaskNotFoundError");
    if (canceled.code === "NOT_CANCELABLE") throw new A2AProtocolError(-32002, 400, "TaskNotCancelableError");
    return taskView(canceled.task!, params.historyLength);
  }

  if (method === "CreateTaskPushNotificationConfig") {
    const params = a2aCreatePushConfigParamsSchema.parse(paramsRaw);
    const task = await getA2ATask({ taskId: params.taskId, principalId: principal.principal_id });
    if (!task) throw new A2AProtocolError(-32001, 404, "TaskNotFoundError");
    const callback = validateA2APushConfig(params);
    const stored = await createA2APushConfig({
      principalId: principal.principal_id,
      taskId: params.taskId,
      config: params,
      callbackOrigin: callback.origin,
    });
    if (task.task_payload) {
      await deliverA2ATaskPush({
        principalId: principal.principal_id,
        taskId: params.taskId,
        configId: String(stored.id),
        config: params,
        streamResponse: streamResponseForTask(taskView(task) as Record<string, unknown>),
      });
    }
    return publicA2APushConfig(stored);
  }

  if (method === "GetTaskPushNotificationConfig") {
    const params = a2aPushConfigLookupSchema.parse(paramsRaw);
    const task = await getA2ATask({ taskId: params.taskId, principalId: principal.principal_id });
    if (!task) throw new A2AProtocolError(-32001, 404, "TaskNotFoundError");
    const config = await getA2APushConfig({ principalId: principal.principal_id, taskId: params.taskId, id: params.id });
    if (!config) {
      throw new A2AProtocolError(-32001, 404, "TaskNotFoundError", {
        detail: "Push notification configuration not found.",
      });
    }
    return publicA2APushConfig(config);
  }

  if (method === "ListTaskPushNotificationConfigs") {
    const params = a2aPushConfigLookupSchema.omit({ id: true }).parse(paramsRaw);
    const task = await getA2ATask({ taskId: params.taskId, principalId: principal.principal_id });
    if (!task) throw new A2AProtocolError(-32001, 404, "TaskNotFoundError");
    const configs = await listA2APushConfigs({ principalId: principal.principal_id, taskId: params.taskId });
    return { configs: configs.map(publicA2APushConfig) };
  }

  if (method === "DeleteTaskPushNotificationConfig") {
    const params = a2aDeletePushConfigParamsSchema.parse(paramsRaw);
    const task = await getA2ATask({ taskId: params.taskId, principalId: principal.principal_id });
    if (!task) throw new A2AProtocolError(-32001, 404, "TaskNotFoundError");
    await deleteA2APushConfig({ principalId: principal.principal_id, taskId: params.taskId, id: params.id });
    return {};
  }

  if (method === "GetExtendedAgentCard") {
    throw new A2AProtocolError(-32004, 400, "UnsupportedOperationError");
  }

  throw new A2AProtocolError(-32601, 404, "Method not found");
}

export type A2AHttpResult = {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
};

export async function handleA2AJsonRpc(input: {
  request: Request;
  rpc: { jsonrpc: "2.0"; id: string | number; method: string; params?: unknown };
}): Promise<A2AHttpResult> {
  const version = input.request.headers.get("a2a-version")?.trim();
  if (version && version !== "1.0") {
    return {
      status: 400,
      body: a2aJsonRpcError(input.rpc.id, -32009, "VersionNotSupportedError", {
        supportedVersions: ["1.0"],
      }),
    };
  }

  try {
    let result: unknown;
    let headers: Record<string, string> | undefined;

    if (input.rpc.method === "SendStreamingMessage" || input.rpc.method === "SubscribeToTask") {
      throw new A2AProtocolError(-32004, 400, "UnsupportedOperationError", {
        detail: "Streaming is not advertised by this Agent Card.",
      });
    }

    if (input.rpc.method === "SendMessage") {
      if (authHeadersPresent(input.request)) {
        result = await commercialSendMessage(input.request, input.rpc.params);
      } else {
        const x402 = await x402SendMessage(input.request, input.rpc.params);
        if ("paymentRequired" in x402) {
          const required = x402.paymentRequired;
          const paymentRequired = required.headers.get("PAYMENT-REQUIRED");
          return {
            status: 402,
            body: a2aJsonRpcError(input.rpc.id, -32042, "Payment required", {
              provider: "circle_gateway_x402",
              network: "eip155:5042002",
              technical_proof_only: true,
              execution_authorized: false,
            }),
            headers: paymentRequired ? { "PAYMENT-REQUIRED": paymentRequired } : undefined,
          };
        }
        result = { message: x402.message };
        headers = { "PAYMENT-RESPONSE": x402.paymentResponse };
      }
    } else {
      result = await handleAuthenticatedMethod(input.request, input.rpc.method, input.rpc.params);
    }

    assertNoExecutionAuthorization(result);
    return { status: 200, body: a2aJsonRpcSuccess(input.rpc.id, result), headers };
  } catch (error) {
    if (error instanceof A2AProtocolError) {
      return { status: error.httpStatus, body: a2aJsonRpcError(input.rpc.id, error.rpcCode, error.message, error.data) };
    }
    if (error instanceof CommercialAccessError) {
      return {
        status: error.status,
        body: a2aJsonRpcError(input.rpc.id, error.status === 401 ? -32040 : -32041, error.message, {
          code: error.code,
          execution_authorized: false,
        }),
      };
    }
    if (error instanceof ZodError) {
      return {
        status: 400,
        body: a2aJsonRpcError(input.rpc.id, -32602, "Invalid params", {
          issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        }),
      };
    }
    const message = error instanceof Error ? error.message : "A2A request failed";
    if (
      message === "A2A_RISK_PREFLIGHT_REQUIRES_APPLICATION_JSON" ||
      message === "A2A_RISK_PREFLIGHT_REQUIRES_ONE_DATA_PART"
    ) {
      return { status: 400, body: a2aJsonRpcError(input.rpc.id, -32005, "ContentTypeNotSupportedError") };
    }
    if (message === "A2A_MESSAGE_ID_CONFLICT") {
      return {
        status: 409,
        body: a2aJsonRpcError(input.rpc.id, -32602, "messageId was already used for a different request"),
      };
    }
    console.error("[a2a] request failed", error);
    return {
      status: 503,
      body: a2aJsonRpcError(input.rpc.id, -32603, "Internal error", { execution_authorized: false }),
    };
  }
}

export function publicA2AAgentCard() {
  return geomacroA2AAgentCard("https://geomacro.live");
}
