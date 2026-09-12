import { createHash, randomBytes } from "node:crypto";
import { verifyMessage } from "ethers";

import { GEOMACRO_CREDIT_CONTRACT_VERSION } from "./commercial-access-contract";
import { requireRiskSupabase } from "./risk-supabase.server";
import { STRUCTURED_DATA_REGISTRY_VERSION } from "./structured-data-entitlement-registry";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const WALLET_CHALLENGE_TTL_MS = 10 * 60 * 1000;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalAddress(value: string) {
  const address = String(value ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw new Error("INVALID_WALLET_ADDRESS");
  return address;
}

function expiresIn(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

async function provisionTestnetMeteredAccess(principalId: string) {
  const db = requireRiskSupabase();
  const provision = await db.rpc("provision_testnet_metered_access", {
    p_principal_id: principalId,
    p_registry_version: STRUCTURED_DATA_REGISTRY_VERSION,
    p_contract_version: GEOMACRO_CREDIT_CONTRACT_VERSION,
  });
  if (provision.error) throw provision.error;
  const provisioned = (provision.data ?? {}) as Record<string, unknown>;
  if (!provisioned.ok) {
    throw new Error(String(provisioned.code ?? "TESTNET_METERED_ACCESS_PROVISION_FAILED"));
  }
  return provisioned;
}

export async function createTestnetTesterAccount(input: { profileName: string; termsVersion: string }) {
  const db = requireRiskSupabase();
  const profileName = String(input.profileName ?? "").trim();
  const termsVersion = String(input.termsVersion ?? "").trim();
  if (profileName.length < 2 || profileName.length > 64) throw new Error("INVALID_PROFILE_NAME");
  if (termsVersion.length < 2 || termsVersion.length > 64) throw new Error("INVALID_TERMS_VERSION");

  const nonce = randomBytes(24).toString("base64url");
  const principalInsert = await db.from("commercial_principals").insert({
    principal_type: "wallet",
    external_id: `pending_wallet:${nonce}`,
    display_name: profileName,
    status: "active",
  }).select("id").single();
  if (principalInsert.error) throw principalInsert.error;
  const principalId = principalInsert.data.id as string;

  // Legacy columns remain non-null in the existing schema, but they are no
  // longer identity inputs or launch requirements. Store opaque placeholders
  // only until a future schema cleanup migration removes those historical fields.
  const profileInsert = await db.from("testnet_tester_profiles").insert({
    principal_id: principalId,
    profile_name: profileName,
    email_hash: sha256(`unused:${nonce}:1`),
    wallet_address_hash: sha256(`pending-wallet:${nonce}`),
    x_account_id_hash: sha256(`unused:${nonce}:2`),
    discord_account_id_hash: sha256(`unused:${nonce}:3`),
    terms_version: termsVersion,
    terms_accepted_at: new Date().toISOString(),
    registration_status: "pending",
    access_status: "pending_verification",
  });
  if (profileInsert.error) throw profileInsert.error;

  const session = `gms_test_${randomBytes(32).toString("base64url")}`;
  const sessionExpiresAt = expiresIn(SESSION_TTL_MS);
  const sessionInsert = await db.from("testnet_tester_sessions").insert({
    principal_id: principalId,
    session_token_hash: sha256(session),
    expires_at: sessionExpiresAt,
  });
  if (sessionInsert.error) throw sessionInsert.error;

  return { principal_id: principalId, session_token: session, session_expires_at: sessionExpiresAt } as const;
}

export async function requireTestnetTesterSession(rawToken: string) {
  const token = String(rawToken ?? "").trim();
  if (!/^gms_test_[A-Za-z0-9_-]{40,}$/.test(token)) throw new Error("TESTER_SESSION_REQUIRED");
  const db = requireRiskSupabase();
  const now = new Date().toISOString();
  const result = await db.from("testnet_tester_sessions").select("id,principal_id,expires_at,revoked_at").eq("session_token_hash", sha256(token)).maybeSingle();
  if (result.error) throw result.error;
  const row = result.data;
  if (!row || row.revoked_at || row.expires_at <= now) throw new Error("TESTER_SESSION_NOT_AUTHORIZED");
  await db.from("testnet_tester_sessions").update({ last_seen_at: now }).eq("id", row.id);
  return { principalId: row.principal_id as string, sessionId: row.id as string };
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

export async function verifyTestnetWalletSignature(input: { principalId: string; walletAddress: string; nonce: string; message: string; signature: string }) {
  const db = requireRiskSupabase();
  const walletAddress = canonicalAddress(input.walletAddress);
  const walletHash = sha256(walletAddress);
  const now = new Date().toISOString();
  const challenge = await db.from("testnet_wallet_challenges").select("id,wallet_address_hash,expires_at,consumed_at").eq("principal_id", input.principalId).eq("nonce_hash", sha256(String(input.nonce ?? ""))).maybeSingle();
  if (challenge.error) throw challenge.error;
  if (!challenge.data || challenge.data.consumed_at || challenge.data.expires_at <= now) throw new Error("WALLET_CHALLENGE_INVALID_OR_EXPIRED");
  if (challenge.data.wallet_address_hash !== walletHash) throw new Error("WALLET_CHALLENGE_ADDRESS_MISMATCH");
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

  const duplicate = await db.from("testnet_tester_profiles").select("principal_id").eq("wallet_address_hash", walletHash).neq("principal_id", input.principalId).maybeSingle();
  if (duplicate.error) throw duplicate.error;
  if (duplicate.data) throw new Error("TESTNET_WALLET_ALREADY_REGISTERED");

  // Persist the verified identity first. Do not consume the challenge until the
  // entitlement has also been provisioned, otherwise a transient DB/RPC failure
  // can strand a successfully signed tester in pending_verification.
  const profileUpdate = await db.from("testnet_tester_profiles").update({
    wallet_address_hash: walletHash,
    wallet_verified_at: now,
    registration_status: "complete",
    updated_at: now,
  }).eq("principal_id", input.principalId);
  if (profileUpdate.error) throw profileUpdate.error;

  const principalUpdate = await db.from("commercial_principals").update({
    principal_type: "wallet",
    external_id: `wallet_sha256:${walletHash}`,
    updated_at: now,
  }).eq("id", input.principalId);
  if (principalUpdate.error) throw principalUpdate.error;

  await provisionTestnetMeteredAccess(input.principalId);

  const consume = await db.from("testnet_wallet_challenges")
    .update({ consumed_at: now })
    .eq("id", challenge.data.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (consume.error) throw consume.error;
  if (!consume.data) throw new Error("WALLET_CHALLENGE_ALREADY_CONSUMED");

  return { verified: true, wallet_address: walletAddress, access_status: "active", payment_model: "pay_per_call", max_credits_per_30_days: 500 } as const;
}

export async function loadTestnetTesterAccount(principalId: string) {
  const db = requireRiskSupabase();
  const selectProfile = () => db.from("testnet_tester_profiles")
    .select("profile_name,avatar_path,wallet_verified_at,registration_status,access_status,current_entitlement_grant_id,updated_at")
    .eq("principal_id", principalId)
    .maybeSingle();

  let profileResult = await selectProfile();
  if (profileResult.error) throw profileResult.error;
  if (!profileResult.data) throw new Error("TESTNET_PROFILE_NOT_FOUND");
  let p = profileResult.data;
  const registrationComplete = Boolean(p.wallet_verified_at);

  if (registrationComplete && p.registration_status === "pending") {
    const registrationUpdate = await db.from("testnet_tester_profiles")
      .update({ registration_status: "complete", updated_at: new Date().toISOString() })
      .eq("principal_id", principalId);
    if (registrationUpdate.error) throw registrationUpdate.error;
    p = { ...p, registration_status: "complete" };
  }

  let recoveryRequired = false;
  if (registrationComplete && p.access_status === "pending_verification") {
    try {
      await provisionTestnetMeteredAccess(principalId);
      profileResult = await selectProfile();
      if (profileResult.error) throw profileResult.error;
      if (profileResult.data) p = profileResult.data;
    } catch (error) {
      console.error("[testnet-tester-account] metered access recovery failed", error);
      recoveryRequired = true;
    }
  }

  return {
    profile_name: p.profile_name,
    avatar_path: p.avatar_path,
    wallet_verified: Boolean(p.wallet_verified_at),
    registration_status: Boolean(p.wallet_verified_at) ? "complete" : p.registration_status,
    access_status: p.access_status,
    entitlement_grant_id: p.current_entitlement_grant_id,
    recovery_required: recoveryRequired,
    execution_authorized: false,
  } as const;
}
