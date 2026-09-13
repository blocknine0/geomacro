import { createHmac } from "node:crypto";

export type ApiCredentialDomain =
  | "commercial-bearer"
  | "testnet-api-secret"
  | "risk-gate-bearer";

function credentialPepper(): string {
  const value = String(
    process.env.GEOMACRO_API_CREDENTIAL_PEPPER ??
      process.env.APP_SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      "",
  ).trim();

  if (value.length < 32) {
    throw new Error(
      "A server-only API credential pepper or service-role key of at least 32 characters is required",
    );
  }

  return value;
}

/**
 * Deterministic keyed digest for lookup-only API credentials.
 *
 * API tokens must never be persisted in plaintext. HMAC-SHA-256 keeps the
 * existing fixed-width indexed lookup contract while making a database-only
 * credential dump insufficient for offline token verification without the
 * independent server-side pepper.
 */
export function apiCredentialDigest(
  value: string,
  domain: ApiCredentialDomain,
): string {
  if (!value) throw new Error("API credential value is required");

  return createHmac("sha256", credentialPepper())
    .update("geomacro-api-credential-v1\0", "utf8")
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest("hex");
}
