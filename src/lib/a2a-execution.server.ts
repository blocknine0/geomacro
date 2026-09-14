import {
  CommercialAccessError,
} from "./commercial-access.server";
import {
  A2AProtocolError,
  type VerifiedA2AIdentity,
} from "./a2a-signature.server";
import {
  executeA2ATask,
  recordA2AAudit,
} from "./a2a-service.server";
import type { A2ATaskRequest } from "./a2a-contract";
import type { CircleX402Settlement } from "./circle-x402.server";
import { requireRiskSupabase } from "./risk-supabase.server";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function classifyRetryable(error: unknown) {
  if (error instanceof A2AProtocolError || error instanceof CommercialAccessError) {
    return error.status === 429 || error.status >= 500;
  }

  const code = error instanceof Error ? error.message : "";
  if (
    code === "SUBJECT_REQUIRED" ||
    code === "A2A_RISK_GATE_EXECUTION_BOUNDARY_VIOLATION" ||
    code === "RISK_GATE_EXECUTION_BOUNDARY_VIOLATION"
  ) {
    return false;
  }

  return true;
}

export async function executeRetryableA2ATask(input: {
  identity: VerifiedA2AIdentity;
  task: A2ATaskRequest;
  taskId: string;
  x402Settlement?: CircleX402Settlement | null;
}) {
  const db = requireRiskSupabase();
  const current = await db
    .from("a2a_tasks")
    .select("status,error_json")
    .eq("id", input.taskId)
    .eq("principal_id", input.identity.principal_id)
    .eq("agent_identity_id", input.identity.id)
    .maybeSingle();

  if (current.error || !current.data) {
    throw new A2AProtocolError(
      404,
      "A2A_TASK_NOT_FOUND",
      "A2A task was not found.",
    );
  }

  if (current.data.status === "failed") {
    const priorError = asRecord(current.data.error_json);
    if (priorError?.retryable !== true) {
      throw new A2AProtocolError(
        409,
        "A2A_TASK_ALREADY_FAILED",
        "This idempotent A2A task is already in a non-retryable failed state.",
      );
    }

    const reset = await db
      .from("a2a_tasks")
      .update({
        status: "accepted",
        error_json: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.taskId)
      .eq("principal_id", input.identity.principal_id)
      .eq("agent_identity_id", input.identity.id)
      .eq("status", "failed");
    if (reset.error) {
      throw new A2AProtocolError(
        503,
        "A2A_TASK_RETRY_UNAVAILABLE",
        "A2A task retry state could not be persisted.",
      );
    }

    await recordA2AAudit({
      taskId: input.taskId,
      principalId: input.identity.principal_id,
      identityId: input.identity.id,
      eventType: "task.retrying",
      details: {
        prior_code: String(priorError?.code ?? "A2A_TASK_FAILED"),
        payment_mode: input.task.payment_mode,
      },
    });
  }

  try {
    return await executeA2ATask(input);
  } catch (error) {
    const retryable = classifyRetryable(error);
    const code = error instanceof A2AProtocolError || error instanceof CommercialAccessError
      ? error.code
      : error instanceof Error
        ? error.message.slice(0, 120)
        : "A2A_TASK_FAILED";

    const row = await db
      .from("a2a_tasks")
      .select("status,error_json")
      .eq("id", input.taskId)
      .eq("principal_id", input.identity.principal_id)
      .eq("agent_identity_id", input.identity.id)
      .maybeSingle();

    if (!row.error && row.data?.status === "failed") {
      const priorError = asRecord(row.data.error_json) ?? {};
      const patch = await db
        .from("a2a_tasks")
        .update({
          error_json: {
            ...priorError,
            code,
            retryable,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.taskId)
        .eq("principal_id", input.identity.principal_id)
        .eq("agent_identity_id", input.identity.id)
        .eq("status", "failed");
      if (patch.error) {
        console.error("[a2a] retryability persistence failed", patch.error);
      }
    }

    await recordA2AAudit({
      taskId: input.taskId,
      principalId: input.identity.principal_id,
      identityId: input.identity.id,
      eventType: "task.retryability_classified",
      details: { code, retryable },
    });

    throw error;
  }
}
