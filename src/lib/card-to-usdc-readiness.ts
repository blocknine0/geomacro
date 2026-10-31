/**
 * Buyer card -> USDC merchant settlement readiness contract (NO FUNDS).
 *
 * A fiat onramp is not automatically an approved merchant checkout.
 * No provider has been approved for this India-based merchant at this time.
 * User KYC, merchant verification, regional availability, supported Base USDC
 * settlement and a settlement-bound, idempotent credit ledger are prerequisites.
 */
import { GEOMACRO_SUBSCRIPTIONS, GEOMACRO_ONE_TIME_PACKS } from "./low-barrier-pricing";

export const GEOMACRO_CARD_TO_USDC_READINESS = Object.freeze({
  schema: "geomacro.card-to-usdc-readiness.v1",
  checkout_status: "MERCHANT_PROVIDER_APPROVAL_REQUIRED",
  enabled: false,
  merchant_verified: false,
  buyer_card_support_verified: false,
  provider_live_merchant_credentials_verified: false,
  individual_merchant_eligibility_verified: false,
  customer_country_support_verified: false,
  native_base_usdc_settlement_verified: false,
  webhook_authenticity_verified: false,
  durable_idempotent_funding_verified: false,
  automatic_subscription_card_renewal_enabled: false,
  billing_currency: "USD",
  settlement_network: "eip155:8453",
  settlement_asset: "USDC",
  payout_wallet_configured: false,
  checkout_url: null,
  payment_attempts: 0,
  credits_issued: 0,
  provider_options: [
    {
      id: "moonpay_commerce",
      name: "MoonPay Commerce",
      merchant_individual_verification_option: "CREATOR_VERIFICATION",
      merchant_india_eligibility: "UNVERIFIED",
      card_to_crypto_supported_in_eligible_regions: true,
      geo_eligibility_required: true,
    },
    {
      id: "nowpayments",
      name: "NOWPayments",
      merchant_individual_registration_option: "INDIVIDUAL",
      fiat_operations_kyc_kyb_required: true,
      base_usdc_payout_verified: false,
      fiat_invoice_provider_approval_required: true,
    },
  ],
} as const);

export const GEOMACRO_CARD_TO_USDC_PRODUCTS = Object.freeze([
  ...GEOMACRO_SUBSCRIPTIONS.map(p => ({
    id: p.id, price_usd: p.price_usd, credit_allocation: p.credits_per_30_days,
    product_type: "subscription_period",
    renewal: "MANUAL_UNLESS_SEPARATE_CARD_RECURRING_AUTHORIZATION_VERIFIED",
    checkout_enabled: false,
  })),
  ...GEOMACRO_ONE_TIME_PACKS.map(p => ({
    id: p.id, price_usd: p.price_usd, credit_allocation: p.credits,
    product_type: "one_time_credit_pack",
    renewal: "NONE", checkout_enabled: false,
  })),
]);

/** Never construct merchant fiat/card charge URLs from customer-provided values. */
export function cardToUsdcCanOpenCheckout() {
  return false as const;
}
