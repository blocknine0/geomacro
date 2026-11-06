# Canonical repository integration

The Step 1–2 package is integrated here as an isolated commercial service. It does
not replace or duplicate balances from the existing D1 customer ledger. Legacy
customer keys and balances remain in their existing store; this PostgreSQL ledger
is used only by the new commercial service's own account/key namespace. No balance
migration or free-credit import is performed.

Cloudflare uses `src/worker.mjs` and `wrangler.jsonc`. The database adapter calls a
service-key-only PostgREST gateway; the `geomacro` schema remains private. The
adapter refuses SQL transaction commands. Each mutation invokes its complete
atomic PostgreSQL function; it never pretends separate HTTP calls share a database
transaction. `sql/rpc-gateway.sql` must be installed after the three base SQL files.

Protected main deployment reuses existing Cloudflare and risk-buffer Supabase
secrets, derives a domain-separated Ed25519 receipt issuer from the protected root
secret, deploys the Worker, and verifies its exact commit SHA, database RPC and
public key. A receipt signature does not turn Basic activity proxies into
certified Risk Indices. The existing watchdog/reviewer requirements are unchanged.

`/health` reports configuration blockers; `/v1/readiness` proves the private ledger
RPC can be read. Neither endpoint claims merchant activation, real settlement,
certified evidence coverage, or a tested SLA. Incomplete payment configuration
keeps that rail unavailable. Deployment never fabricates a wallet address,
merchant status, entitlement or real-funds acknowledgement, and never sends a
payment. Emergency freeze and provider quarantine stay independent of owner
launch authorization.

The persistent financial schema is outside the public seven-day risk-buffer
tables and their retention jobs. Receipts and ledger records are append-only.
The new service's ledger does not depend on the retired primary Supabase project.
Deployment does not alter existing D1/B2 collection or certified index routes.

Rotation: keep historical public keys before replacing the root/signing seed;
stored receipts must remain verifiable under their original key IDs. The initial
Worker key ID includes its public fingerprint. The receipt issuer is separate
from the existing institutional GRO and provisional decision signing scopes.

The qualified evidence adapter and prepaid `/v1/risk-gate` contract are Step 3.
Until that adapter is installed, x402 refuses to settle an unqualified result.
