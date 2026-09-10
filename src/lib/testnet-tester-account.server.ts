import { createHash, createHmac, randomBytes } from "node:crypto";
import { verifyMessage } from "ethers";

import { requireRiskSupabase } from "./risk-supabase.server";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_CHALLENGE_TTL_MS = 20 * 60 * 1000;
const WALLET_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function oauthStateDigest(value: string) {
  const secret = String(process.env.TESTNET_OAUTH_COOKIE_SECRET ?? "").trim();
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("TESTNET_OAUTH_COOKIE_SECRET_TOO_SHORT");
  }
  return createHmac("sha256", secret).update(value).digest("hex");
}

function canonicalEmail(value: string) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("INVALID_EMAIL");
  }
  return email;
}

function canonicalAddress(value: string) {
  const address = String(value ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw new Error("INVALID_WALLET_ADDRESS");
  return address;
}

function expiresIn(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

export async function createTestnetTesterAccount(input: {
  email: string;
  profileName: string;
  termsVersion: string;
}) {
  const db = requireRiskSupabase();
  const email = canonicalEmail(input.email);
  const profileName = String(input.profileName ?? "").trim();
  const termsVersion = String(input.termsVersion ?? "").trim();
  if (profileName.length < 2 || profileName.length > 64) throw new Error("INVALID_PROFILE_NAME");
  if (termsVersion.length < 2 || termsVersion.length > 64) throw new Error("INVALID_TERMS_VERSION");

  const emailHash = sha256(email);
  const existing = await db
    .from("testnet_tester_profiles")
    .select("principal_id,email_verified_at,registration_status,access_status")
    .eq("email_hash", emailHash)
    .maybeSingle();
  if (existing.error) throw existing.error;

  let principalId = existing.data?.principal_id as string | undefined;
  if (!principalId) {
    const principalInsert = await db
      .from("commercial_principals")
      .insert({
        principal_type: "email",
        external_id: `email_sha256:${emailHash}`,
        display_name: profileName,
        status: "active",
      })
      .select("id")
      .single();
    if (principalInsert.error) throw principalInsert.error;
    principalId = principalInsert.data.id;

    const profileInsert = await db.from("testnet_tester_profiles").insert({
      principal_id: principalId,
      profile_name: profileName,
      email_hash: emailHash,
      wallet_address_hash: sha256(`pending-wallet:${principalId}`),
      x_account_id_hash: sha256(`pending-x:${principalId}`),
      discord_account_id_hash: sha256(`pending-discord:${principalId}`),
      terms_version: termsVersion,
      terms_accepted_at: new Date().toISOString(),
      registration_status: "pending",
      access_status: "awaiting_payment",
    });
    if (profileInsert.error) throw profileInsert.error;
  }

  const session = `gms_test_${randomBytes(32).toString("base64url")}`;
  const emailToken = `gme_test_${randomBytes(32).toString("base64url")}`;
  const sessionInsert = await db.from("testnet_tester_sessions").insert({
    principal_id: principalId,
    session_token_hash: sha256(session),
    expires_at: expiresIn(SESSION_TTL_MS),
  });
  if (sessionInsert.error) throw sessionInsert.error;

  const challengeInsert = await db.from("testnet_email_verification_challenges").insert({
    principal_id: principalId,
    email_hash: emailHash,
    token_hash: sha256(emailToken),
    expires_at: expiresIn(EMAIL_CHALLENGE_TTL_MS),
  });
  if (challengeInsert.error) throw challengeInsert.error;

  return {
    principal_id: principalId,
    session_token: session,
    session_expires_at: expiresIn(SESSION_TTL_MS),
    email_verification_token: emailToken,
    email_verification_expires_at: expiresIn(EMAIL_CHALLENGE_TTL_MS),
  } as const;
}

export async function requireTestnetTesterSession(rawToken: string) {
  const token = String(rawToken ?? "").trim();
  if (!/^gms_test_[A-Za-z0-9_-]{40,}$/.test(token)) throw new Error("TESTER_SESSION_REQUIRED");
  const db = requireRiskSupabase();
  const now = new Date().toISOString();
  const result = await db
    .from("testnet_tester_sessions")
    .select("id,principal_id,expires_at,revoked_at")
    .eq("session_token_hash", sha256(token))
    .maybeSingle();
  if (result.error) throw result.error;
  const row = result.data;
  if (!row || row.revoked_at || row.expires_at <= now) throw new Error("TESTER_SESSION_NOT_AUTHORIZED");
  await db.from("testnet_tester_sessions").update({ last_seen_at: now }).eq("id", row.id);
  return { principalId: row.principal_id as string, sessionId: row.id as string };
}

export async function verifyTestnetTesterEmail(input: { principalId: string; token: string }) {
  const db = requireRiskSupabase();
  const now = new Date().toISOString();
  const challenge = await db
    .from("testnet_email_verification_challenges")
    .select("id,expires_at,consumed_at")
    .eq("principal_id", input.principalId)
    .eq("token_hash", sha256(String(input.token ?? "")))
    .maybeSingle();
  if (challenge.error) throw challenge.error;
  if (!challenge.data || challenge.data.consumed_at || challenge.data.expires_at <= now) {
    throw new Error("EMAIL_VERIFICATION_INVALID_OR_EXPIRED");
  }
  const consume = await db.from("testnet_email_verification_challenges").update({ consumed_at: now }).eq("id", challenge.data.id).is("consumed_at", null);
  if (consume.error) throw consume.error;
  const update = await db.from("testnet_tester_profiles").update({ email_verified_at: now, updated_at: now }).eq("principal_id", input.principalId);
  if (update.error) throw update.error;
  return { verified: true } as const;
}

export async function issueTestnetWalletChallenge(input: { principalId: string; walletAddress: string }) {
  const db = requireRiskSupabase();
  const walletAddress = canonicalAddress(input.walletAddress);
  const nonce = randomBytes(24).toString("base64url");
  const message = [
    "Geomacro Testnet Tester wallet verification",
    `Principal: ${input.principalId}`,
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    "This signature does not authorize funds or transactions.",
  ].join("\n");
  const insert = await db.from("testnet_wallet_challenges").insert({
    principal_id: input.principalId,
    nonce_hash: sha256(nonce),
    wallet_address_hash: sha256(walletAddress),
    expires_at: expiresIn(WALLET_CHALLENGE_TTL_MS),
  });
  if (insert.error) throw insert.error;
  return { nonce, message, wallet_address: walletAddress, expires_at: expiresIn(WALLET_CHALLENGE_TTL_MS) } as const;
}

export async function verifyTestnetWalletSignature(input: {
  principalId: string;
  walletAddress: string;
  nonce: string;
  message: string;
  signature: string;
}) {
  const db = requireRiskSupabase();
  const walletAddress = canonicalAddress(input.walletAddress);
  const now = new Date().toISOString();
  const challenge = await db
    .from("testnet_wallet_challenges")
    .select("id,wallet_address_hash,expires_at,consumed_at")
    .eq("principal_id", input.principalId)
    .eq("nonce_hash", sha256(String(input.nonce ?? "")))
    .maybeSingle();
  if (challenge.error) throw challenge.error;
  if (!challenge.data || challenge.data.consumed_at || challenge.data.expires_at <= now) {
    throw new Error("WALLET_CHALLENGE_INVALID_OR_EXPIRED");
  }
  if (challenge.data.wallet_address_hash !== sha256(walletAddress)) throw new Error("WALLET_CHALLENGE_ADDRESS_MISMATCH");
  const requiredMessage = [
    "Geomacro Testnet Tester wallet verification",
    `Principal: ${input.principalId}`,
    `Wallet: ${walletAddress}`,
    `Nonce: ${input.nonce}`,
    "This signature does not authorize funds or transactions.",
  ].join("\n");
  if (input.message !== requiredMessage) throw new Error("WALLET_CHALLENGE_MESSAGE_MISMATCH");
  const recovered = canonicalAddress(verifyMessage(requiredMessage, input.signature));
  if (recovered !== walletAddress) throw new Error("WALLET_SIGNATURE_INVALID");

  const consume = await db.from("testnet_wallet_challenges").update({ consumed_at: now }).eq("id", challenge.data.id).is("consumed_at", null);
  if (consume.error) throw consume.error;
  const update = await db.from("testnet_tester_profiles").update({ wallet_address_hash: sha256(walletAddress), wallet_verified_at: now, updated_at: now }).eq("principal_id", input.principalId);
  if (update.error) throw update.error;
  return { verified: true, wallet_address: walletAddress } as const;
}

export async function issueTesterOauthState(input: { principalId: string; provider: "x" | "discord" }) {
  const db = requireRiskSupabase();
  const state = `gmo_${randomBytes(24).toString("base64url")}`;
  const insert = await db.from("testnet_oauth_states").insert({
    principal_id: input.principalId,
    provider: input.provider,
    state_hash: oauthStateDigest(state),
    expires_at: expiresIn(OAUTH_STATE_TTL_MS),
  });
  if (insert.error) throw insert.error;
  return { state, expires_at: expiresIn(OAUTH_STATE_TTL_MS) } as const;
}

export async function consumeTesterOauthIdentity(input: {
  principalId: string;
  provider: "x" | "discord";
  state: string;
  providerAccountId: string;
}) {
  const db = requireRiskSupabase();
  const now = new Date().toISOString();
  const state = await db.from("testnet_oauth_states")
    .select("id,provider,expires_at,consumed_at")
    .eq("principal_id", input.principalId)
    .eq("state_hash", oauthStateDigest(input.state))
    .maybeSingle();
  if (state.error) throw state.error;
  if (!state.data || state.data.provider !== input.provider || state.data.consumed_at || state.data.expires_at <= now) {
    throw new Error("OAUTH_STATE_INVALID_OR_EXPIRED");
  }
  const accountId = String(input.providerAccountId ?? "").trim();
  if (!accountId || accountId.length > 256) throw new Error("INVALID_PROVIDER_ACCOUNT_ID");
  const field = input.provider === "x" ? "x_account_id_hash" : "discord_account_id_hash";
  const connectedField = input.provider === "x" ? "x_connected_at" : "discord_connected_at";
  const consume = await db.from("testnet_oauth_states").update({ consumed_at: now }).eq("id", state.data.id).is("consumed_at", null);
  if (consume.error) throw consume.error;
  const update = await db.from("testnet_tester_profiles").update({ [field]: sha256(accountId), [connectedField]: now, updated_at: now }).eq("principal_id", input.principalId);
  if (update.error) throw update.error;
  return { connected: true, provider: input.provider } as const;
}

export async function loadTestnetTesterAccount(principalId: string) {
  const db = requireRiskSupabase();
  const profileResult = await db.from("testnet_tester_profiles")
    .select("profile_name,avatar_path,email_verified_at,wallet_verified_at,x_connected_at,discord_connected_at,registration_status,access_status,current_entitlement_grant_id,updated_at")
    .eq("principal_id", principalId)
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;
  if (!profileResult.data) throw new Error("TESTNET_PROFILE_NOT_FOUND");
  const p = profileResult.data;
  const registrationComplete = Boolean(p.email_verified_at && p.wallet_verified_at && p.x_connected_at && p.discord_connected_at);
  if (registrationComplete && p.registration_status === "pending") {
    await db.from("testnet_tester_profiles").update({ registration_status: "complete", updated_at: new Date().toISOString() }).eq("principal_id", principalId);
  }
  return {
    profile_name: p.profile_name,
    avatar_path: p.avatar_path,
    email_verified: Boolean(p.email_verified_at),
    wallet_verified: Boolean(p.wallet_verified_at),
    x_connected: Boolean(p.x_connected_at),
    discord_connected: Boolean(p.discord_connected_at),
    registration_status: registrationComplete ? "complete" : p.registration_status,
    access_status: p.access_status,
    entitlement_grant_id: p.current_entitlement_grant_id,
    execution_authorized: false,
  } as const;
}
