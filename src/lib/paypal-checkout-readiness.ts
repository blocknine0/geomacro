/**
 * GeoMacro PayPal cross-border checkout disclosure.
 *
 * India-based PayPal merchants receive eligible international fiat payments.
 * PayPal India is NOT an automatic card-to-USDC bridge: withdrawals are to a
 * linked Indian bank account, not to a Base or Polygon USDC wallet.
 *
 * Discovery and SDK configuration NEVER authorize a customer charge.
 */
import { GEOMACRO_SUBSCRIPTIONS, GEOMACRO_ONE_TIME_PACKS } from "./low-barrier-pricing";

export const GEOMACRO_PAYPAL_READINESS = Object.freeze({
  schema: "geomacro.paypal-crossborder-readiness.v1",
  provider: "paypal",
  merchant_region: "IN",
  proposed_checkout_currency: "USD",
  eligible_buyer_scope: "CROSS_BORDER_ONLY",
  india_domestic_payments_supported: false,
  merchant_account_type_required: "VERIFIED_BUSINESS",
  merchant_account_approval_verified: false,
  merchant_credentials_verified: false,
  active_checkout_enabled: false,
  subscription_renewal_enabled: false,
  credit_pack_checkout_enabled: false,
  recurring_billing_requires_account_eligibility: true,
  credit_funding_requires_atomic_settlement_ledger: true,
  webhook_signature_verification_required: true,
  settlement_type: "FIAT_TO_LINKED_INDIAN_BANK",
  settlement_asset: "INR_BANK_PAYOUT",
  merchant_receives_usdc: false,
  stripe_checkout_enabled: false,
  status: "MERCHANT_ONBOARDING_AND_LEDGER_PENDING",
  checkout_url: null,
  no_charge_before_verified_settlement: true,
} as const);

export const GEOMACRO_PAYPAL_PRODUCT_CATALOG = Object.freeze([
  ...GEOMACRO_SUBSCRIPTIONS.map(plan => ({
    id: plan.id,
    kind: "monthly_plan" as const,
    amount_usd: plan.price_usd,
    credits: plan.credits_per_30_days,
    checkout_enabled: false as const,
    auto_renewal_enabled: false as const,
  })),
  ...GEOMACRO_ONE_TIME_PACKS.map(pack => ({
    id: pack.id,
    kind: "one_time_credit_pack" as const,
    amount_usd: pack.price_usd,
    credits: pack.credits,
    checkout_enabled: false as const,
    auto_renewal_enabled: false as const,
  })),
]);

/** A marketing/catalog listing cannot be used as a payment authorization. */
export function paypalCanCaptureFunds() {
  return false as const;
}
