# Free / Managed Infrastructure Scaling Policy

Geomacro should use hosted/free infrastructure wherever it is operationally sufficient and does not weaken the intelligence source boundary, payment custody, rights controls, idempotency, audit trail or fail-closed behavior.

The canonical first-cohort operating policy is `docs/COMMERCIAL_FREE_QUOTA_20K_PLAN.md`.

## Preferred services

- Backblaze B2: raw/history/archive evidence after checksum and readback verification.
- Supabase Free: compact hot read model and temporary control-plane state, not the long-term raw archive.
- Cloudflare Workers Free + D1: small stateless edge glue and the independently tested x402 atomic delivery ledger.
- GitHub Actions: public-repository standard runners for CI, evidence generation and controlled scheduled jobs.
- Telegram APIs: permitted public-channel ingestion/discovery under Telegram's terms and Geomacro's corroboration boundary.
- GDELT and official/public RSS or APIs: open-source intelligence ingestion where the exact source and reuse rights are verified.

## Payment facilitator boundary

Do not build a Geomacro payment facilitator unless a concrete provider gap requires it.

For the zero/near-zero-cost first 20,000-delivery cohort, Circle Gateway batching is the preferred payment-rail candidate only after a real production canary proves its seller/provider/onchain economics and replay behavior. Geomacro currently integrates `@circle-fin/x402-batching` and checks `GatewayWalletBatched` support on the approved Base mainnet path.

Coinbase/CDP hosted x402 remains a production-capable exact-settlement fallback. It must not be used as a silent fallback when its measured settlement or network-cost profile would break the cohort's reserved cost budget.

Do not assume a nominal batch size or operation count. Measure the actual production behavior and reserve capacity from observed canary data before certifying 20,000-delivery capacity.

The facilitator verifies/settles payment. Geomacro remains the source of truth for request identity, deliverability, entitlement, intelligence output, replay/idempotency and reconciliation.

## Free-tier admission control

A payable request may be issued only after worst-case free-tier capacity is reserved for the request path.

Internal watermarks:

- below 60%: normal operation;
- 60-80%: reduce optional enrichment and refresh frequency;
- 80-90%: only hot/cached deterministic paid paths;
- 90% or above: stop issuing new payable challenges for any path that could exceed free capacity.

Never auto-upgrade a provider plan and never create an unbudgeted paid overage.

## Safety rules

Free/managed infrastructure must never:

- expose provider private keys or signing material to browsers;
- expose raw source URLs/content or private retrieval payloads through paid product answers;
- bypass source-rights eligibility;
- bypass payment/delivery idempotency;
- convert testnet or sandbox activity into revenue;
- hide provider or source failures behind successful-looking intelligence;
- delete unverified archived data;
- delete `storage.objects` via SQL;
- accept payment when the requested intelligence cannot be proven deliverable;
- make a paid LLM/API call a mandatory dependency during the zero/near-zero-cost cohort.

This policy does not authorize production funds or a public launch.
