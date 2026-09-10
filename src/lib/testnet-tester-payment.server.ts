import { createHash } from "node:crypto";

import { GEOMACRO_CREDIT_CONTRACT_VERSION } from "./commercial-access-contract";
import { requireRiskSupabase } from "./risk-supabase.server";
import { STRUCTURED_DATA_REGISTRY_VERSION } from "./structured-data-entitlement-registry";
import { TESTNET_USDC_ACCESS_CHAINS } from "./testnet-usdc-access-contract";
import { verifyTestnetUsdcPayment } from "./testnet-usdc-payment-verification.server";

export type TestnetTesterPaymentActivation = {
  ok: true;
  idempotent_replay: boolean;
  payment_event_id: string;
  entitlement_grant_id: string;
  credits_granted: 250;
  expires_at: string | null;
  commercial_revenue: false;
} | {
  ok: false;
  code: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value.toLowerCase()).digest("hex");
}

function decimalBlockNumber(hex: string) {
  if (!/^0x[0-9a-fA-F]+$/.test(hex)) throw new Error("Invalid verified block number");
  return BigInt(hex).toString();
}

export async function activateTestnetTesterPayment(input: {
  principal_id: string;
  chain_key: string;
  tx_hash: string;
  payer_address: string;
  env?: Record<string, string | undefined>;
}): Promise<TestnetTesterPaymentActivation> {
  if (!/^[0-9a-fA-F-]{36}$/.test(input.principal_id)) {
    return { ok: false, code: "INVALID_PRINCIPAL_ID" };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.payer_address)) {
    return { ok: false, code: "INVALID_PAYER_ADDRESS" };
  }

  const verification = await verifyTestnetUsdcPayment({
    chain_key: input.chain_key,
    tx_hash: input.tx_hash,
    expected_payer: input.payer_address,
    env: input.env,
  });
  if (!verification.ok) return verification;

  const chain = TESTNET_USDC_ACCESS_CHAINS[verification.chain_key];
  const db = requireRiskSupabase();
  const { data, error } = await db.rpc("activate_verified_testnet_usdc_pass", {
    p_principal_id: input.principal_id,
    p_chain_id: String(chain.chain_id),
    p_network_name: chain.name,
    p_usdc_contract: verification.usdc_contract,
    p_tx_hash: verification.tx_hash,
    p_payer_address_hash: sha256(verification.payer_address),
    p_recipient_address_hash: sha256(verification.recipient_address),
    p_amount_atomic: verification.amount_atomic,
    p_amount_usdc: verification.amount_usdc,
    p_block_number: decimalBlockNumber(verification.block_number),
    p_registry_version: STRUCTURED_DATA_REGISTRY_VERSION,
    p_contract_version: GEOMACRO_CREDIT_CONTRACT_VERSION,
  });

  if (error) {
    const message = String(error.message ?? "");
    const knownCode = [
      "TESTNET_PROFILE_NOT_FOUND",
      "TESTNET_REGISTRATION_INCOMPLETE",
      "TESTNET_PROFILE_NOT_ACTIVE",
      "TESTNET_PAYER_WALLET_MISMATCH",
      "TESTNET_PAYMENT_ALREADY_CLAIMED",
      "TESTNET_PAYMENT_RECONCILIATION_REQUIRED",
      "TESTNET_PAYMENT_CLAIM_STATE_CONFLICT",
    ].find((code) => message.includes(code));
    return { ok: false, code: knownCode ?? "TESTNET_ACTIVATION_FAILED" };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) return { ok: false, code: "TESTNET_ACTIVATION_FAILED" };

  return {
    ok: true,
    idempotent_replay: row.idempotent_replay === true,
    payment_event_id: String(row.payment_event_id),
    entitlement_grant_id: String(row.entitlement_grant_id),
    credits_granted: 250,
    expires_at: row.expires_at ? String(row.expires_at) : null,
    commercial_revenue: false,
  };
}
