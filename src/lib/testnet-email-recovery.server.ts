import { createHash, randomBytes } from "node:crypto";

import { requireRiskSupabase } from "./risk-supabase.server";

const EMAIL_CHALLENGE_TTL_MS = 20 * 60 * 1000;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalEmail(value: string) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("INVALID_EMAIL");
  }
  return email;
}

function expiresIn(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

export async function issueTestnetEmailRecoveryChallenge(input: {
  principalId: string;
  email: string;
}) {
  const db = requireRiskSupabase();
  const email = canonicalEmail(input.email);
  const emailHash = sha256(email);

  const profile = await db
    .from("testnet_tester_profiles")
    .select("email_hash,email_verified_at")
    .eq("principal_id", input.principalId)
    .maybeSingle();

  if (profile.error) throw profile.error;
  if (!profile.data) throw new Error("TESTNET_PROFILE_NOT_FOUND");
  if (profile.data.email_hash !== emailHash) throw new Error("TESTNET_EMAIL_MISMATCH");
  if (profile.data.email_verified_at) {
    return { already_verified: true as const };
  }

  const token = `gme_test_${randomBytes(32).toString("base64url")}`;
  const expiresAt = expiresIn(EMAIL_CHALLENGE_TTL_MS);
  const insert = await db.from("testnet_email_verification_challenges").insert({
    principal_id: input.principalId,
    email_hash: emailHash,
    token_hash: sha256(token),
    expires_at: expiresAt,
  });
  if (insert.error) throw insert.error;

  return {
    already_verified: false as const,
    verification_token: token,
    expires_at: expiresAt,
  };
}
