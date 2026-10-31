# GeoMacro PayPal cross-border merchant setup (India) — 2026-10-31

**Status: integration scaffold staged; PayPal account not connected, no production charge, no credit issuance.**
GeoMacro remains on the existing Base/Polygon USDC x402 rail for crypto-native per-delivery payments.
PayPal is a **separate, fiat** cross-border checkout option; Stripe is not a selected merchant checkout provider.

## Verified market boundaries

- PayPal India sellers cannot receive domestic India-to-India PayPal payments. Eligible foreign customers may pay in supported currencies.
- An unregistered freelancer/business can choose a **Business Individual** account and may not need proof of incorporation; identity verification still applies. PayPal merchant KYC for international payments requires PAN, a linked bank, a purpose code and requested supporting documents. Check account-specific export/IEC requirements with PayPal.
- PayPal India withdraws to the linked Indian bank automatically. **Do not promise automatic Base/Polygon USDC settlement.**
- PayPal recurring subscription capabilities vary by merchant, product and market; verify in the account and test recurring lifecycle before enabling $9/$29/$99 recurring collection.

Sources:
- https://www.paypal.com/in/cshelp/article/can-i-use-paypal-to-receive-payments-from-indian-customers-help1049
- https://www.paypal.com/in/cshelp/article/how-do-i-receive-payments-through-paypal-help667
- https://www.paypal.com/in/cshelp/article/how-do-i-sign-up-for-a-paypal-account--help315
- https://www.paypal.com/in/cshelp/article/how-do-i-transfer-funds-to-my-bank-account-help394
- https://developer.paypal.com/api/rest/webhooks/rest/
- https://developer.paypal.com/platforms/subscriptions/integrate/

## Owner setup (never paste secrets in chat, source control or issues)

1. Sign into https://www.paypal.com/ and confirm the account is an appropriate **Business / Business Individual** merchant account; complete PayPal KYC, bank linkage and purpose code. Confirm international merchant payment receiving is enabled.
2. Visit https://developer.paypal.com/dashboard/applications/sandbox and create/select a dedicated **GeoMacro** REST application. Locate Sandbox Client ID and Client Secret. Use only the server's encrypted environment-secret manager.
3. Save `GEOMACRO_PAYPAL_ENVIRONMENT=sandbox`, `GEOMACRO_PAYPAL_CLIENT_ID`, `GEOMACRO_PAYPAL_CLIENT_SECRET`. Do not use a live credential in sandbox mode.
4. Before registering live webhooks, deploy a durable webhook handler with an idempotent event store, PayPal verification and reconciliation. Then register a provider webhook to a **verified HTTPS listener** and record its actual ID as `GEOMACRO_PAYPAL_WEBHOOK_ID` (this repository currently has *no* accepting listener).
5. Sandbox-test successful captures, pending, denied, refund, dispute/chargeback, webhook replay and outage. Cross-check the exact amount, currency, order, payee, event and original server-side SKU using PayPal Orders API.
6. Implement and independently verify atomic **one-time credit funding** and **30-day subscription credit renewals** with unique capture/period keys, principal authentication, refunds/revocations and reconciliation. Never trust client-provided prices or a success redirect; never grant credits from an unverified webhook alone.
7. Only after separate merchant approval, webhook+ledger acceptance, operations go/no-go and owner authorization: add an actual PayPal checkout button and enable live transactions. A deployment, API key or green UI badge alone is not permission to charge.

## Installed code / API

- `src/lib/paypal-checkout-readiness.ts`: immutable, founder-priced SKUs ($9/$29/$99 and $5/$15/$30), India eligibility, fiat payout disclosure, active-checkout false.
- `src/lib/paypal-api.server.ts`: server-only PayPal OAuth and provider postback webhook signature verification; **no order create, capture or granting**.
- `GET /api/v1/payments/paypal`: public no-store, read-only configuration-status discovery. It emits only booleans, never client secrets.
- `POST /api/v1/payments/paypal`: always HTTP 503 and no charge.
- `GET /api/v1/pricing`: public PayPal readiness alongside other pricing and network catalogs.
- `/pricing`: unchanged under the active website presentation lock. PayPal is discoverable through server pricing/status APIs only until a separate approved website release.

**Never treat `credentials_present` as connection or KYC verification.** PayPal verification proves a message came from PayPal, not that captured funds are spendable, that an entitlement was granted, or that a merchant can legally accept a given customer.

## Launch acceptance (all independently required)

- [ ] Business Individual/Business full KYC and international receiving approved
- [ ] Sandbox REST API authentication successful (not just secrets present)
- [ ] Verified consumer/merchant account region and acceptable product classification
- [ ] Non-Indian payer test and card eligibility confirmed
- [ ] Signed provider webhooks with replay resistance; durable, private receipts
- [ ] Order create/approve/capture/retrieve, idempotent capture and amount/merchant identity reconciled
- [ ] One-time credit ledger atomic add; subscription period funding/retry/cancellation verified
- [ ] Refund, reversal, disputes, failures and partial grants reconcile without double credits
- [ ] Separate verified PayPal recurring merchant support and buyer consent
- [ ] USDC native x402 behavior preserved, no fiat-as-USDC claim
- [ ] Production canary with a real small authorized payment and matched credit readback
- [ ] Website and customer support policies, fees, taxes, refunds and compliance approved

No existing Predge code, workflow or credentials are part of this change.
