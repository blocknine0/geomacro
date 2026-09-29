# Geomacro x402 D1 delivery ledger

This Worker is the independent atomic delivery ledger for Coinbase CDP x402. It is intentionally separate from B2: B2 remains the data/archive layer, while D1 provides the transactional replay/idempotency state needed around irreversible payment settlement.

## Safety model

The Worker stores only hashes and delivery state. It never receives or stores raw payment signatures, authorization payloads, Coinbase API credentials, or plaintext payer/recipient wallet addresses.

The state machine preserves the production invariants used by the current Supabase ledger:

- one payment fingerprint is bound to one request/configuration;
- new payment proofs are atomically claimed with a five-minute lease;
- a delivered payment replays the already prepared response and is never settled twice;
- conflicting request reuse returns `CONFLICT`;
- active claims return `IN_PROGRESS`;
- `prepared` is the irreversible-side-effect boundary;
- an expired prepared lease becomes `MANUAL_REVIEW`, never an automatic retry;
- only pre-settlement `processing`/`failed` state may be reclaimed;
- completion requires the same claim token and an already prepared response;
- settlement transaction hashes are unique per network.

## One-time Cloudflare setup

Keep production on the current Supabase ledger until all of these steps have passed.

1. Create a D1 database named `geomacro-x402-ledger` in the Cloudflare dashboard or Wrangler.
2. Copy `wrangler.template.jsonc` to a local/deployment-only `wrangler.jsonc` and replace `REPLACE_WITH_D1_DATABASE_ID` with the real D1 database ID. Do not commit account credentials.
3. Apply `schema.sql` to the D1 database.
4. Add Worker secret `LEDGER_SHARED_SECRET` with at least 32 random bytes/characters.
5. Deploy the Worker and verify `GET /health` returns `{ "ok": true }`.
6. Run claim -> prepare -> complete -> replay acceptance tests against the deployed Worker, including conflict and expired-prepared/manual-review cases.
7. Only after those tests pass, configure the Geomacro server runtime with:
   - `X402_LEDGER_BACKEND=edge_d1`
   - `COMMERCE_LEDGER_URL=https://<deployed-worker-host>`
   - `COMMERCE_LEDGER_SHARED_SECRET=<same-secret>`
8. Run the existing x402 prelaunch safety suite and paid testnet E2E again before considering Supabase optional for the payment delivery ledger.

`X402_LEDGER_BACKEND` defaults to `supabase`, so merely merging this worker does not change the live payment path.
