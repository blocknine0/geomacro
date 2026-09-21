# Free / Managed Infrastructure Scaling Policy

Geomacro should use hosted/free infrastructure wherever it is operationally sufficient and does not weaken the intelligence source boundary, payment custody, rights controls, or audit trail.

## Preferred services

- GitHub Actions: public-repository standard runners for CI, evidence generation and controlled scheduled jobs.
- Cloudflare Workers Free: small stateless edge glue, health routing or webhook normalization only.
- Supabase Free: bounded staging/control-plane workloads where quota and inactivity limits are acceptable.
- Telegram APIs: permitted public-channel ingestion/discovery under Telegram's terms and Geomacro's corroboration boundary.
- GDELT and official/public RSS or APIs: open-source intelligence ingestion where the exact source and reuse rights are verified.

## Payment facilitator boundary

Do not build a Geomacro payment facilitator unless a concrete provider gap requires it.

Coinbase/CDP hosted x402 is the primary managed-facilitator candidate for compatible networks. Any secondary facilitator is fallback/canary only after independent verification of network compatibility, settlement semantics, reliability, custody and audit behavior.

The facilitator verifies/settles payment. Geomacro remains the source of truth for request identity, entitlement, intelligence delivery and reconciliation.

## Safety rules

Free/managed infrastructure must never:
- expose provider private keys or signing material to browsers;
- bypass source-rights eligibility;
- bypass payment/delivery idempotency;
- convert testnet or sandbox activity into revenue;
- hide provider or source failures behind successful-looking intelligence.

This policy does not authorize production funds or a public launch.
