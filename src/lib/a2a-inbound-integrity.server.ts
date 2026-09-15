import { createHash } from "node:crypto";

import {
  a2aMessageSchema,
  type A2AMessage,
} from "./a2a-contract";
import { A2AServiceError } from "./a2a-service.server";
import { requireRiskSupabase } from "./risk-supabase.server";

function canonicalComparableMessage(message: A2AMessage) {
  const {
    taskId: _taskId,
    contextId: _contextId,
    ...rest
  } = message;
  return rest;
}

function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function assertA2AMessageIdempotency(input: {
  principalId: string;
  message: A2AMessage;
}) {
  const db = requireRiskSupabase();
  const result = await db
    .from("a2a_messages")
    .select("task_id,payload")
    .eq("principal_id", input.principalId)
    .eq("message_id", input.message.messageId)
    .maybeSingle();

  if (result.error) {
    throw new A2AServiceError(
      503,
      "A2A_MESSAGE_STORE_UNAVAILABLE",
      "A2A message storage is temporarily unavailable.",
    );
  }
  if (!result.data) return;

  let stored: A2AMessage;
  try {
    stored = a2aMessageSchema.parse(result.data.payload);
  } catch {
    throw new A2AServiceError(
      503,
      "A2A_MESSAGE_INTEGRITY_UNAVAILABLE",
      "Stored A2A message integrity could not be verified.",
    );
  }

  if (input.message.taskId && stored.taskId && input.message.taskId !== stored.taskId) {
    throw new A2AServiceError(
      409,
      "A2A_MESSAGE_ID_CONFLICT",
      "This messageId is already bound to a different A2A task.",
    );
  }
  if (
    input.message.contextId &&
    stored.contextId &&
    input.message.contextId !== stored.contextId
  ) {
    throw new A2AServiceError(
      409,
      "A2A_MESSAGE_ID_CONFLICT",
      "This messageId is already bound to a different A2A context.",
    );
  }

  const existingHash = sha256Json(canonicalComparableMessage(stored));
  const presentedHash = sha256Json(canonicalComparableMessage(input.message));
  if (existingHash !== presentedHash) {
    throw new A2AServiceError(
      409,
      "A2A_MESSAGE_ID_CONFLICT",
      "This messageId was already used with a different payload.",
    );
  }
}

export async function loadLatestA2AMessageHistory(input: {
  principalId: string;
  taskId: string;
  limit: number;
}) {
  const bounded = Math.max(0, Math.min(50, Math.trunc(input.limit)));
  if (bounded === 0) return [] as A2AMessage[];

  const db = requireRiskSupabase();
  const result = await db
    .from("a2a_messages")
    .select("payload,created_at")
    .eq("task_id", input.taskId)
    .eq("principal_id", input.principalId)
    .order("created_at", { ascending: false })
    .limit(bounded);

  if (result.error) {
    throw new A2AServiceError(
      503,
      "A2A_MESSAGE_STORE_UNAVAILABLE",
      "A2A message history is temporarily unavailable.",
    );
  }

  return (result.data ?? [])
    .slice()
    .reverse()
    .map((row) => {
      try {
        return a2aMessageSchema.parse(row.payload);
      } catch {
        throw new A2AServiceError(
          503,
          "A2A_MESSAGE_INTEGRITY_UNAVAILABLE",
          "Stored A2A message history failed integrity validation.",
        );
      }
    });
}
