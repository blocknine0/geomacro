# Supabase-Independent Commerce Ledger

Status: **implementation branch; production activation not yet authorized**

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

From `workers/commerce-ledger` with an authenticated Cloudflare account:

1. create a random shared secret of at least 32 bytes;
2. set it as Worker secret `LEDGER_SHARED_TOKEN`;
3. deploy the Worker using `wrangler.jsonc`;
4. record the HTTPS Worker origin;
5. probe `/health`;
6. configure the Geomacro server runtime with the Worker origin and matching secret while leaving `GEOMACRO_COMMERCE_LEDGER_BACKEND=supabase`;
7. run the independent-ledger acceptance/chaos tests;
8. only after those pass, switch `GEOMACRO_COMMERCE_LEDGER_BACKEND=durable_object`;
9. run real-provider prelaunch checks again with real funds still disabled;
10. production activation remains separately owner-authorized.

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
