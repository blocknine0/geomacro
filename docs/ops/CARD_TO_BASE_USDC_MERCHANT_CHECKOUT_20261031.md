# GeoMacro — card-to-Base-USDC merchant checkout (pending provider approval)
**2026-10-31 · no-funds implementation and commercial activation gate**

## Objective
Let non-crypto buyers purchase GeoMacro plans and one-time credit packs with
debit/credit cards while the merchant receives verified native USDC on Base
(chain 8453). Preserve independent Base x402 direct crypto calls.

## Officially verified provider options
- MoonPay Commerce advertises `Pay with card` while merchant receives crypto;
  supports Base/USDC, self-serve pay links, and Creator Verification. Its
  broader MoonPay product country restrictions list India as unsupported.
  **India merchant eligibility and exact walletless checkout must be explicitly
  approved by MoonPay Commerce**, not inferred from marketing.
  https://www.moonpay.com/business/commerce
  https://support.moonpay.com/en/articles/625495-how-to-verify-your-moonpay-commerce-account
  https://support.moonpay.com/en/articles/380968-moonpay-s-unsupported-countries
- NOWPayments supports customer USD invoices via Mercuryo fiat-to-crypto,
  settling chosen crypto to the merchant wallet. Fiat operations require
  provider KYC/KYB and may require corporate documents, so suitability for an
  India-based unregistered individual is **not verified**.
  https://nowpayments.io/help/payments/fiat-payments/how-to-accept-fiat
  https://nowpayments.io/help

## Owner-only setup (never paste secrets into public chat/repo)
1. Obtain written confirmation from selected provider for India-resident
   **individual merchant**, card-originating payment for SaaS/API credits,
   Base-mainnet native USDC payout, supported buyer countries, refund /
   chargeback policy, minimums and all onramp + card + merchant fees.
2. Complete provider-required KYC/KYB; verify the wallet holder. No
   registered-business or tax exemption may be assumed.
3. In provider portal create six product/paylinks with amounts $9/$29/$99
   (30-day entitlements; manual renewal unless recurring authorized),
   $5/$15/$30 (one-time credits). Do NOT use one shareable link as
   sufficient proof of which GeoMacro customer paid.
4. Configure callback endpoint with provider-specific signature (MoonPay
   Commerce Bearer shared webhook token, or NOWPayments HMAC SHA-512)
   and unique merchant order ID generated server-side. Only allowlisted
   provider hosts and callback origins, constant-time signature comparison,
   authentic replay-safe event retrieval and provider API reconciliation.
5. Store the order and invoice intent in canonical D1, and an append-only,
   idempotent funding receipt keyed by provider + transaction ID + order.
   Confirm exact amount, actual Base USDC contract, chain id, merchant wallet,
   settlement tx finality, and customer entitlement mapping. If contradictory
   state, chargeback, invoice status unclear, wrong chain, or duplicate:
   freeze and reconcile; never auto-issue credits.
6. Activate a live card button **only after** real no-funds readback,
   signed webhook tests, failed/duplicate/partial/reversal tests, true
   merchant authorization, wallet recipient proof, and live provider card
   availability. Never silently set activation flags.

## Status
This code only discloses a **nonpayable** potential checkout route. It contains
no real merchant credentials, no checkout URL, no buyer card collection and
no credit-funding side effect. Card payment approval and complete
end-to-end settlement remain **BLOCKED** until the owner completes provider
onboarding and independent production acceptance.

The existing PREDGE integration and Global Risk presentation are not modified.
