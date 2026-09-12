# Geomacro Testnet Tester deployment configuration

This is the launch configuration for the current wallet-first, pay-per-call Testnet Developer API. It does not define mainnet or production commercial pricing.

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

The public Testnet launch uses the verified EVM wallet as the primary identity. It is wallet-first rather than profile-first:

1. connect one EVM wallet;
2. request a short-lived, one-time EIP-4361 sign-in challenge;
3. sign the exact message containing domain, URI, version, wallet chain ID, nonce, issued time and expiration time;
4. the server verifies the signature and atomically consumes the one-time nonce;
5. if the wallet already owns a Testnet tester account, resume that existing account instead of creating a duplicate;
6. if the wallet is new, create one tester account after signature verification. A display name is optional and is used only for this first creation;
7. provision or resume the `testnet_tester_metered_30d` entitlement;
8. rotate to a secure HttpOnly tester session whose raw token is never returned to browser JavaScript;
9. create API Key + API Secret credentials;
10. use the developer API.

Repeated sign-in with the same verified wallet must never create another tester profile. Any stale pre-wallet-first pending session is revoked only after a fresh successful wallet proof and successful canonical-account sign-in.

There is no email verification, X account connection or Discord connection in the current product flow. Those identity integrations are retired from the runtime and are not launch configuration. There is also no upfront Testnet USDC activation payment. Wallet sign-in is a message signature only and does not authorize a transaction or funds movement.

## X sharing after a successful test

X is used only as an optional outbound share action after a real Testnet result is delivered. The tester does not connect an X account to Geomacro.

The Testnet Console can create the existing professional Geomacro result card and open an X post composer with the result link. No X OAuth token, X account ID or social-login credential is requested or stored. This is a growth/share CTA only and never gates API access, credits, payment or intelligence delivery.

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
4. receive HTTP `402` with exact credit cost, required Testnet USDC amount, receiver, supported-chain details and an exact-request fingerprint;
5. persist the exact request/quote state before opening any wallet payment;
6. send exactly the quoted Testnet USDC from the same verified tester wallet;
7. preserve the transaction hash immediately after submission;
8. retry the exact same `request_id` and payload with `chain_key`, `tx_hash` and `payer_address`;
9. runtime verifies exact-request binding, RPC chain identity, USDC contract, payer, recipient, confirmation and required amount;
10. credits are consumed exactly once and canonical intelligence is delivered.

The same payment transaction cannot be reused for another request. Exact retries are idempotent and must not create a second charge or credit consumption. Reload/timeout recovery must reuse the preserved transaction proof and must not initiate a second transfer.

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
3. `/testnet-access` shows the wallet-first, no-upfront-payment flow.
4. Unauthenticated `/api/testnet/account` and `/api/testnet/intelligence` fail closed with no premium data leakage.
5. A new wallet completes EIP-4361 sign-in → account creation → entitlement → secure session → API Key + Secret.
6. The same wallet signs in again and resumes the same principal/profile with no duplicate account.
7. A wallet already registered under the earlier flow signs in and is recovered to its existing canonical tester account instead of receiving `TESTNET_WALLET_ALREADY_REGISTERED`.
8. `GET /api/testnet/account` returns the active 500-credit account without consuming credits.
9. A real unpaid intelligence request returns the exact HTTP 402 quote and exact-request fingerprint.
10. A real Testnet USDC payment from the verified wallet unlocks the exact same request and decrements credits exactly once.
11. Deliberate timeout/reload after transaction submission reuses the same transaction hash and produces no second transfer prompt or duplicate charge.
12. Exact replay produces no second credit consumption, while the same `request_id` with changed payload is rejected.
13. Negative cases pass for wrong wallet, wrong chain, wrong token, wrong receiver, underpayment, reused transaction, stale/replayed proof, revoked credential, concurrent clicks/retries and invalid API responses.
14. `intelligence_query`, `gri_read`, structural country/corridor, signed GRO and Risk Gate bundle are exercised with compatible live subjects. Prefer an 8/8 capability pass before opening public testing.
15. Returned signed GRO payload hash and Ed25519 signature are independently verified.
16. Risk Gate always reports `execution_authorized=false`.
17. A successful result can create the Geomacro share card and open one X post composer without X account connection or OAuth.
18. Security, resilience and database replay gates are green and launch evidence is retained.

Preserve request IDs, request fingerprints, key IDs but never secrets, wallet address, sign-in chain, payment chain, transaction hash, Testnet amount, payment/usage event IDs, credits before/after, timestamps, response hashes, duplicate-charge count and verification results.

`execution_authorized` remains false throughout the Testnet tester program.
