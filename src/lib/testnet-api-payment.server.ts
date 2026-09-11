import { createHash } from "node:crypto";

import {
  GEOMACRO_CREDIT_COSTS,
  type GeomacroCreditCapability,
} from "./commercial-access-contract";
import {
  CommercialAccessError,
  consumeCommercialCapability,
  ensureCommercialCreditAccount,
  type CommercialCreditResult,
  type CommercialPrincipal,
  type CommercialResolvedEntitlement,
} from "./commercial-access.server";
import {
  TESTNET_API_CREDIT_PRICE_USDC,
  TESTNET_API_PRICING_VERSION,
  testnetApiCallPriceAtomic,
  testnetApiCallPriceUsdc,
} from "./testnet-api-pricing";
import type { TestnetPaymentProof } from "./testnet-intelligence-contract";
import { requireRiskSupabase } from "./risk-supabase.server";
import {
  TESTNET_USDC_ACCESS_CHAINS,
  requireTestnetUsdcReceiver,
} from "./testnet-usdc-access-contract";
import { verifyTestnetUsdcPayment } from "./testnet-usdc-payment-verification.server";

function sha256Text(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function testnetApiPaymentQuote(capability: GeomacroCreditCapability) {
  const creditCost = GEOMACRO_CREDIT_COSTS[capability];
  return {
    payment_model: "pay_per_call" as const,
    upfront_payment_required: false as const,
    asset: "USDC" as const,
    environment: "testnet" as const,
    credit_cost: creditCost,
    credit_price_usdc: TESTNET_API_CREDIT_PRICE_USDC,
    amount_due_usdc: testnetApiCallPriceUsdc(creditCost),
    amount_due_atomic: testnetApiCallPriceAtomic(creditCost).toString(),
    receiver_address: requireTestnetUsdcReceiver(),
    pricing_version: TESTNET_API_PRICING_VERSION,
    supported_chains: Object.values(TESTNET_USDC_ACCESS_CHAINS),
    commercial_revenue: false as const,
  };
}

async function assertCreditCapacity(input: {
  principal: CommercialPrincipal;
  capability: GeomacroCreditCapability;
}) {
  const db = requireRiskSupabase();
  const accountResult = await db
    .from("commercial_credit_accounts")
    .select("id,included_credits,credits_used,period_ends_at,status")
    .eq("principal_type", "api_client")
    .eq("principal_id", input.principal.principal_id)
    .maybeSingle();

  if (accountResult.error || !accountResult.data) {
    throw new CommercialAccessError(
      503,
      "COMMERCIAL_CREDIT_ACCOUNT_UNAVAILABLE",
      "Testnet credit account could not be resolved.",
    );
  }

  const existingUsage = await db
    .from("commercial_credit_usage")
    .select("request_id")
    .eq("account_id", accountResult.data.id)
    .limit(1);
  if (existingUsage.error) {
    throw new CommercialAccessError(
      503,
      "COMMERCIAL_USAGE_UNAVAILABLE",
      "Testnet usage accounting is temporarily unavailable.",
    );
  }

  const remaining =
    Number(accountResult.data.included_credits) - Number(accountResult.data.credits_used);
  const cost = GEOMACRO_CREDIT_COSTS[input.capability];
  if (accountResult.data.status !== "active") {
    throw new CommercialAccessError(403, "CREDIT_ACCOUNT_INACTIVE", "Testnet credit account is not active.");
  }
  if (new Date(String(accountResult.data.period_ends_at)).getTime() <= Date.now()) {
    throw new CommercialAccessError(403, "CREDIT_PERIOD_EXPIRED", "The Testnet 30-day credit period has expired.");
  }
  if (remaining < cost) {
    throw new CommercialAccessError(
      402,
      "INSUFFICIENT_CREDITS",
      `Only ${Math.max(0, remaining)} Testnet credits remain; this call requires ${cost}. No payment has been requested.`,
    );
  }
}

export type TestnetSettlementResult =
  | {
      status: "payment_required";
      quote: ReturnType<typeof testnetApiPaymentQuote>;
    }
  | {
      status: "settled";
      quote: ReturnType<typeof testnetApiPaymentQuote>;
      usage: CommercialCreditResult;
      payment: {
        payment_model: "pay_per_call";
        chain_key: string;
        chain_id: number;
        tx_hash: string;
        amount_paid_usdc: string;
        amount_due_usdc: number;
        credit_price_usdc: number;
        pricing_version: string;
        commercial_revenue: false;
      };
    };

export async function settleTestnetApiCall(input: {
  principal: CommercialPrincipal;
  entitlement: CommercialResolvedEntitlement;
  request_id: string;
  capability: GeomacroCreditCapability;
  payment?: TestnetPaymentProof;
}): Promise<TestnetSettlementResult> {
  if (input.entitlement.tier !== "testnet_tester") {
    throw new CommercialAccessError(
      403,
      "TESTNET_TESTER_ENTITLEMENT_REQUIRED",
      "This endpoint is restricted to Testnet tester entitlements.",
    );
  }

  await ensureCommercialCreditAccount({
    principal: input.principal,
    tier: input.entitlement.tier,
  });

  const db = requireRiskSupabase();
  const accountResult = await db
    .from("commercial_credit_accounts")
    .select("id,included_credits,credits_used,period_ends_at,status")
    .eq("principal_type", "api_client")
    .eq("principal_id", input.principal.principal_id)
    .maybeSingle();
  if (accountResult.error || !accountResult.data) {
    throw new CommercialAccessError(503, "COMMERCIAL_CREDIT_ACCOUNT_UNAVAILABLE", "Testnet credit account could not be resolved.");
  }

  const replayUsage = await db
    .from("commercial_credit_usage")
    .select("request_id,capability,credit_cost")
    .eq("account_id", accountResult.data.id)
    .eq("request_id", input.request_id)
    .maybeSingle();
  if (replayUsage.error) {
    throw new CommercialAccessError(503, "COMMERCIAL_USAGE_UNAVAILABLE", "Testnet usage accounting is temporarily unavailable.");
  }
  if (replayUsage.data) {
    if (
      String(replayUsage.data.capability) !== input.capability ||
      Number(replayUsage.data.credit_cost) !== GEOMACRO_CREDIT_COSTS[input.capability]
    ) {
      throw new CommercialAccessError(
        409,
        "TESTNET_REQUEST_IDEMPOTENCY_CONFLICT",
        "This request_id is already bound to a different Testnet capability.",
      );
    }
  } else {
    await assertCreditCapacity({ principal: input.principal, capability: input.capability });
  }

  const quote = testnetApiPaymentQuote(input.capability);
  if (!input.payment) return { status: "payment_required", quote };

  const payerAddress = input.payment.payer_address.toLowerCase();
  const requiredAtomic = BigInt(quote.amount_due_atomic);
  const verified = await verifyTestnetUsdcPayment({
    chain_key: input.payment.chain_key,
    tx_hash: input.payment.tx_hash,
    expected_payer: payerAddress,
    minimum_amount_atomic: requiredAtomic,
  });
  if (!verified.ok) {
    throw new CommercialAccessError(
      402,
      `TESTNET_${verified.code}`,
      "The Testnet USDC payment proof is not sufficient for this API call.",
    );
  }

  const profile = await db
    .from("testnet_tester_profiles")
    .select("access_status,wallet_address_hash")
    .eq("principal_id", input.principal.principal_id)
    .maybeSingle();
  if (profile.error) {
    throw new CommercialAccessError(503, "TESTNET_PROFILE_UNAVAILABLE", "Testnet profile validation is temporarily unavailable.");
  }
  if (!profile.data || profile.data.access_status !== "active") {
    throw new CommercialAccessError(403, "TESTNET_ACCESS_NOT_ACTIVE", "Testnet developer access is not active.");
  }
  if (profile.data.wallet_address_hash !== sha256Text(payerAddress)) {
    throw new CommercialAccessError(403, "TESTNET_PAYER_WALLET_MISMATCH", "The payer does not match the verified Testnet wallet.");
  }

  const existingRequest = await db
    .from("testnet_usdc_payment_claims")
    .select("id,tx_hash,capability,credit_cost,verification_status")
    .eq("principal_id", input.principal.principal_id)
    .eq("request_id", input.request_id)
    .maybeSingle();
  if (existingRequest.error) {
    throw new CommercialAccessError(503, "TESTNET_PAYMENT_LEDGER_UNAVAILABLE", "Testnet payment ledger is temporarily unavailable.");
  }

  if (existingRequest.data) {
    const sameProof =
      String(existingRequest.data.tx_hash).toLowerCase() === verified.tx_hash &&
      String(existingRequest.data.capability) === input.capability &&
      Number(existingRequest.data.credit_cost) === GEOMACRO_CREDIT_COSTS[input.capability];
    if (!sameProof) {
      throw new CommercialAccessError(
        409,
        "TESTNET_PAYMENT_IDEMPOTENCY_CONFLICT",
        "This request_id is already bound to a different payment or capability.",
      );
    }
  } else {
    const usedTx = await db
      .from("testnet_usdc_payment_claims")
      .select("id,request_id")
      .eq("chain_id", String(verified.chain_id))
      .eq("tx_hash", verified.tx_hash)
      .maybeSingle();
    if (usedTx.error) {
      throw new CommercialAccessError(503, "TESTNET_PAYMENT_LEDGER_UNAVAILABLE", "Testnet payment ledger is temporarily unavailable.");
    }
    if (usedTx.data) {
      throw new CommercialAccessError(409, "TESTNET_PAYMENT_ALREADY_CLAIMED", "This Testnet transaction has already been used for another API request.");
    }

    const claim = await db.from("testnet_usdc_payment_claims").insert({
      principal_id: input.principal.principal_id,
      chain_id: String(verified.chain_id),
      network_name: TESTNET_USDC_ACCESS_CHAINS[verified.chain_key].name,
      usdc_contract: verified.usdc_contract,
      tx_hash: verified.tx_hash,
      payer_address_hash: sha256Text(verified.payer_address),
      recipient_address_hash: sha256Text(verified.recipient_address),
      amount_atomic: verified.amount_atomic,
      amount_usdc: verified.amount_usdc,
      verification_status: "pending",
      request_id: input.request_id,
      capability: input.capability,
      credit_cost: GEOMACRO_CREDIT_COSTS[input.capability],
      required_amount_atomic: quote.amount_due_atomic,
      pricing_version: TESTNET_API_PRICING_VERSION,
    });
    if (claim.error) {
      throw new CommercialAccessError(409, "TESTNET_PAYMENT_CLAIM_CONFLICT", "The Testnet payment proof could not be reserved for this API request.");
    }
  }

  let usage: CommercialCreditResult;
  try {
    usage = await consumeCommercialCapability({
      principal: input.principal,
      entitlement: input.entitlement,
      requestId: input.request_id,
      capability: input.capability,
    });
  } catch (error) {
    await db
      .from("testnet_usdc_payment_claims")
      .update({
        verification_status: "rejected",
        rejected_at: new Date().toISOString(),
        rejection_code:
          error instanceof CommercialAccessError
            ? error.code
            : "USAGE_ACCOUNTING_FAILED",
      })
      .eq("principal_id", input.principal.principal_id)
      .eq("request_id", input.request_id);
    throw error;
  }

  const finalize = await db
    .from("testnet_usdc_payment_claims")
    .update({
      verification_status: "verified",
      verified_at: new Date().toISOString(),
      rejected_at: null,
      rejection_code: null,
    })
    .eq("principal_id", input.principal.principal_id)
    .eq("request_id", input.request_id);
  if (finalize.error) {
    throw new CommercialAccessError(
      503,
      "TESTNET_PAYMENT_FINALIZATION_FAILED",
      "Payment verification succeeded but the Testnet audit record could not be finalized.",
    );
  }

  return {
    status: "settled",
    quote,
    usage,
    payment: {
      payment_model: "pay_per_call",
      chain_key: verified.chain_key,
      chain_id: verified.chain_id,
      tx_hash: verified.tx_hash,
      amount_paid_usdc: verified.amount_usdc,
      amount_due_usdc: quote.amount_due_usdc,
      credit_price_usdc: TESTNET_API_CREDIT_PRICE_USDC,
      pricing_version: TESTNET_API_PRICING_VERSION,
      commercial_revenue: false,
    },
  };
}
