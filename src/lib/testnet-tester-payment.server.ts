import { createHash } from "node:crypto";

import { GEOMACRO_CREDIT_CONTRACT_VERSION } from "./commercial-access-contract";
import { requireRiskSupabase } from "./risk-supabase.server";
import { STRUCTURED_DATA_REGISTRY_VERSION } from "./structured-data-entitlement-registry";
import {
  TESTNET_API_CREDIT_PRICE_USDC,
  TESTNET_API_FIXED_CREDITS,
  TESTNET_API_FIXED_QUOTA_ATOMIC,
  TESTNET_API_FIXED_QUOTA_USDC,
  TESTNET_API_PRICING_VERSION,
} from "./testnet-api-pricing";
import { TESTNET_USDC_ACCESS_CHAINS } from "./testnet-usdc-access-contract";
import { verifyTestnetUsdcPayment } from "./testnet-usdc-payment-verification.server";

export type TestnetTesterPaymentActivation = {
  ok: true;
  idempotent_replay: boolean;
  payment_event_id: string;
  entitlement_grant_id: string;
  credits_granted: number;
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

async function alignTestnetPricingMetadata(input: {
  entitlementGrantId: string;
  paymentEventId: string;
}) {
  const db = requireRiskSupabase();
  const metadataPatch = {
    quota_credits: TESTNET_API_FIXED_CREDITS,
    credit_price_testnet_usdc: TESTNET_API_CREDIT_PRICE_USDC,
    quota_price_usdc: TESTNET_API_FIXED_QUOTA_USDC,
    fixed_quota_per_verified_wallet: true,
    testnet_api_pricing_version: TESTNET_API_PRICING_VERSION,
    commercial_revenue: false,
    execution_authorized: false,
  };

  const grant = await db
    .from("commercial_entitlement_grants")
    .select("metadata")
    .eq("id", input.entitlementGrantId)
    .maybeSingle();
  if (grant.error || !grant.data) throw new Error("TESTNET_ENTITLEMENT_PRICING_ALIGNMENT_FAILED");
  const grantUpdate = await db
    .from("commercial_entitlement_grants")
    .update({ metadata: { ...(grant.data.metadata ?? {}), ...metadataPatch } })
    .eq("id", input.entitlementGrantId)
    .eq("tier", "testnet_tester");
  if (grantUpdate.error) throw new Error("TESTNET_ENTITLEMENT_PRICING_ALIGNMENT_FAILED");

  const payment = await db
    .from("commercial_payment_events")
    .select("metadata,amount_atomic,amount_decimal,environment,commercial_revenue")
    .eq("id", input.paymentEventId)
    .maybeSingle();
  if (payment.error || !payment.data) throw new Error("TESTNET_PAYMENT_PRICING_ALIGNMENT_FAILED");
  if (
    payment.data.environment !== "testnet" ||
    payment.data.commercial_revenue !== false ||
    BigInt(String(payment.data.amount_atomic)) < TESTNET_API_FIXED_QUOTA_ATOMIC ||
    Number(payment.data.amount_decimal) < TESTNET_API_FIXED_QUOTA_USDC
  ) {
    throw new Error("TESTNET_PAYMENT_PRICING_ALIGNMENT_FAILED");
  }
  const paymentUpdate = await db
    .from("commercial_payment_events")
    .update({ metadata: { ...(payment.data.metadata ?? {}), ...metadataPatch } })
    .eq("id", input.paymentEventId)
    .eq("environment", "testnet");
  if (paymentUpdate.error) throw new Error("TESTNET_PAYMENT_PRICING_ALIGNMENT_FAILED");
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
  if (BigInt(verification.amount_atomic) < TESTNET_API_FIXED_QUOTA_ATOMIC) {
    return { ok: false, code: "UNDERPAYMENT" };
  }

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
      "TESTNET_FIXED_QUOTA_ALREADY_ACTIVATED",
      "TESTNET_USDC_UNDERPAYMENT",
    ].find((code) => message.includes(code));
    return { ok: false, code: knownCode ?? "TESTNET_ACTIVATION_FAILED" };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) return { ok: false, code: "TESTNET_ACTIVATION_FAILED" };

  const entitlementGrantId = String(row.entitlement_grant_id);
  const paymentEventId = String(row.payment_event_id);
  try {
    await alignTestnetPricingMetadata({ entitlementGrantId, paymentEventId });
  } catch {
    return { ok: false, code: "TESTNET_PRICING_ALIGNMENT_FAILED" };
  }

  return {
    ok: true,
    idempotent_replay: row.idempotent_replay === true,
    payment_event_id: paymentEventId,
    entitlement_grant_id: entitlementGrantId,
    credits_granted: Number(row.credits_granted ?? 0),
    expires_at: row.expires_at ? String(row.expires_at) : null,
    commercial_revenue: false,
  };
}
