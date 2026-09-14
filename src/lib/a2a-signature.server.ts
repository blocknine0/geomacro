import {
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

import {
  canonicalA2ASigningPayload,
  GEOMACRO_A2A_SIGNATURE_TTL_SECONDS,
  sha256A2A,
} from "./a2a-contract";
import type { CommercialPrincipal } from "./commercial-access.server";
import { requireRiskSupabase } from "./risk-supabase.server";

export class A2AProtocolError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "A2AProtocolError";
    this.status = status;
    this.code = code;
  }
}

export type VerifiedA2AIdentity = {
  id: string;
  agent_id: string;
  principal_id: string;
  public_key_fingerprint: string;
  callback_origins: string[];
  principal: CommercialPrincipal;
};

function requiredHeader(headers: Headers, name: string) {
  const value = String(headers.get(name) ?? "").trim();
  if (!value) {
    throw new A2AProtocolError(
      401,
      "A2A_SIGNATURE_HEADERS_REQUIRED",
      `Missing required A2A signature header: ${name}.`,
    );
  }
  return value;
}

function parseTimestamp(value: string) {
  if (!/^\d{10,13}$/.test(value)) {
    throw new A2AProtocolError(401, "A2A_TIMESTAMP_INVALID", "A2A timestamp must be Unix epoch seconds or milliseconds.");
  }
  const numeric = Number(value);
  const timestampMs = value.length <= 10 ? numeric * 1000 : numeric;
  if (!Number.isFinite(timestampMs)) {
    throw new A2AProtocolError(401, "A2A_TIMESTAMP_INVALID", "A2A timestamp is invalid.");
  }
  const ageMs = Math.abs(Date.now() - timestampMs);
  if (ageMs > GEOMACRO_A2A_SIGNATURE_TTL_SECONDS * 1000) {
    throw new A2AProtocolError(401, "A2A_SIGNATURE_EXPIRED", "A2A request timestamp is outside the accepted replay window.");
  }
  return timestampMs;
}

export async function verifyA2ASignedRequest(input: {
  method: string;
  pathname: string;
  rawBody: string;
  headers: Headers;
}): Promise<VerifiedA2AIdentity> {
  const agentId = requiredHeader(input.headers, "x-geomacro-a2a-agent-id").toLowerCase();
  const timestamp = requiredHeader(input.headers, "x-geomacro-a2a-timestamp");
  const nonce = requiredHeader(input.headers, "x-geomacro-a2a-nonce");
  const signature = requiredHeader(input.headers, "x-geomacro-a2a-signature");

  parseTimestamp(timestamp);
  if (!/^[A-Za-z0-9_-]{16,160}$/.test(nonce)) {
    throw new A2AProtocolError(401, "A2A_NONCE_INVALID", "A2A nonce format is invalid.");
  }
  if (!/^[A-Za-z0-9_-]{80,128}$/.test(signature)) {
    throw new A2AProtocolError(401, "A2A_SIGNATURE_INVALID", "A2A Ed25519 signature encoding is invalid.");
  }

  const db = requireRiskSupabase();
  const identityResult = await db
    .from("a2a_agent_identities")
    .select("id,principal_id,agent_id,public_key_jwk,public_key_fingerprint,callback_origins,status,revoked_at")
    .eq("agent_id", agentId)
    .maybeSingle();

  if (identityResult.error) {
    throw new A2AProtocolError(503, "A2A_IDENTITY_LOOKUP_UNAVAILABLE", "A2A identity lookup is temporarily unavailable.");
  }
  const identity = identityResult.data;
  if (!identity || identity.status !== "active" || identity.revoked_at) {
    throw new A2AProtocolError(401, "A2A_IDENTITY_NOT_ACTIVE", "A2A agent identity is not active.");
  }

  const bodySha256 = sha256A2A(input.rawBody);
  const signingPayload = canonicalA2ASigningPayload({
    method: input.method,
    pathname: input.pathname,
    timestamp,
    nonce,
    bodySha256,
  });

  let valid = false;
  try {
    const publicKey = createPublicKey({
      key: identity.public_key_jwk as JsonWebKey,
      format: "jwk",
    });
    valid = verifySignature(
      null,
      Buffer.from(signingPayload, "utf8"),
      publicKey,
      Buffer.from(signature, "base64url"),
    );
  } catch {
    valid = false;
  }

  if (!valid) {
    throw new A2AProtocolError(401, "A2A_SIGNATURE_INVALID", "A2A request signature could not be verified.");
  }

  const nonceResult = await db.from("a2a_request_nonces").insert({
    agent_identity_id: identity.id,
    nonce,
    expires_at: new Date(Date.now() + GEOMACRO_A2A_SIGNATURE_TTL_SECONDS * 2 * 1000).toISOString(),
  });
  if (nonceResult.error) {
    if (String(nonceResult.error.code ?? "") === "23505") {
      throw new A2AProtocolError(409, "A2A_NONCE_REPLAYED", "This signed A2A nonce has already been used.");
    }
    throw new A2AProtocolError(503, "A2A_REPLAY_GUARD_UNAVAILABLE", "A2A replay protection is temporarily unavailable.");
  }

  const principalResult = await db
    .from("commercial_principals")
    .select("id,principal_type,external_id,status")
    .eq("id", identity.principal_id)
    .maybeSingle();
  if (principalResult.error) {
    throw new A2AProtocolError(503, "A2A_PRINCIPAL_LOOKUP_UNAVAILABLE", "A2A principal lookup is temporarily unavailable.");
  }
  const principal = principalResult.data;
  if (!principal || principal.status !== "active") {
    throw new A2AProtocolError(401, "A2A_PRINCIPAL_NOT_ACTIVE", "The A2A principal is not active.");
  }

  return {
    id: String(identity.id),
    agent_id: String(identity.agent_id),
    principal_id: String(identity.principal_id),
    public_key_fingerprint: String(identity.public_key_fingerprint),
    callback_origins: Array.isArray(identity.callback_origins)
      ? identity.callback_origins.map(String)
      : [],
    principal: {
      principal_id: String(principal.id),
      principal_type: String(principal.principal_type),
      principal_external_id: String(principal.external_id),
      key_id: `a2a:${String(identity.agent_id)}`,
      scopes: ["a2a:risk_preflight"],
    },
  };
}
