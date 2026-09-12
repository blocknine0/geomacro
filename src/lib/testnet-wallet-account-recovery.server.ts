import { createHash, randomBytes } from "node:crypto";
import { verifyMessage } from "ethers";

import { GEOMACRO_CREDIT_CONTRACT_VERSION } from "./commercial-access-contract";
import { requireRiskSupabase } from "./risk-supabase.server";
import { STRUCTURED_DATA_REGISTRY_VERSION } from "./structured-data-entitlement-registry";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalAddress(value: string) {
  const address = String(value ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw new Error("INVALID_WALLET_ADDRESS");
  return address;
}

function verificationMessage(principalId: string, walletAddress: string, nonce: string) {
  return [
    "Geomacro Testnet Tester wallet verification",
    `Principal: ${principalId}`,
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    "This signature does not authorize funds or transactions.",
  ].join("\n");
}

export async function recoverExistingTestnetWalletAccount(input: {
  principalId: string;
  sessionId: string;
  walletAddress: string;
  nonce: string;
  message: string;
  signature: string;
}) {
  const db = requireRiskSupabase();
  const now = new Date().toISOString();
  const walletAddress = canonicalAddress(input.walletAddress);
  const walletHash = sha256(walletAddress);
  const requiredMessage = verificationMessage(input.principalId, walletAddress, input.nonce);

  if (input.message !== requiredMessage) throw new Error("WALLET_CHALLENGE_MESSAGE_MISMATCH");
  if (canonicalAddress(verifyMessage(requiredMessage, input.signature)) !== walletAddress) {
    throw new Error("WALLET_SIGNATURE_INVALID");
  }

  const challenge = await db.from("testnet_wallet_challenges")
    .select("id,wallet_address_hash,expires_at,consumed_at")
    .eq("principal_id", input.principalId)
    .eq("nonce_hash", sha256(String(input.nonce ?? "")))
    .maybeSingle();
  if (challenge.error) throw challenge.error;
  if (!challenge.data || challenge.data.consumed_at || challenge.data.expires_at <= now) {
    throw new Error("WALLET_CHALLENGE_INVALID_OR_EXPIRED");
  }
  if (challenge.data.wallet_address_hash !== walletHash) {
    throw new Error("WALLET_CHALLENGE_ADDRESS_MISMATCH");
  }

  const existing = await db.from("testnet_tester_profiles")
    .select("principal_id,wallet_verified_at,registration_status,access_status")
    .eq("wallet_address_hash", walletHash)
    .neq("principal_id", input.principalId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data?.principal_id || !existing.data.wallet_verified_at || existing.data.registration_status !== "complete") {
    throw new Error("TESTNET_WALLET_ACCOUNT_NOT_VERIFIED");
  }
  if (["suspended", "revoked"].includes(String(existing.data.access_status ?? ""))) {
    throw new Error("TESTNET_WALLET_ACCOUNT_NOT_ACTIVE");
  }

  const existingPrincipalId = String(existing.data.principal_id);
  const provision = await db.rpc("provision_testnet_metered_access", {
    p_principal_id: existingPrincipalId,
    p_registry_version: STRUCTURED_DATA_REGISTRY_VERSION,
    p_contract_version: GEOMACRO_CREDIT_CONTRACT_VERSION,
  });
  if (provision.error) throw provision.error;
  const provisioned = (provision.data ?? {}) as Record<string, unknown>;
  if (!provisioned.ok) {
    throw new Error(String(provisioned.code ?? "TESTNET_METERED_ACCESS_PROVISION_FAILED"));
  }

  const consumed = await db.from("testnet_wallet_challenges")
    .update({ consumed_at: now })
    .eq("id", challenge.data.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (consumed.error) throw consumed.error;
  if (!consumed.data) throw new Error("WALLET_CHALLENGE_ALREADY_CONSUMED");

  const replacementSessionToken = `gms_test_${randomBytes(32).toString("base64url")}`;
  const replacementSessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const replacementInsert = await db.from("testnet_tester_sessions").insert({
    principal_id: existingPrincipalId,
    session_token_hash: sha256(replacementSessionToken),
    expires_at: replacementSessionExpiresAt,
  });
  if (replacementInsert.error) throw replacementInsert.error;

  const revokeCurrent = await db.from("testnet_tester_sessions")
    .update({ revoked_at: now, last_seen_at: now })
    .eq("id", input.sessionId)
    .eq("principal_id", input.principalId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (revokeCurrent.error) throw revokeCurrent.error;
  if (!revokeCurrent.data) throw new Error("TESTNET_SESSION_RECOVERY_FAILED");

  const cleanup = await db.from("testnet_tester_profiles")
    .update({ access_status: "revoked", updated_at: now })
    .eq("principal_id", input.principalId)
    .eq("access_status", "pending_verification");
  if (cleanup.error) {
    console.error("[testnet-wallet-recovery] pending duplicate profile cleanup failed", cleanup.error);
  }

  return {
    replacement_session_token: replacementSessionToken,
    session_expires_at: replacementSessionExpiresAt,
    recovered_existing_account: true,
    access_status: "active",
    payment_model: "pay_per_call",
    max_credits_per_30_days: 500,
  } as const;
}
