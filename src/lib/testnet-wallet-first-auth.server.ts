import { createHash, randomBytes } from "node:crypto";
import { verifyMessage } from "ethers";

import { GEOMACRO_CREDIT_CONTRACT_VERSION } from "./commercial-access-contract";
import { requireRiskSupabase } from "./risk-supabase.server";
import { STRUCTURED_DATA_REGISTRY_VERSION } from "./structured-data-entitlement-registry";

const TESTNET_SIWE_DOMAIN = "geomacro.live";
const TESTNET_SIWE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TERMS_VERSION = "testnet-terms-v4-wallet-first-siwe";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalAddress(value: string) {
  const address = String(value ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw new Error("INVALID_WALLET_ADDRESS");
  return address;
}

function profileName(value: string | undefined, walletAddress: string) {
  const supplied = String(value ?? "").trim();
  if (supplied) {
    if (supplied.length < 2 || supplied.length > 64) throw new Error("INVALID_PROFILE_NAME");
    return supplied;
  }
  return `Tester ${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`;
}

export function buildTestnetDeveloperSiweMessage(address: string, nonce: string, issuedAt: number) {
  return `${TESTNET_SIWE_DOMAIN} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to Geomacro Testnet Developer Access. This signature does not authorize funds or transactions.\n\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
}

async function provisionTestnetMeteredAccess(principalId: string) {
  const db = requireRiskSupabase();
  const provision = await db.rpc("provision_testnet_metered_access", {
    p_principal_id: principalId,
    p_registry_version: STRUCTURED_DATA_REGISTRY_VERSION,
    p_contract_version: GEOMACRO_CREDIT_CONTRACT_VERSION,
  });
  if (provision.error) throw provision.error;
  const data = (provision.data ?? {}) as Record<string, unknown>;
  if (!data.ok) throw new Error(String(data.code ?? "TESTNET_METERED_ACCESS_PROVISION_FAILED"));
  return data;
}

async function issueTesterSession(principalId: string) {
  const db = requireRiskSupabase();
  const sessionToken = `gms_test_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const insert = await db.from("testnet_tester_sessions").insert({
    principal_id: principalId,
    session_token_hash: sha256(sessionToken),
    expires_at: expiresAt,
  });
  if (insert.error) throw insert.error;
  return { session_token: sessionToken, session_expires_at: expiresAt } as const;
}

async function loadProfileByWalletHash(walletHash: string) {
  const db = requireRiskSupabase();
  const result = await db.from("testnet_tester_profiles")
    .select("principal_id,profile_name,wallet_verified_at,registration_status,access_status,suspended_at")
    .eq("wallet_address_hash", walletHash)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function createWalletFirstProfile(walletAddress: string, requestedProfileName?: string) {
  const db = requireRiskSupabase();
  const now = new Date().toISOString();
  const walletHash = sha256(walletAddress);
  const displayName = profileName(requestedProfileName, walletAddress);
  const opaque = randomBytes(24).toString("base64url");

  const principal = await db.from("commercial_principals").insert({
    principal_type: "wallet",
    external_id: `wallet_sha256:${walletHash}`,
    display_name: displayName,
    status: "active",
  }).select("id").single();

  if (principal.error) {
    if (String((principal.error as { code?: string }).code ?? "") === "23505") {
      const concurrent = await loadProfileByWalletHash(walletHash);
      if (concurrent?.principal_id) return concurrent;
    }
    throw principal.error;
  }

  const principalId = String(principal.data.id);
  const inserted = await db.from("testnet_tester_profiles").insert({
    principal_id: principalId,
    profile_name: displayName,
    email_hash: sha256(`unused:${opaque}:email`),
    email_verified_at: null,
    wallet_address_hash: walletHash,
    wallet_verified_at: now,
    x_account_id_hash: sha256(`unused:${opaque}:x`),
    x_connected_at: null,
    discord_account_id_hash: sha256(`unused:${opaque}:discord`),
    discord_connected_at: null,
    terms_version: TERMS_VERSION,
    terms_accepted_at: now,
    registration_status: "complete",
    access_status: "pending_verification",
  }).select("principal_id,profile_name,wallet_verified_at,registration_status,access_status,suspended_at").single();

  if (inserted.error) {
    if (String((inserted.error as { code?: string }).code ?? "") === "23505") {
      await db.from("commercial_principals").delete().eq("id", principalId);
      const concurrent = await loadProfileByWalletHash(walletHash);
      if (concurrent?.principal_id) return concurrent;
    }
    throw inserted.error;
  }

  return inserted.data;
}

export async function issueTestnetDeveloperWalletChallenge(walletAddressInput: string) {
  const db = requireRiskSupabase();
  const walletAddress = canonicalAddress(walletAddressInput);
  const nonce = randomBytes(32).toString("hex");
  const issuedAt = Date.now();
  const expiresAt = new Date(issuedAt + TESTNET_SIWE_TTL_MS).toISOString();

  void db.from("siwe_login_nonces").delete().lte("expires_at", new Date().toISOString()).then(({ error }) => {
    if (error) console.warn("[testnet-wallet-auth] expired nonce cleanup failed", error.message);
  });

  const insert = await db.from("siwe_login_nonces").insert({
    nonce_hash: sha256(nonce),
    wallet_address: walletAddress,
    issued_at_ms: issuedAt,
    expires_at: expiresAt,
  });
  if (insert.error) throw insert.error;

  return {
    wallet_address: walletAddress,
    nonce,
    issued_at: issuedAt,
    expires_at: expiresAt,
    message: buildTestnetDeveloperSiweMessage(walletAddress, nonce, issuedAt),
  } as const;
}

export async function authenticateTestnetDeveloperWallet(input: {
  walletAddress: string;
  nonce: string;
  issuedAt: number;
  message: string;
  signature: string;
  profileName?: string;
}) {
  const db = requireRiskSupabase();
  const walletAddress = canonicalAddress(input.walletAddress);
  const issuedAt = Number(input.issuedAt);
  const age = Date.now() - issuedAt;
  if (!Number.isFinite(issuedAt) || issuedAt <= 0 || age < 0 || age > TESTNET_SIWE_TTL_MS) {
    throw new Error("TESTNET_SIGNIN_CHALLENGE_EXPIRED");
  }

  const expectedMessage = buildTestnetDeveloperSiweMessage(walletAddress, String(input.nonce ?? ""), issuedAt);
  if (input.message !== expectedMessage) throw new Error("TESTNET_SIGNIN_MESSAGE_MISMATCH");

  let recovered: string;
  try {
    recovered = canonicalAddress(verifyMessage(expectedMessage, String(input.signature ?? "")));
  } catch {
    throw new Error("TESTNET_WALLET_SIGNATURE_INVALID");
  }
  if (recovered !== walletAddress) throw new Error("TESTNET_WALLET_SIGNATURE_INVALID");

  const consumed = await db.rpc("consume_siwe_login_nonce", {
    p_nonce_hash: sha256(String(input.nonce ?? "")),
    p_wallet_address: walletAddress,
    p_issued_at_ms: issuedAt,
  });
  if (consumed.error) throw consumed.error;
  if (consumed.data !== true) throw new Error("TESTNET_SIGNIN_CHALLENGE_USED_OR_EXPIRED");

  const walletHash = sha256(walletAddress);
  let profile = await loadProfileByWalletHash(walletHash);
  let accountCreated = false;
  if (!profile) {
    profile = await createWalletFirstProfile(walletAddress, input.profileName);
    accountCreated = true;
  }

  if (!profile?.principal_id) throw new Error("TESTNET_PROFILE_NOT_FOUND");
  if (profile.suspended_at || ["suspended", "revoked"].includes(String(profile.access_status ?? ""))) {
    throw new Error("TESTNET_PROFILE_NOT_ACTIVE");
  }

  if (!profile.wallet_verified_at || profile.registration_status !== "complete") {
    const healed = await db.from("testnet_tester_profiles").update({
      wallet_verified_at: new Date().toISOString(),
      registration_status: "complete",
      updated_at: new Date().toISOString(),
    }).eq("principal_id", profile.principal_id);
    if (healed.error) throw healed.error;
  }

  await provisionTestnetMeteredAccess(String(profile.principal_id));
  const session = await issueTesterSession(String(profile.principal_id));

  return {
    principal_id: String(profile.principal_id),
    profile_name: String(profile.profile_name ?? profileName(input.profileName, walletAddress)),
    wallet_address: walletAddress,
    wallet_verified: true,
    access_status: "active",
    account_created: accountCreated,
    session_token: session.session_token,
    session_expires_at: session.session_expires_at,
    payment_model: "pay_per_call",
    max_credits_per_30_days: 500,
    execution_authorized: false,
  } as const;
}

export async function retireSupersededTesterSession(input: {
  sessionId: string;
  principalId: string;
  canonicalPrincipalId: string;
}) {
  const db = requireRiskSupabase();
  const now = new Date().toISOString();
  const revoked = await db.from("testnet_tester_sessions")
    .update({ revoked_at: now, last_seen_at: now })
    .eq("id", input.sessionId)
    .eq("principal_id", input.principalId)
    .is("revoked_at", null);
  if (revoked.error) throw revoked.error;

  if (input.principalId !== input.canonicalPrincipalId) {
    const stale = await db.from("testnet_tester_profiles")
      .update({ registration_status: "revoked", access_status: "revoked", updated_at: now })
      .eq("principal_id", input.principalId)
      .eq("access_status", "pending_verification");
    if (stale.error) console.warn("[testnet-wallet-auth] stale pending profile cleanup failed", stale.error.message);
  }
}
