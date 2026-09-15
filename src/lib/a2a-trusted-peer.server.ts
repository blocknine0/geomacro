import { createHash } from "node:crypto";
import { z } from "zod";

import {
  A2A_TASK_STATES,
  GEOMACRO_A2A_PROTOCOL_VERSION,
  type A2ATaskState,
} from "./a2a-contract";
import {
  assertA2APublicHttpsUrl,
  fetchA2AJson,
} from "./a2a-network-safety.server";
import { A2AServiceError } from "./a2a-service.server";
import {
  resolveCommercialEntitlementForCapability,
  type CommercialPrincipal,
} from "./commercial-access.server";
import { requireRiskSupabase } from "./risk-supabase.server";

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
const skillIdSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$/);

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
      .min(1)
      .max(128),
  })
  .passthrough();

const remoteTaskSchema = z
  .object({
    id: z.string().trim().min(1).max(256),
    contextId: z.string().trim().min(1).max(256).optional(),
    status: z
      .object({
        state: z.enum(A2A_TASK_STATES),
      })
      .passthrough(),
    artifacts: z.array(z.unknown()).max(64).optional(),
    history: z.array(z.unknown()).max(100).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const a2aOutboundNegotiationSchema = z
  .object({
    peer_id: z.string().trim().min(2).max(80),
    required_skill_id: skillIdSchema,
  })
  .passthrough();

function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function loadTrustedPeers() {
  const raw = String(process.env.GEOMACRO_A2A_TRUSTED_PEERS_JSON ?? "").trim();
  if (!raw) return [] as z.infer<typeof trustedPeerSchema>[];
  try {
    return trustedPeersSchema.parse(JSON.parse(raw));
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
  return new Set(
    (peer.allowed_interface_hosts ?? []).map((host) => host.toLowerCase()),
  ).has(interfaceUrl.hostname.toLowerCase());
}

function authorizationForPeer(peer: z.infer<typeof trustedPeerSchema>) {
  if (!peer.authorization_env) return undefined;
  const token = String(process.env[peer.authorization_env] ?? "").trim();
  if (token.length < 16) {
    throw new A2AServiceError(
      503,
      "A2A_PEER_AUTH_NOT_CONFIGURED",
      "Trusted peer authentication is not configured.",
    );
  }
  return token.match(/^\S+\s+\S+/) ? token : `Bearer ${token}`;
}

export async function discoverTrustedA2APeerForSkill(input: {
  peerId: string;
  requiredSkillId: string;
}) {
  const requiredSkillId = skillIdSchema.parse(input.requiredSkillId);
  const peer = loadTrustedPeers().find((entry) => entry.id === input.peerId);
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
      "Trusted A2A peer Agent Card is invalid.",
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
  if (!card.skills.some((skill) => skill.id === requiredSkillId)) {
    throw new A2AServiceError(
      409,
      "A2A_PEER_SKILL_UNAVAILABLE",
      `Trusted peer does not advertise required skill ${requiredSkillId}.`,
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

  return {
    peer,
    card,
    interfaceUrl,
    authorization: authorizationForPeer(peer),
    requiredSkillId,
  };
}

export async function assertA2AOutboundCapabilityNegotiation(raw: unknown) {
  const request = a2aOutboundNegotiationSchema.parse(raw);
  const discovered = await discoverTrustedA2APeerForSkill({
    peerId: request.peer_id,
    requiredSkillId: request.required_skill_id,
  });
  return {
    peer_id: discovered.peer.id,
    peer_name: discovered.card.name,
    peer_version: discovered.card.version,
    required_skill_id: discovered.requiredSkillId,
    protocol_binding: "HTTP+JSON" as const,
    protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
    interface_origin: discovered.interfaceUrl.origin,
  };
}

async function requireOutboundEntitlement(principal: CommercialPrincipal) {
  const entitlement = await resolveCommercialEntitlementForCapability({
    principal,
    capability: "risk_gate_bundle",
  });
  if (!(["api_pilot", "institutional"] as const).includes(
    entitlement.tier as "api_pilot" | "institutional",
  )) {
    throw new A2AServiceError(
      403,
      "A2A_OUTBOUND_ENTITLEMENT_REQUIRED",
      "Outbound A2A peer calls require an API Pilot or Institutional entitlement.",
    );
  }
  return entitlement;
}

export async function pollTrustedA2ATask(input: {
  principal: CommercialPrincipal;
  localTaskId: string;
}) {
  await requireOutboundEntitlement(input.principal);
  const db = requireRiskSupabase();
  const taskResult = await db
    .from("a2a_tasks")
    .select("id,principal_id,direction,skill_id,state,remote_agent_id,remote_agent_url,remote_task_id,output_json")
    .eq("id", input.localTaskId)
    .eq("principal_id", input.principal.principal_id)
    .eq("direction", "outbound")
    .maybeSingle();

  if (taskResult.error) {
    throw new A2AServiceError(
      503,
      "A2A_TASK_STORE_UNAVAILABLE",
      "Outbound A2A task storage is temporarily unavailable.",
    );
  }
  if (!taskResult.data) {
    throw new A2AServiceError(404, "A2A_TASK_NOT_FOUND", "Outbound A2A task not found.");
  }
  const row = taskResult.data as Record<string, unknown>;
  const peerId = String(row.remote_agent_id ?? "");
  const remoteTaskId = String(row.remote_task_id ?? "");
  const skillId = String(row.skill_id ?? "");
  if (!peerId || !remoteTaskId || !skillId || skillId === "remote") {
    throw new A2AServiceError(
      409,
      "A2A_REMOTE_TASK_IDENTITY_INCOMPLETE",
      "Outbound A2A task does not have a negotiated remote task identity.",
    );
  }

  const discovered = await discoverTrustedA2APeerForSkill({
    peerId,
    requiredSkillId: skillId,
  });
  const base = discovered.interfaceUrl.toString().replace(/\/$/, "");
  const response = await fetchA2AJson(
    `${base}/tasks/${encodeURIComponent(remoteTaskId)}`,
    {
      method: "GET",
      timeoutMs: 8_000,
      headers: {
        Accept: "application/a2a+json, application/json",
        "A2A-Version": GEOMACRO_A2A_PROTOCOL_VERSION,
        ...(discovered.authorization
          ? { Authorization: discovered.authorization }
          : {}),
      },
    },
  );

  const rawRemote = await parseBoundedJson(response);
  if (!response.ok) {
    throw new A2AServiceError(
      response.status >= 400 && response.status < 500 ? response.status : 502,
      "A2A_PEER_TASK_POLL_FAILED",
      "Trusted A2A peer task could not be refreshed.",
    );
  }

  let remoteTask: z.infer<typeof remoteTaskSchema>;
  try {
    remoteTask = remoteTaskSchema.parse(rawRemote);
  } catch {
    throw new A2AServiceError(
      502,
      "A2A_PEER_RESPONSE_INVALID",
      "Trusted A2A peer returned an invalid task response.",
    );
  }
  if (remoteTask.id !== remoteTaskId) {
    throw new A2AServiceError(
      409,
      "A2A_REMOTE_TASK_ID_CONFLICT",
      "Trusted A2A peer returned a different task identity.",
    );
  }

  const state = remoteTask.status.state as A2ATaskState;
  const terminal = [
    "TASK_STATE_COMPLETED",
    "TASK_STATE_CANCELED",
    "TASK_STATE_FAILED",
    "TASK_STATE_REJECTED",
  ].includes(state);
  const responseHash = sha256Json(remoteTask);
  const now = new Date().toISOString();
  const output = {
    remote_response: remoteTask,
    execution_authorized: false,
  };
  const updated = await db
    .from("a2a_tasks")
    .update({
      state,
      response_sha256: responseHash,
      output_json: output,
      completed_at: terminal ? now : null,
    })
    .eq("id", input.localTaskId)
    .eq("principal_id", input.principal.principal_id)
    .eq("direction", "outbound")
    .select("id,state,remote_task_id,updated_at,completed_at")
    .single();
  if (updated.error || !updated.data) {
    throw new A2AServiceError(
      503,
      "A2A_OUTBOUND_AUDIT_FAILED",
      "Trusted peer task response was received but could not be persisted.",
    );
  }

  const audit = await db.from("a2a_audit_events").insert({
    task_id: input.localTaskId,
    principal_id: input.principal.principal_id,
    direction: "outbound",
    event_type: "trusted_peer_task_polled",
    response_sha256: responseHash,
    metadata: {
      peer_id: peerId,
      remote_task_id: remoteTaskId,
      remote_state: state,
      required_skill_id: skillId,
      execution_authorized: false,
    },
  });
  if (audit.error) {
    throw new A2AServiceError(
      503,
      "A2A_OUTBOUND_AUDIT_FAILED",
      "Trusted peer task refresh could not be audited.",
    );
  }

  return {
    ok: true,
    local_task_id: input.localTaskId,
    peer_id: peerId,
    required_skill_id: skillId,
    remote: remoteTask,
    local: updated.data,
    execution_authorized: false,
  };
}
