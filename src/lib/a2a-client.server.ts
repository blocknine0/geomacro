import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import {
  A2A_TASK_STATES,
  GEOMACRO_A2A_PROTOCOL_VERSION,
  a2aMessageSchema,
  type A2AMessage,
  type A2ATaskState,
} from "./a2a-contract";
import { A2AServiceError } from "./a2a-service.server";
import { assertA2APublicHttpsUrl, fetchA2AJson } from "./a2a-network-safety.server";
import {
  resolveCommercialEntitlementForCapability,
  type CommercialPrincipal,
} from "./commercial-access.server";
import { requireRiskSupabase } from "./risk-supabase.server";

const OUTBOUND_ATTEMPTS_PER_MINUTE = 60;

const trustedPeerSchema = z.object({
  id: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/),
  agent_card_url: z.string().url().max(2_048),
  authorization_env: z
    .string()
    .trim()
    .regex(/^GEOMACRO_A2A_PEER_[A-Z0-9_]+_TOKEN$/)
    .optional(),
  allowed_interface_hosts: z.array(z.string().trim().min(1).max(253)).max(8).optional(),
});

const trustedPeersSchema = z.array(trustedPeerSchema).max(32);

const agentCardSchema = z
  .object({
    name: z.string().min(1).max(200),
    version: z.string().min(1).max(80),
    supportedInterfaces: z
      .array(
        z.object({
          url: z.string().url().max(2_048),
          protocolBinding: z.string().min(1).max(80),
          protocolVersion: z.string().min(1).max(40),
        }),
      )
      .min(1)
      .max(16),
    skills: z
      .array(z.object({ id: z.string().min(1).max(120) }).passthrough())
      .max(128)
      .optional(),
  })
  .passthrough();

const outboundRequestSchema = z.object({
  peer_id: z.string().trim().min(2).max(80),
  message: a2aMessageSchema,
  configuration: z
    .object({
      acceptedOutputModes: z.array(z.string().trim().min(1).max(160)).max(8).optional(),
      historyLength: z.number().int().min(0).max(50).optional(),
      returnImmediately: z.literal(false).optional(),
    })
    .optional(),
});

const remoteTaskSchema = z
  .object({
    id: z.string().trim().min(1).max(256),
    contextId: z.string().trim().min(1).max(256).optional(),
    status: z
      .object({
        state: z.enum(A2A_TASK_STATES),
      })
      .passthrough(),
  })
  .passthrough();

const remoteSendMessageResponseSchema = z
  .object({
    task: remoteTaskSchema.optional(),
    message: a2aMessageSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Number(Boolean(value.task)) + Number(Boolean(value.message)) !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A2A SendMessageResponse must contain exactly one task or message payload",
      });
    }
  });

type RemoteSendMessageResponse = z.infer<typeof remoteSendMessageResponseSchema>;

export type A2AOutboundRequest = z.infer<typeof outboundRequestSchema>;

function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function loadTrustedPeers() {
  const raw = String(process.env.GEOMACRO_A2A_TRUSTED_PEERS_JSON ?? "").trim();
  if (!raw) return [] as z.infer<typeof trustedPeerSchema>[];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new A2AServiceError(
      503,
      "A2A_TRUSTED_PEERS_INVALID",
      "Trusted A2A peer configuration is invalid.",
    );
  }
  try {
    return trustedPeersSchema.parse(parsed);
  } catch {
    throw new A2AServiceError(
      503,
      "A2A_TRUSTED_PEERS_INVALID",
      "Trusted A2A peer configuration is invalid.",
    );
  }
}

async function parseBoundedJson(response: Response, maxBytes = 256 * 1024) {
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new A2AServiceError(
      502,
      "A2A_PEER_RESPONSE_TOO_LARGE",
      "Trusted A2A peer response exceeded the allowed size.",
    );
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new A2AServiceError(
      502,
      "A2A_PEER_RESPONSE_INVALID",
      "Trusted A2A peer returned invalid JSON.",
    );
  }
}

function allowedInterfaceHost(
  peer: z.infer<typeof trustedPeerSchema>,
  cardUrl: URL,
  interfaceUrl: URL,
) {
  if (interfaceUrl.hostname.toLowerCase() === cardUrl.hostname.toLowerCase()) return true;
  const allowed = new Set(
    (peer.allowed_interface_hosts ?? []).map((host) => host.toLowerCase()),
  );
  return allowed.has(interfaceUrl.hostname.toLowerCase());
}

async function discoverTrustedPeer(peerId: string) {
  const peer = loadTrustedPeers().find((entry) => entry.id === peerId);
  if (!peer) {
    throw new A2AServiceError(
      404,
      "A2A_TRUSTED_PEER_NOT_FOUND",
      "Configured A2A peer not found.",
    );
  }

  const cardUrl = await assertA2APublicHttpsUrl(peer.agent_card_url);
  const cardResponse = await fetchA2AJson(cardUrl.toString(), {
    method: "GET",
    timeoutMs: 4_000,
    headers: { Accept: "application/json" },
  });
  if (!cardResponse.ok) {
    throw new A2AServiceError(
      502,
      "A2A_PEER_DISCOVERY_FAILED",
      "Trusted A2A peer Agent Card could not be loaded.",
    );
  }

  let card: z.infer<typeof agentCardSchema>;
  try {
    card = agentCardSchema.parse(await parseBoundedJson(cardResponse));
  } catch (error) {
    if (error instanceof A2AServiceError) throw error;
    throw new A2AServiceError(
      502,
      "A2A_PEER_CARD_INVALID",
      "Trusted A2A peer Agent Card is not protocol-valid for this client.",
    );
  }

  const selected = card.supportedInterfaces.find(
    (entry) =>
      entry.protocolBinding.toUpperCase() === "HTTP+JSON" &&
      entry.protocolVersion === GEOMACRO_A2A_PROTOCOL_VERSION,
  );
  if (!selected) {
    throw new A2AServiceError(
      409,
      "A2A_PEER_PROTOCOL_MISMATCH",
      "Trusted peer does not advertise A2A HTTP+JSON v1.0.",
    );
  }

  const interfaceUrl = await assertA2APublicHttpsUrl(selected.url);
  if (!allowedInterfaceHost(peer, cardUrl, interfaceUrl)) {
    throw new A2AServiceError(
      502,
      "A2A_PEER_INTERFACE_HOST_DENIED",
      "Trusted peer Agent Card advertised an unapproved interface host.",
    );
  }

  return { peer, card, interfaceUrl };
}

async function enforceOutboundRateLimit(principal: CommercialPrincipal, peerId: string) {
  const db = requireRiskSupabase();
  const since = new Date(Date.now() - 60_000).toISOString();
  const recent = await db
    .from("a2a_audit_events")
    .select("id", { count: "exact", head: true })
    .eq("principal_id", principal.principal_id)
    .eq("direction", "outbound")
    .eq("event_type", "trusted_peer_attempt")
    .gte("created_at", since);
  if (recent.error) {
    throw new A2AServiceError(
      503,
      "A2A_OUTBOUND_RATE_LIMIT_UNAVAILABLE",
      "Outbound A2A rate policy is temporarily unavailable.",
    );
  }
  if ((recent.count ?? 0) >= OUTBOUND_ATTEMPTS_PER_MINUTE) {
    throw new A2AServiceError(
      429,
      "A2A_OUTBOUND_RATE_LIMITED",
      "Outbound A2A request limit exceeded. Try again shortly.",
    );
  }
  const attempt = await db.from("a2a_audit_events").insert({
    task_id: null,
    principal_id: principal.principal_id,
    direction: "outbound",
    event_type: "trusted_peer_attempt",
    metadata: {
      peer_id: peerId,
      window_seconds: 60,
      max_attempts: OUTBOUND_ATTEMPTS_PER_MINUTE,
      execution_authorized: false,
    },
  });
  if (attempt.error) {
    throw new A2AServiceError(
      503,
      "A2A_OUTBOUND_AUDIT_FAILED",
      "Outbound A2A attempt could not be recorded.",
    );
  }
}

function remoteTaskState(response: RemoteSendMessageResponse): A2ATaskState {
  if (response.task) return response.task.status.state;
  return "TASK_STATE_COMPLETED";
}

function isTerminalState(state: A2ATaskState) {
  return [
    "TASK_STATE_COMPLETED",
    "TASK_STATE_CANCELED",
    "TASK_STATE_FAILED",
    "TASK_STATE_REJECTED",
  ].includes(state);
}

async function persistOutbound(input: {
  principal: CommercialPrincipal;
  peerId: string;
  interfaceUrl: string;
  message: A2AMessage;
  response: RemoteSendMessageResponse;
}) {
  const db = requireRiskSupabase();
  const remoteTaskId = input.response.task?.id ?? null;
  const contextId =
    input.response.task?.contextId ??
    input.response.message?.contextId ??
    input.message.contextId ??
    randomUUID();
  const state = remoteTaskState(input.response);
  const now = new Date().toISOString();
  const row = {
    state,
    context_id: contextId,
    remote_agent_url: input.interfaceUrl,
    request_sha256: sha256Json(input.message),
    response_sha256: sha256Json(input.response),
    input_json: input.message,
    output_json: { remote_response: input.response, execution_authorized: false },
    completed_at: isTerminalState(state) ? now : null,
  };

  let persisted: { id: string } | null = null;
  if (remoteTaskId) {
    const existing = await db
      .from("a2a_tasks")
      .select("id")
      .eq("principal_id", input.principal.principal_id)
      .eq("direction", "outbound")
      .eq("remote_agent_id", input.peerId)
      .eq("remote_task_id", remoteTaskId)
      .maybeSingle();
    if (existing.error) {
      throw new A2AServiceError(
        503,
        "A2A_OUTBOUND_AUDIT_FAILED",
        "Remote A2A task state could not be reconciled.",
      );
    }
    if (existing.data) {
      const updated = await db
        .from("a2a_tasks")
        .update(row)
        .eq("id", String(existing.data.id))
        .eq("principal_id", input.principal.principal_id)
        .select("id")
        .single();
      if (updated.error || !updated.data) {
        throw new A2AServiceError(
          503,
          "A2A_OUTBOUND_AUDIT_FAILED",
          "Remote A2A task state could not be updated.",
        );
      }
      persisted = { id: String(updated.data.id) };
    }
  }

  if (!persisted) {
    const inserted = await db
      .from("a2a_tasks")
      .insert({
        principal_id: input.principal.principal_id,
        direction: "outbound",
        context_id: contextId,
        skill_id: String(input.message.metadata?.skillId ?? "remote"),
        state,
        remote_agent_id: input.peerId,
        remote_agent_url: input.interfaceUrl,
        remote_task_id: remoteTaskId,
        request_sha256: row.request_sha256,
        response_sha256: row.response_sha256,
        input_json: input.message,
        output_json: row.output_json,
        completed_at: row.completed_at,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      throw new A2AServiceError(
        503,
        "A2A_OUTBOUND_AUDIT_FAILED",
        "Remote A2A response was received but could not be recorded.",
      );
    }
    persisted = { id: String(inserted.data.id) };
  }

  const messageWrite = await db.from("a2a_messages").insert({
    task_id: persisted.id,
    principal_id: input.principal.principal_id,
    message_id: input.message.messageId,
    role: input.message.role,
    payload: input.message,
    payload_sha256: sha256Json(input.message),
  });
  if (messageWrite.error && String((messageWrite.error as { code?: unknown }).code ?? "") !== "23505") {
    throw new A2AServiceError(
      503,
      "A2A_OUTBOUND_AUDIT_FAILED",
      "Outbound A2A message audit could not be recorded.",
    );
  }

  const eventWrite = await db.from("a2a_audit_events").insert({
    task_id: persisted.id,
    principal_id: input.principal.principal_id,
    direction: "outbound",
    event_type: "trusted_peer_message_sent",
    request_sha256: sha256Json(input.message),
    response_sha256: sha256Json(input.response),
    metadata: {
      peer_id: input.peerId,
      protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
      remote_task_id: remoteTaskId,
      remote_state: state,
      execution_authorized: false,
    },
  });
  if (eventWrite.error) {
    throw new A2AServiceError(
      503,
      "A2A_OUTBOUND_AUDIT_FAILED",
      "Outbound A2A result audit could not be recorded.",
    );
  }

  return persisted.id;
}

export async function sendTrustedA2AMessage(input: {
  principal: CommercialPrincipal;
  raw: unknown;
}) {
  const request = outboundRequestSchema.parse(input.raw);
  if (request.message.role !== "ROLE_USER") {
    throw new A2AServiceError(
      400,
      "A2A_USER_ROLE_REQUIRED",
      "Outbound A2A message must use ROLE_USER.",
    );
  }

  const entitlement = await resolveCommercialEntitlementForCapability({
    principal: input.principal,
    capability: "risk_gate_bundle",
  });
  if (
    !(["api_pilot", "institutional"] as const).includes(
      entitlement.tier as "api_pilot" | "institutional",
    )
  ) {
    throw new A2AServiceError(
      403,
      "A2A_OUTBOUND_ENTITLEMENT_REQUIRED",
      "Outbound A2A peer calls require an API Pilot or Institutional entitlement.",
    );
  }

  await enforceOutboundRateLimit(input.principal, request.peer_id);
  const { peer, card, interfaceUrl } = await discoverTrustedPeer(request.peer_id);

  let authorization: string | undefined;
  if (peer.authorization_env) {
    const token = String(process.env[peer.authorization_env] ?? "").trim();
    if (token.length < 16) {
      throw new A2AServiceError(
        503,
        "A2A_PEER_AUTH_NOT_CONFIGURED",
        "Trusted peer authentication is not configured.",
      );
    }
    authorization = token.match(/^\S+\s+\S+/) ? token : `Bearer ${token}`;
  }

  const base = interfaceUrl.toString().replace(/\/$/, "");
  const response = await fetchA2AJson(`${base}/message:send`, {
    method: "POST",
    timeoutMs: 8_000,
    headers: {
      "Content-Type": "application/a2a+json",
      Accept: "application/a2a+json, application/json",
      "A2A-Version": GEOMACRO_A2A_PROTOCOL_VERSION,
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify({
      message: request.message,
      configuration: request.configuration,
    }),
  });

  const rawRemote = await parseBoundedJson(response);
  if (!response.ok) {
    throw new A2AServiceError(
      response.status >= 400 && response.status < 500 ? response.status : 502,
      "A2A_PEER_REQUEST_FAILED",
      "Trusted A2A peer rejected or failed the request.",
    );
  }

  let remote: RemoteSendMessageResponse;
  try {
    remote = remoteSendMessageResponseSchema.parse(rawRemote);
  } catch {
    throw new A2AServiceError(
      502,
      "A2A_PEER_RESPONSE_INVALID",
      "Trusted A2A peer returned a response that does not match A2A v1 SendMessageResponse.",
    );
  }

  const localTaskId = await persistOutbound({
    principal: input.principal,
    peerId: peer.id,
    interfaceUrl: interfaceUrl.toString(),
    message: request.message,
    response: remote,
  });

  return {
    ok: true,
    peer: {
      id: peer.id,
      name: card.name,
      version: card.version,
      protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
    },
    local_task_id: localTaskId,
    remote,
    boundaries: {
      arbitrary_target_urls_allowed: false,
      trusted_peer_configuration_required: true,
      outbound_rate_limit_per_minute: OUTBOUND_ATTEMPTS_PER_MINUTE,
      remote_authorization_secret_persisted: false,
      execution_authorized: false,
    },
  };
}
