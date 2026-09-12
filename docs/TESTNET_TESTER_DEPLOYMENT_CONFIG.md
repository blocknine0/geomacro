# Geomacro Testnet Tester deployment configuration

This is the launch configuration for the current wallet-only, pay-per-call Testnet Developer API. It does not define mainnet or production commercial pricing.

## Source authorities

- Application source: GitHub `main`
- Production application database: external Supabase project `ldpwajisioljyjtojvfx`
- Frontend/SSR hosting: Lovable, synced from GitHub `main`

Lovable-hosting variables must not select a different Supabase project. `VITE_SUPABASE_*` is not part of the production database contract.

## Core hosted runtime required for launch

The hosted SSR/API runtime must have:

- `APP_SUPABASE_URL` pointing to `https://ldpwajisioljyjtojvfx.supabase.co`
- `APP_SUPABASE_ANON_KEY`
- `APP_SUPABASE_SERVICE_ROLE_KEY`
- `HISTORICAL_SUPABASE_URL`
- `HISTORICAL_SUPABASE_SERVICE_ROLE_KEY`
- `TESTNET_USDC_RECEIVER_ADDRESS`
- `TESTNET_RPC_ARC`
- `TESTNET_RPC_BASE_SEPOLIA`
- `TESTNET_RPC_POLYGON_AMOY`
- `PUBLIC_SITE_URL=https://geomacro.live`

No secret above may use a `VITE_` prefix. `TESTNET_USDC_RECEIVER_ADDRESS` is a public receiving address only. Geomacro never needs the receiver wallet private key.

The historical/structural warehouse variables are required for the country/corridor digest/profile and Risk Gate bundle portions of the full eight-capability Testnet API surface.

## Signed Risk Object runtime

To keep `signed_risk_object` and `risk_gate_bundle` fully operational, the hosted/server environment must also have the governed Risk Object key configuration used by the current production publisher/verifier:

- `RISK_OBJECT_SIGNING_KEY_ID`
- `RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64`
- `RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64`
- `RISK_OBJECT_VERIFY_KEYS_JSON`
- optional key validity window variables when used

Private signing material is server-only. Public verification material may be exposed only through the governed public verification route, never by leaking environment configuration.

## Current tester identity flow

The public Testnet launch is wallet-only:

1. create a tester profile;
2. receive a secure tester session;
3. connect one EVM wallet;
4. sign the exact non-transaction verification message;
5. Geomacro verifies the signature and provisions the `testnet_tester_metered_30d` entitlement;
6. create API Key + API Secret credentials;
7. use the developer API.

There is no upfront Testnet USDC activation payment. Wallet verification does not authorize a transaction or funds movement.

Email, X and Discord are not required for the current Testnet API launch. Their existing routes are optional integrations only. If they are intentionally enabled later, configure the corresponding `RESEND_*`, `TESTNET_OAUTH_COOKIE_SECRET`, X OAuth and Discord OAuth variables and provider callback URLs separately.

## Pay-per-call contract

- 500 credits maximum per 30 days
- 0.5 Testnet USDC per credit
- no upfront payment
- Testnet only, non-revenue
- supported payment chains: Arc Testnet, Base Sepolia and Polygon Amoy

For each paid request:

1. authenticate with Testnet API Key + API Secret;
2. send the capability request without payment proof;
3. capability/data availability is preflighted before payment;
4. receive HTTP `402` with exact credit cost, required Testnet USDC amount, receiver and supported-chain details;
5. send exactly the quoted Testnet USDC from the same verified tester wallet;
6. retry the same `request_id` with `chain_key`, `tx_hash` and `payer_address`;
7. runtime verifies RPC chain identity, USDC contract, payer, recipient, confirmation and required amount;
8. credits are consumed exactly once and canonical intelligence is delivered.

The same payment transaction cannot be reused for another request. Exact retries are idempotent and must not create a second charge or credit consumption.

## Full Testnet API surface

Machine discovery and account status:

- `GET /api/testnet/manifest`
- `GET /api/testnet/account`

Metered intelligence:

- `POST /api/testnet/intelligence`

The canonical Testnet entitlement exposes all eight current capabilities:

- `intelligence_query`
- `gri_read`
- `structural_country_digest`
- `structural_corridor_digest`
- `structural_country_profile`
- `structural_corridor_profile`
- `signed_risk_object`
- `risk_gate_bundle`

`risk_gate_bundle` is the broadest machine-decision response. It includes Risk Gate decision context, the canonical signed GRO + verification, structural/live severity context and canonical GRI/change-attribution context. It never authorizes downstream execution.

## Pre-live acceptance gate

Do not call the Testnet API launch complete until all of these pass on the published production domain:

1. `/api/health` reports the current GitHub/Supabase/Lovable alignment contract.
2. `/api/testnet/manifest` returns all eight capabilities and canonical pay-per-call pricing.
3. `/testnet-access` shows the wallet-only, no-upfront-payment flow.
4. Unauthenticated `/api/testnet/account` and `/api/testnet/intelligence` fail closed with no premium data leakage.
5. One real tester completes profile → wallet signature → entitlement → API Key + Secret.
6. `GET /api/testnet/account` returns the active 500-credit account without consuming credits.
7. A real unpaid intelligence request returns the exact HTTP 402 quote.
8. A real Testnet USDC payment from the verified wallet unlocks the same request and decrements credits exactly once.
9. Exact replay produces no double payment/credit consumption.
10. Negative cases pass for wrong wallet, wrong chain, wrong token, wrong receiver, underpayment, reused transaction, conflicting `request_id`, revoked credential and timeout/retry.
11. `intelligence_query`, `gri_read`, structural country/corridor, signed GRO and Risk Gate bundle are exercised with compatible live subjects. Prefer an 8/8 capability pass before opening public testing.
12. Returned signed GRO payload hash and Ed25519 signature are independently verified.
13. Risk Gate always reports `execution_authorized=false`.
14. Security, resilience and database replay gates are green and launch evidence is retained.

Preserve request IDs, key IDs but never secrets, chain, transaction hash, Testnet amount, payment/usage event IDs, credits before/after, timestamps, response hashes and verification results.

## Optional social/email routes

If optional X/Discord OAuth is enabled later, exact callback URLs are:

- X: `https://geomacro.live/api/testnet-tester/oauth/x/callback`
- Discord: `https://geomacro.live/api/testnet-tester/oauth/discord/callback`

These optional identity integrations are not a prerequisite for Testnet Developer API access.

`execution_authorized` remains false throughout the Testnet tester program.
