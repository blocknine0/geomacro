# Supabase-Independent Commerce Ledger

Status: **implementation complete in repository; Cloudflare production deployment and runtime activation remain separately gated**

## Purpose

Geomacro's paid x402 delivery path must remain replay-safe and exactly-once even if Supabase is unavailable. Backblaze B2 remains the archive/data plane, but it is not used as the atomic payment-claim database because its S3-compatible PutObject path does not provide the conditional-create primitive required for a race-free distributed claim.

The independent commerce control plane therefore uses a Cloudflare SQLite-backed Durable Object while preserving the existing Supabase ledger as a rollback backend during migration.

## Runtime contract

`GEOMACRO_COMMERCE_LEDGER_BACKEND=supabase`

- current/default behavior;
- all claim/prepare/complete/release transitions use the existing Supabase RPC ledger;
- safe rollback state while the independent worker is not deployed.

`GEOMACRO_COMMERCE_LEDGER_BACKEND=durable_object`

- claim/prepare/complete/release use the Cloudflare Worker only;
- no silent fallback to Supabase is allowed;
- worker unavailability fails the paid request closed before duplicate settlement can occur.

Required server-only settings in durable mode:

- `GEOMACRO_COMMERCE_LEDGER_URL`
- `GEOMACRO_COMMERCE_LEDGER_TOKEN`

Worker secret:

- `LEDGER_SHARED_TOKEN` — must exactly match the application token and be at least 32 random characters.

## Coordination model

One Durable Object is selected per `(provider, provider_environment)` pair. This keeps both critical uniqueness rules inside one strongly consistent transaction domain:

1. one payment fingerprint can bind to only one normalized paid request;
2. one provider settlement reference can bind to only one payment fingerprint.

The first 20,000-delivery launch cohort is intentionally optimized for correctness and free-tier operation rather than extreme single-provider throughput. High-scale sharding is a later capacity track and must preserve a globally coordinated settlement-reference index before it is allowed into real-funds mode.

## State machine

The independent ledger mirrors the existing Supabase semantics:

- `processing` — request claimed before settlement;
- `prepared` — exact response payload and hash durably written immediately before the external settlement side effect;
- `delivered` — settlement reference recorded and response replayable without another charge;
- `failed` — pre-settlement failure; safe to reclaim with a fresh lease;
- `manual_review` — settlement may have happened or another ambiguous post-prepare condition exists; automatic re-charge is blocked.

A prepared lease that expires is moved to `manual_review` with `PREPARED_LEASE_EXPIRED_RECONCILIATION_REQUIRED`. It is never automatically re-settled.

## Privacy boundary

The worker stores payment and request fingerprints, response payload/hash, bounded product/network metadata, hashed payer/recipient references, settlement reference, and transition timestamps. It must never receive or persist:

- private keys or seed phrases;
- x402 payment-signature/header material;
- provider API keys;
- raw payer/recipient credentials;
- Supabase service-role keys.

## Deployment

Repository deployment is intentionally manual and fail-closed through `.github/workflows/deploy-commerce-ledger-worker.yml`.

The workflow requires these GitHub production-environment secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `GEOMACRO_COMMERCE_LEDGER_TOKEN` — at least 32 characters; injected into the Worker as `LEDGER_SHARED_TOKEN`

The workflow pins Cloudflare Wrangler Action v4.1.3 to its exact commit and pins Wrangler `4.136.3`. It:

1. validates that all deployment secrets are present without printing them;
2. deploys `workers/commerce-ledger/wrangler.jsonc`;
3. injects only `LEDGER_SHARED_TOKEN` into the Worker;
4. requires a returned HTTPS Worker origin;
5. probes `/health`;
6. runs `scripts/ops/verify-commerce-ledger-worker.mjs` against the deployed Durable Object using synthetic, no-funds provider scope;
7. verifies claim/conflict/concurrency/prepare/complete/replay/duplicate-settlement/reclaim semantics;
8. performs no Circle, Coinbase, Nevermined or other external settlement;
9. leaves `GEOMACRO_COMMERCE_LEDGER_BACKEND` activation as a separate gate.

After this workflow passes, configure the Geomacro server runtime with the Worker origin and matching token while leaving `GEOMACRO_COMMERCE_LEDGER_BACKEND=supabase`. Then run Supabase-off paid-route acceptance. Only after that acceptance passes should the backend be switched to `durable_object`. Real-funds authorization remains separate again.

## Required acceptance before Supabase can be treated as optional for money flow

- concurrent identical claims return exactly one `CLAIMED` and the rest `IN_PROGRESS`/`REPLAY`;
- same payment fingerprint with a different request returns `CONFLICT`;
- prepared response survives worker restart/eviction;
- expired prepared lease enters `MANUAL_REVIEW`;
- duplicate settlement reference across different payments is rejected;
- completed delivery replays the exact stored response without another settlement;
- worker outage fails paid delivery closed;
- Supabase outage while durable mode is active does not affect claim/prepare/complete/replay;
- Circle, Coinbase and Nevermined route ordering remains `deliverability -> claim -> verify -> prepare -> settle -> complete -> response`;
- post-settlement completion ambiguity remains reconciliation-only and never auto-recharges.

Only after these tests pass may the commerce delivery ledger be marked Supabase-independent.
