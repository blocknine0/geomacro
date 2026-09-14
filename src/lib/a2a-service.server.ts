import {
  createHash,
  createPublicKey,
} from "node:crypto";

import {
  a2aIdentityRegistrationSchema,
  a2aTaskRequestSchema,
  GEOMACRO_A2A_PROTOCOL_VERSION,
  type A2AIdentityRegistration,
  type A2ATaskRequest,
} from "./a2a-contract";
import { deliverA2ACallback } from "./a2a-callback.server";
import {
  A2AProtocolError,
  type VerifiedA2AIdentity,
} from "./a2a-signature.server";
import {
  consumeCommercialCapability,
  ensureCommercialCreditAccount,
  resolveCommercialEntitlementForCapability,
  type CommercialPrincipal,
} from "./commercial-access.server";
import { GEOMACRO_CREDIT_COSTS } from "./commercial-access-contract";
import { recordCommercialUsageEvent } from "./commercial-ops.server";
import {
  CIRCLE_X402_ASSET,
  CIRCLE_X402_NETWORK,
  CIRCLE_X402_PRICE_ATOMIC,
  CIRCLE_X402_PRICE_USDC,
  persistSettlementTelemetry,
  type CircleX402Settlement,
} from "./circle-x402.server";
import { requireRiskSupabase } from "./risk-supabase.server";
import { structuredDeliveryPolicy } from "./structured-data-entitlement-registry";
import { runCanonicalTestnetIntelligence } from "./testnet-intelligence-capability.server";
import type { TestnetIntelligenceRequest } from "./testnet-intelligence-contract";

function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeCallbackOrigins(origins: string[]) {
  return [...new Set(origins.map((raw) => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new A2AProtocolError(400, "A2A_CALLBACK_ORIGIN_INVALID", "A2A callback origin is invalid.");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".local")
    ) {
      throw new A2AProtocolError(
        400,
        "A2A_CALLBACK_ORIGIN_INVALID",
        "A2A callback origins must be public HTTPS origins without paths, credentials, query strings or fragments.",
      );
    }
    return url.origin;
  }))];
}

export async function recordA2AAudit(input: {
  taskId?: string | null;
  principalId?: string | null;
  identityId?: string | null;
  eventType: string;
  payloadHash?: string | null;
  details?: Record<string, unknown>;
}) {
  const db = requireRiskSupabase();
  const result = await db.from("a2a_audit_events").insert({
    task_id: input.taskId ?? null,
    principal_id: input.principalId ?? null,
    agent_identity_id: input.identityId ?? null,
    event_type: input.eventType,
    payload_hash: input.payloadHash ?? null,
    details: input.details ?? {},
  });
  if (result.error) {
    console.error("[a2a] audit write failed", result.error);
  }
}

export async function registerA2AIdentity(
  principal: CommercialPrincipal,
  raw: unknown,
) {
  const input = a2aIdentityRegistrationSchema.parse(raw);
  const callbackOrigins = normalizeCallbackOrigins(input.callback_origins);
  const normalizedJwk = {
    kty: input.public_key_jwk.kty,
    crv: input.public_key_jwk.crv,
    x: input.public_key_jwk.x,
  } as const;

  try {
    createPublicKey({ key: normalizedJwk as JsonWebKey, format: "jwk" });
  } catch {
    throw new A2AProtocolError(400, "A2A_PUBLIC_KEY_INVALID", "A2A Ed25519 public key is invalid.");
  }

  const fingerprint = sha256Json(normalizedJwk);
  const db = requireRiskSupabase();
  const existing = await db
    .from("a2a_agent_identities")
    .select("id,principal_id,agent_id")
    .eq("agent_id", input.agent_id)
    .maybeSingle();
  if (existing.error) {
    throw new A2AProtocolError(503, "A2A_IDENTITY_WRITE_UNAVAILABLE", "A2A identity storage is temporarily unavailable.");
  }
  if (existing.data && String(existing.data.principal_id) !== principal.principal_id) {
    throw new A2AProtocolError(409, "A2A_AGENT_ID_TAKEN", "This A2A agent_id is already registered to another principal.");
  }

  const row = {
    principal_id: principal.principal_id,
    agent_id: input.agent_id,
    protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
    public_key_jwk: normalizedJwk,
    public_key_fingerprint: fingerprint,
    callback_origins: callbackOrigins,
    status: "active",
    revoked_at: null,
    updated_at: new Date().toISOString(),
  };

  const write = existing.data
    ? await db
        .from("a2a_agent_identities")
        .update(row)
        .eq("id", existing.data.id)
        .eq("principal_id", principal.principal_id)
        .select("id,agent_id,public_key_fingerprint,callback_origins,status,created_at,updated_at")
        .single()
    : await db
        .from("a2a_agent_identities")
        .insert(row)
        .select("id,agent_id,public_key_fingerprint,callback_origins,status,created_at,updated_at")
        .single();

  if (write.error || !write.data) {
    throw new A2AProtocolError(503, "A2A_IDENTITY_WRITE_UNAVAILABLE", "A2A identity could not be registered.");
  }

  await recordA2AAudit({
    principalId: principal.principal_id,
    identityId: String(write.data.id),
    eventType: existing.data ? "identity.rotated" : "identity.registered",
    payloadHash: fingerprint,
    details: {
      agent_id: input.agent_id,
      callback_origin_count: callbackOrigins.length,
      protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
    },
  });

  return {
    id: String(write.data.id),
    agent_id: String(write.data.agent_id),
    protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
    public_key_fingerprint: String(write.data.public_key_fingerprint),
    callback_origins: Array.isArray(write.data.callback_origins)
      ? write.data.callback_origins.map(String)
      : [],
    status: String(write.data.status),
    created_at: String(write.data.created_at),
    updated_at: String(write.data.updated_at),
  };
}

export async function getOrCreateA2ATask(input: {
  identity: VerifiedA2AIdentity;
  rawTask: unknown;
  requestHash: string;
}) {
  const task = a2aTaskRequestSchema.parse(input.rawTask);
  const db = requireRiskSupabase();

  const loadExisting = async () => db
    .from("a2a_tasks")
    .select("*")
    .eq("principal_id", input.identity.principal_id)
    .eq("client_task_id", task.client_task_id)
    .maybeSingle();

  let existing = await loadExisting();
  if (existing.error) {
    throw new A2AProtocolError(503, "A2A_TASK_LOOKUP_UNAVAILABLE", "A2A task lookup is temporarily unavailable.");
  }
  if (existing.data) {
    if (String(existing.data.request_hash) !== input.requestHash) {
      throw new A2AProtocolError(409, "A2A_TASK_IDEMPOTENCY_CONFLICT", "client_task_id was already used with different request content.");
    }
    return { task, row: existing.data, created: false };
  }

  const inserted = await db
    .from("a2a_tasks")
    .insert({
      principal_id: input.identity.principal_id,
      agent_identity_id: input.identity.id,
      client_task_id: task.client_task_id,
      protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
      capability: task.capability,
      payment_mode: task.payment_mode,
      status: "accepted",
      request_hash: input.requestHash,
      request_json: task,
      callback_url: task.callback?.url ?? null,
      callback_status: task.callback ? "pending" : "not_requested",
    })
    .select("*")
    .single();

  if (inserted.error || !inserted.data) {
    if (String(inserted.error?.code ?? "") === "23505") {
      existing = await loadExisting();
      if (!existing.error && existing.data && String(existing.data.request_hash) === input.requestHash) {
        return { task, row: existing.data, created: false };
      }
      throw new A2AProtocolError(409, "A2A_TASK_IDEMPOTENCY_CONFLICT", "Concurrent A2A task creation conflicted with this client_task_id.");
    }
    throw new A2AProtocolError(503, "A2A_TASK_WRITE_UNAVAILABLE", "A2A task could not be created.");
  }

  await recordA2AAudit({
    taskId: String(inserted.data.id),
    principalId: input.identity.principal_id,
    identityId: input.identity.id,
    eventType: "task.accepted",
    payloadHash: input.requestHash,
    details: {
      client_task_id: task.client_task_id,
      capability: task.capability,
      payment_mode: task.payment_mode,
      subject_type: task.subject.type,
      callback_requested: Boolean(task.callback),
    },
  });

  return { task, row: inserted.data, created: true };
}

export async function markA2ATaskPaymentRequired(input: {
  taskId: string;
  identity: VerifiedA2AIdentity;
}) {
  const db = requireRiskSupabase();
  const updated = await db
    .from("a2a_tasks")
    .update({ status: "payment_required", updated_at: new Date().toISOString() })
    .eq("id", input.taskId)
    .eq("agent_identity_id", input.identity.id);
  if (updated.error) {
    throw new A2AProtocolError(503, "A2A_TASK_WRITE_UNAVAILABLE", "A2A payment state could not be persisted.");
  }
  await recordA2AAudit({
    taskId: input.taskId,
    principalId: input.identity.principal_id,
    identityId: input.identity.id,
    eventType: "task.payment_required",
    details: { payment_mode: "x402_testnet" },
  });
}

function subjectKey(task: A2ATaskRequest) {
  return task.subject.type === "country"
    ? task.subject.country_iso3
    : `${task.subject.origin_country_iso3}>${task.subject.destination_country_iso3}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function executeA2ATask(input: {
  identity: VerifiedA2AIdentity;
  task: A2ATaskRequest;
  taskId: string;
  x402Settlement?: CircleX402Settlement | null;
}) {
  const db = requireRiskSupabase();
  const rowResult = await db
    .from("a2a_tasks")
    .select("status,result_json,error_json,result_hash,callback_url,callback_status,payment_reference")
    .eq("id", input.taskId)
    .eq("agent_identity_id", input.identity.id)
    .maybeSingle();
  if (rowResult.error || !rowResult.data) {
    throw new A2AProtocolError(404, "A2A_TASK_NOT_FOUND", "A2A task was not found.");
  }
  if (rowResult.data.status === "completed" && rowResult.data.result_json) {
    return rowResult.data.result_json as Record<string, unknown>;
  }
  if (rowResult.data.status === "failed") {
    throw new A2AProtocolError(409, "A2A_TASK_ALREADY_FAILED", "This idempotent A2A task is already in a failed state.");
  }

  const processing = await db
    .from("a2a_tasks")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", input.taskId)
    .eq("agent_identity_id", input.identity.id);
  if (processing.error) {
    throw new A2AProtocolError(503, "A2A_TASK_WRITE_UNAVAILABLE", "A2A processing state could not be persisted.");
  }

  await recordA2AAudit({
    taskId: input.taskId,
    principalId: input.identity.principal_id,
    identityId: input.identity.id,
    eventType: "task.processing",
    details: { payment_mode: input.task.payment_mode },
  });

  let entitlement: Awaited<ReturnType<typeof resolveCommercialEntitlementForCapability>> | null = null;
  let usage: Awaited<ReturnType<typeof consumeCommercialCapability>> | null = null;
  let observationLimit = 8;
  let evidenceLimit = 12;
  let payment: Record<string, unknown>;

  if (input.task.payment_mode === "commercial_credit") {
    entitlement = await resolveCommercialEntitlementForCapability({
      principal: input.identity.principal,
      capability: "risk_gate_bundle",
    });
    const policy = structuredDeliveryPolicy(entitlement.tier, "risk_gate_bundle");
    if (!policy.allowed || !entitlement.policy.allowed || !policy.product.subject_types.includes(input.task.subject.type)) {
      throw new A2AProtocolError(403, "A2A_CAPABILITY_NOT_INCLUDED", "risk_preflight is not included in this A2A commercial entitlement.");
    }
    observationLimit = policy.tier.max_structural_observations;
    evidenceLimit = policy.tier.max_evidence_references;
    await ensureCommercialCreditAccount({
      principal: input.identity.principal,
      tier: entitlement.tier,
    });
    usage = await consumeCommercialCapability({
      principal: input.identity.principal,
      entitlement,
      requestId: input.taskId,
      capability: "risk_gate_bundle",
    });
    payment = {
      mode: "commercial_credit",
      entitlement_grant_id: entitlement.grant_id,
      tier: entitlement.tier,
      credit_cost: usage.credit_cost ?? GEOMACRO_CREDIT_COSTS.risk_gate_bundle,
      credits_remaining: usage.credits_remaining ?? null,
      idempotent_replay: usage.idempotent_replay ?? false,
    };
  } else {
    if (!input.x402Settlement) {
      throw new A2AProtocolError(402, "A2A_X402_PAYMENT_REQUIRED", "x402 settlement is required before A2A task execution.");
    }
    payment = {
      mode: "x402_testnet",
      provider: "circle_gateway_x402",
      asset: CIRCLE_X402_ASSET,
      network: CIRCLE_X402_NETWORK,
      amount_atomic: CIRCLE_X402_PRICE_ATOMIC,
      amount_usdc: CIRCLE_X402_PRICE_USDC,
      payer: input.x402Settlement.payer,
      settlement_reference: input.x402Settlement.settlement_reference,
      technical_proof_only: true,
    };
  }

  const request: TestnetIntelligenceRequest = {
    request_id: input.taskId,
    capability: "risk_gate_bundle",
    subject: input.task.subject,
    policy_preset: input.task.policy_preset,
    action_type: input.task.action_type,
    ...(input.task.amount_usdc === undefined ? {} : { amount_usdc: input.task.amount_usdc }),
  };

  try {
    const delivery = await runCanonicalTestnetIntelligence({
      request,
      max_structural_observations: observationLimit,
      max_evidence_references: evidenceLimit,
    });
    const data = asRecord(delivery.data);
    if (!data || data.execution_authorized !== false) {
      throw new Error("A2A_RISK_GATE_EXECUTION_BOUNDARY_VIOLATION");
    }

    const completedAt = new Date().toISOString();
    const resultHash = sha256Json(delivery.data);
    const result = {
      protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
      task_id: input.taskId,
      client_task_id: input.task.client_task_id,
      status: "completed",
      capability: input.task.capability,
      payment,
      result: delivery.data,
      audit: {
        result_sha256: resultHash,
        completed_at: completedAt,
      },
      boundaries: {
        raw_data_included: false,
        private_warehouse_access: false,
        upstream_news_source_identity_exposed: false,
        execution_authorized: false,
      },
    } as const;

    const completeWrite = await db
      .from("a2a_tasks")
      .update({
        status: "completed",
        result_json: result,
        result_hash: resultHash,
        error_json: null,
        payment_reference: input.x402Settlement?.settlement_reference ?? null,
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("id", input.taskId)
      .eq("agent_identity_id", input.identity.id);
    if (completeWrite.error) {
      throw new A2AProtocolError(503, "A2A_TASK_WRITE_UNAVAILABLE", "A2A completion could not be persisted.");
    }

    await recordA2AAudit({
      taskId: input.taskId,
      principalId: input.identity.principal_id,
      identityId: input.identity.id,
      eventType: "task.completed",
      payloadHash: resultHash,
      details: {
        subject_type: input.task.subject.type,
        subject_key: subjectKey(input.task),
        payment_mode: input.task.payment_mode,
        execution_authorized: false,
      },
    });

    try {
      const riskObject = asRecord(data.risk_object);
      const riskGate = asRecord(data.risk_gate);
      await recordCommercialUsageEvent({
        environment: input.task.payment_mode === "x402_testnet" || entitlement?.tier === "testnet_tester"
          ? "testnet"
          : "internal",
        access_surface: input.task.payment_mode === "x402_testnet" ? "technical_proof" : "agent_payment",
        principal_id: input.identity.principal_id,
        principal_type: input.identity.principal.principal_type,
        entitlement_grant_id: entitlement?.grant_id ?? null,
        offer_id: entitlement?.policy.offer_id ?? null,
        tier: entitlement?.tier ?? null,
        request_id: input.taskId,
        delivery_id: input.taskId,
        capability: "risk_gate_bundle",
        subject_type: delivery.subject_type,
        subject_key: delivery.subject_key,
        credits_charged: usage?.idempotent_replay ? 0 : usage?.credit_cost ?? 0,
        credits_remaining: usage?.credits_remaining ?? null,
        idempotent_replay: usage?.idempotent_replay ?? false,
        http_status: 200,
        success: true,
        response_sha256: resultHash,
        response_bytes: new TextEncoder().encode(JSON.stringify(delivery.data)).byteLength,
        structural_observation_count: delivery.structural_observation_count,
        evidence_reference_count: delivery.evidence_reference_count,
        risk_object_id: riskObject?.object_id ? String(riskObject.object_id) : null,
        risk_object_version: riskObject?.schema_version ? String(riskObject.schema_version) : null,
        risk_object_signed: true,
        risk_gate_included: true,
        risk_gate_decision: riskGate?.decision ? String(riskGate.decision) : null,
        execution_authorized: false,
        shareable: false,
        metadata: {
          protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
          agent_id: input.identity.agent_id,
          payment_mode: input.task.payment_mode,
        },
      });
    } catch (error) {
      console.error("[a2a] commercial usage ledger write failed", error);
    }

    if (input.task.payment_mode === "x402_testnet" && input.x402Settlement) {
      await persistSettlementTelemetry({
        requestId: input.taskId,
        payer: input.x402Settlement.payer,
        settlementReference: input.x402Settlement.settlement_reference,
      });
    }

    if (input.task.callback?.url) {
      try {
        await deliverA2ACallback({
          url: input.task.callback.url,
          identityOrigins: input.identity.callback_origins,
          taskId: input.taskId,
          clientTaskId: input.task.client_task_id,
          resultHash,
          result,
        });
        await db
          .from("a2a_tasks")
          .update({
            callback_status: "delivered",
            callback_attempt_count: 1,
            callback_last_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.taskId);
        await recordA2AAudit({
          taskId: input.taskId,
          principalId: input.identity.principal_id,
          identityId: input.identity.id,
          eventType: "callback.delivered",
          payloadHash: resultHash,
          details: { origin: new URL(input.task.callback.url).origin },
        });
      } catch (error) {
        const blocked = error instanceof A2AProtocolError && error.status === 403;
        await db
          .from("a2a_tasks")
          .update({
            callback_status: blocked ? "blocked" : "failed",
            callback_attempt_count: 1,
            callback_last_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.taskId);
        await recordA2AAudit({
          taskId: input.taskId,
          principalId: input.identity.principal_id,
          identityId: input.identity.id,
          eventType: blocked ? "callback.blocked" : "callback.failed",
          payloadHash: resultHash,
          details: {
            code: error instanceof A2AProtocolError ? error.code : "A2A_CALLBACK_DELIVERY_FAILED",
            origin: new URL(input.task.callback.url).origin,
          },
        });
      }
    }

    return result;
  } catch (error) {
    const code = error instanceof A2AProtocolError
      ? error.code
      : error instanceof Error
        ? error.message.slice(0, 120)
        : "A2A_TASK_FAILED";
    const failedAt = new Date().toISOString();
    await db
      .from("a2a_tasks")
      .update({
        status: "failed",
        error_json: { code, message: "A2A risk-preflight task failed closed." },
        completed_at: failedAt,
        updated_at: failedAt,
      })
      .eq("id", input.taskId)
      .eq("agent_identity_id", input.identity.id);
    await recordA2AAudit({
      taskId: input.taskId,
      principalId: input.identity.principal_id,
      identityId: input.identity.id,
      eventType: "task.failed",
      details: { code },
    });
    throw error;
  }
}

export async function getA2ATaskForIdentity(input: {
  identity: VerifiedA2AIdentity;
  taskId: string;
}) {
  const db = requireRiskSupabase();
  const [taskResult, auditResult] = await Promise.all([
    db
      .from("a2a_tasks")
      .select("id,client_task_id,protocol_version,capability,payment_mode,status,result_json,result_hash,error_json,payment_reference,callback_url,callback_status,callback_attempt_count,callback_last_at,created_at,updated_at,completed_at")
      .eq("id", input.taskId)
      .eq("principal_id", input.identity.principal_id)
      .eq("agent_identity_id", input.identity.id)
      .maybeSingle(),
    db
      .from("a2a_audit_events")
      .select("event_type,payload_hash,details,created_at")
      .eq("task_id", input.taskId)
      .eq("principal_id", input.identity.principal_id)
      .order("created_at", { ascending: true })
      .limit(50),
  ]);

  if (taskResult.error || auditResult.error) {
    throw new A2AProtocolError(503, "A2A_TASK_LOOKUP_UNAVAILABLE", "A2A task status is temporarily unavailable.");
  }
  if (!taskResult.data) {
    throw new A2AProtocolError(404, "A2A_TASK_NOT_FOUND", "A2A task was not found for this identity.");
  }

  return {
    protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
    task: taskResult.data,
    audit_events: auditResult.data ?? [],
    execution_authorized: false,
  };
}

export function parseA2AIdentityRegistration(raw: unknown): A2AIdentityRegistration {
  return a2aIdentityRegistrationSchema.parse(raw);
}
