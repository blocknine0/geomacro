import { z } from "zod";

import type { CommercialPrincipal } from "./commercial-access.server";
import { A2AProtocolError } from "./a2a-signature.server";
import { recordA2AAudit } from "./a2a-service.server";
import { requireRiskSupabase } from "./risk-supabase.server";

const revokeSchema = z.object({
  agent_id: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._:-]{2,63}$/),
});

export async function revokeA2AIdentity(
  principal: CommercialPrincipal,
  raw: unknown,
) {
  const input = revokeSchema.parse(raw);
  const db = requireRiskSupabase();
  const identityResult = await db
    .from("a2a_agent_identities")
    .select("id,agent_id,status,revoked_at")
    .eq("principal_id", principal.principal_id)
    .eq("agent_id", input.agent_id)
    .maybeSingle();

  if (identityResult.error) {
    throw new A2AProtocolError(
      503,
      "A2A_IDENTITY_LOOKUP_UNAVAILABLE",
      "A2A identity lookup is temporarily unavailable.",
    );
  }
  if (!identityResult.data) {
    throw new A2AProtocolError(404, "A2A_IDENTITY_NOT_FOUND", "A2A identity was not found.");
  }
  if (identityResult.data.status === "revoked" || identityResult.data.revoked_at) {
    return {
      id: String(identityResult.data.id),
      agent_id: String(identityResult.data.agent_id),
      status: "revoked" as const,
      idempotent_replay: true,
    };
  }

  const now = new Date().toISOString();
  const update = await db
    .from("a2a_agent_identities")
    .update({
      status: "revoked",
      revoked_at: now,
      updated_at: now,
    })
    .eq("id", identityResult.data.id)
    .eq("principal_id", principal.principal_id);
  if (update.error) {
    throw new A2AProtocolError(
      503,
      "A2A_IDENTITY_REVOKE_UNAVAILABLE",
      "A2A identity could not be revoked.",
    );
  }

  await recordA2AAudit({
    principalId: principal.principal_id,
    identityId: String(identityResult.data.id),
    eventType: "identity.revoked",
    details: {
      agent_id: input.agent_id,
      revoked_at: now,
    },
  });

  return {
    id: String(identityResult.data.id),
    agent_id: input.agent_id,
    status: "revoked" as const,
    revoked_at: now,
    idempotent_replay: false,
  };
}
