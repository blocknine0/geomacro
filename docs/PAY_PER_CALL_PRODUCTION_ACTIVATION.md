# Geomacro x402 production activation — canonical capability contract

**State as of 2026-10-17: CONTROLLED PRELAUNCH / NO FUNDS.**
This document is a runbook, **not** proof of a current deployment, licensed intelligence, hot snapshots, settlement readiness or commercial revenue. Supabase remains frozen. Do not re-enable Supabase to complete a payment path.

## Sole authoritative USDC schedule

Version: `geomacro.capability-usdc.v2`. Code: `src/lib/capability-pricing-catalog.ts`. Contract: `docs/GEOMACRO_INTELLIGENCE_CONTRACT_V1.md`. The website and both x402 rails must use this schedule after actual runtime acceptance.

| Capability | Approved variant → USDC |
| --- | --- |
| `gri_read` | `verified_cached` 0.005; `verified_change_attribution` 0.01 |
| `structural_country_digest` | `standard` 0.02 |
| `structural_corridor_digest` | `standard` 0.05 |
| `structural_country_profile` | `standard` 0.03 |
| `structural_corridor_profile` | `standard` 0.08 |
| `intelligence_query` | `focused` 0.05; `standard` 0.10; `complex_multi_source` 0.15 |
| `signed_risk_object` | `existing_valid_signed` 0.05; `newly_qualified_signed` 0.10 |
| `risk_gate_bundle` | `existing_proof_preflight` 0.10; `standard` 0.15; `complex_multi_source` 0.25 |

No hidden surcharge, forced subscription, automatic future tier change or double-charge of the Risk Gate's included signed Risk Object. Six-decimal exact USDC atomic amounts are computed server-side. Historical fixed-price environment variables and old 10k/20k adoption projections are **not** a pricing authority. Testnet charges are never revenue.

## Product and serving boundary

Primary machine endpoint: `POST https://geomacro.live/api/v1/intelligence/query`. Legacy `/api/x402/intelligence` is a compatibility alias; neither route creates a separate intelligence engine.

For every chargeable request: derive canonical capability/variant and exact scope → retrieve genuine native-clock originals, validate same-event evidence and private per-source derived-use rights → prepare a qualified real signed response from the canonical engine → independently verify signer/key, immutable hash, source_as_of and expiry → verify current B2/D1 readback and exact customer-deliverable bytes → issue a server-bound x402 v2 quote with the correct Base USDC token/network/recipient/amount/expiry → authenticate and verify payment proof → once-only settlement and durable claim/reconciliation → deliver exactly the prepared response and preserved payment receipt.

If any prerequisite fails, return a truthful **no-charge** status. No 402 challenge for stale/unqualified/not-deliverable material. Source identities, raw payloads and upstream URLs must never enter public commercial JSON. Never fabricate current values or advance timestamps on old B2 snapshots.

## Mandatory no-funds acceptance before authorizing mainnet

1. Freeze the exact protected-main commit; pass Product CI, CodeQL, rights/signer and payment-negative tests. Compare deployed website/Worker executable SHA, not merely source mirror and static build marker.
2. Obtain genuinely fresh, rights-eligible source evidence and independently read back signed Intelligence, Global Risk and Risk Indices where those products are offered. Confirm real three-domain API readbacks, truthful unavailable/422 states and current deep-health product proofs; do not force HTTP 200 while evidence is missing.
3. Verify Supabase-free authenticated Cloudflare D1/B2/commerce Durable Object persistence, readback, expiry, Class-B operations and free-tier quotas. Production B2 historical archives are **not** current evidence.
4. Review draft [x402 capability quote integration PR #2242](https://github.com/blocknine0/geomacro/pull/2242) for correct current-main parity. It is **not merged** and must not be deployed from a draft. Prove the exact final HTTP response, including envelope metadata, is bound to a frozen verified prequote and settled payment; do not rely on a prepared-payload hash alone.
5. With **no funds**, verify invalid amount, token, network, recipient, unknown variant, rights, signer, expired quote, replay, concurrent duplicate, changed query, ambiguous settlement, fee/double-charge and missing-product cases fail closed. Verify independent two-readback ledger and customer-byte identity. Capture redacted receipts/run IDs.
6. Configure server-only production Coinbase/Circle credentials and the controlled receiver **only after acceptance**. No secrets or wallet keys in repository, logs, GitHub issues or this document. Any provider-specific legacy `COINBASE_X402_PRICE_USDC=0.05` setting must not override the per-capability authoritative quote.

## Real-money launch boundary

The two production launch acknowledgements are separate:
`GEOMACRO_COMMERCIAL_LAUNCH_ACK` and `COINBASE_X402_MAINNET_ACK`.
Do **not** set either merely because this runbook exists or code tests pass. Require explicit separate founder approval of real-money activation, a verified Base mainnet recipient and configured credentials; no founder-prefunded buyer is required for no-funds checks. First real mainnet purchase (owner-approved canary or independent buyer) must prove 402 → verified settlement → signed byte-identical response → exactly-once replay/ledger reconciliation. Until then `commercial_revenue_verified=false`.

After first reconciled transaction, enable only verified variants with quotas, kill switch, alerts and truthful API/agent marketplace inventory. Preserve `execution_authorized=false`. Never claim broader 195×3 signed product coverage than real accepted results. Close production issue checkboxes only with exact SHA, external production acceptance and receipt, not merged code alone.

## Emergency stop

Freeze new settlement through `GEOMACRO_COMMERCE_EMERGENCY_FREEZE=true` and quarantine affected provider via `GEOMACRO_COMMERCE_DISABLED_PROVIDERS`. Preserve ledger records for reconciliation, do not silently retry ambiguous settlements. Re-enable only after safety acceptance.
