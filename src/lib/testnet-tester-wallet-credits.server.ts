import { GEOMACRO_CREDIT_CONTRACT_VERSION } from "./commercial-access-contract";
import { requireRiskSupabase } from "./risk-supabase.server";

export type WalletVerifiedTesterCredits = {
  ok: true;
  idempotent_replay: boolean;
  entitlement_grant_id: string;
  credits_granted: number;
  quota_credits: 500;
  expires_at: string | null;
  commercial_revenue: false;
};

export async function activateWalletVerifiedTesterCredits(principalId: string): Promise<WalletVerifiedTesterCredits> {
  if (!/^[0-9a-fA-F-]{36}$/.test(principalId)) throw new Error("INVALID_PRINCIPAL_ID");

  const db = requireRiskSupabase();
  const { data, error } = await db.rpc("activate_wallet_verified_testnet_pass", {
    p_principal_id: principalId,
    p_contract_version: GEOMACRO_CREDIT_CONTRACT_VERSION,
  });

  if (error) {
    const message = String(error.message ?? "");
    const knownCode = [
      "TESTNET_PROFILE_NOT_FOUND",
      "TESTNET_WALLET_NOT_VERIFIED",
      "TESTNET_PROFILE_NOT_ACTIVE",
      "TESTNET_ENTITLEMENT_VERSION_REQUIRED",
    ].find((code) => message.includes(code));
    throw new Error(knownCode ?? "TESTNET_WALLET_CREDIT_ACTIVATION_FAILED");
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) throw new Error("TESTNET_WALLET_CREDIT_ACTIVATION_FAILED");

  return {
    ok: true,
    idempotent_replay: row.idempotent_replay === true,
    entitlement_grant_id: String(row.entitlement_grant_id ?? ""),
    credits_granted: Number(row.credits_granted ?? 0),
    quota_credits: 500,
    expires_at: row.expires_at ? String(row.expires_at) : null,
    commercial_revenue: false,
  };
}
