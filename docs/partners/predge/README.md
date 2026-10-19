# Predge x Geomacro — ready-to-build driver handoff (19 October 2026)

**Compatibility:** GRO `gro-1.1` and advisory Risk Gate `risk-gate-1.0`.
**Scope:** private 90-day free pilot integration and real, unscored *public
research* observations. No new key, wallet, payment, source rights or production
authorization is granted by this pack.

## Live input to connect immediately

```bash
curl --fail-with-body --retry 2 --retry-delay 5 \
  'https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/derived-structural-72h'
```

The `items[]` are derived from the **same 72-hour D1 journal as the Geomacro
Intelligence page**, retaining stable `id`, `category`, original
`original_published_at` and source-native `date_precision`.
Use `?domain=geopolitics`, `?domain=macro` or `?domain=rare_earth`;
`availability_by_category` reports all three regardless. Poll every 15–30
minutes and deduplicate on **item.id**, NOT solely on publication time.
Treat 200 + empty `items` as no observed qualified release and 503 as an
actual outage. Never add inferred score, direction, subject ISO3 or legal
eligibility to unclassified candidates. Records explicitly mark
`commercial_derived_rights_verified:false`, `signed_product_verified:false`,
`payable:false`, and no source-neutral redistribution rights.

## Confirmed free research feed: no private partner gate

The **existing public** `derived-structural-72h` GET may be read for the
90-day internal **testing and validation** scope, with zero payment, no
partner key and no per-item private approval receipt. The separate
`/v1/partner/predge/derived-structural-72h` authenticated pilot route
from PR #2501 requires **one dedicated securely shared research Bearer
token**, not repeated item-ID, partner-scope or reviewer receipts. The source-neutral
journal validator and upstream content-rights exclusions still apply.
Do not confuse the token-free public GET with the **dedicated-token private
research GET**. The private route must pass its real post-deploy authenticated
versus anonymous acceptance before delivery is called operational.
Neither route requires a signed GRO, per-item private clearance or x402
settlement for the explicitly non-commercial evaluation data.

Use the *same* D1-derived observation `id`, original publication clock,
category, candidate-vs-classified state and Geomacro context across the
Intelligence website and Predge driver. Observations are advisory. No
record from this free endpoint can authorize an order, a trade, a settlement,
a risk-gate `CONTINUE`, downstream redistribution or a claimed signed score.
The original 72h window, publishing delay, producer-freshness signals and
mandatory-source-credit withholding remain enforced.

Predge's market-specific `market_id`, `condition_id`, signed market state,
`risk_level`, `uma_state`, `dispute_count` and resolution status **must
come from Predge's independently verified market feed**. These are NOT
fields guaranteed by Geomacro's unscored news observation response. Merge
only after verifying Predge's published signing key, message hash, numeric
market identity and timestamp. Missing or unsigned market fields remain
unknown, never inferred from Geomacro context.

## Driver fields (actual implementation contracts)

A Risk Gate v1 request needs `request_id`,
`subject:{type:"country"|"corridor",id}`, and `policy`:
`policy_id`, `policy_version`, `continue_max_score`,
`reduce_limit_max_score`, `require_approval_max_score`,
`minimum_confidence_for_auto_continue`,
`require_commercial_verification_for_continue`. Optional
`max_positive_delta_for_auto_continue`, `hard_stop_driver_contributions`,
`action_context:{action_type,amount,currency,destination,metadata}`.

Response fields: `schema_version:risk-gate-1.0`, `request_id`,
`decision:CONTINUE|REDUCE_LIMIT|REQUIRE_APPROVAL|PAUSE`,
`recommended_action:ALLOW|REDUCE_EXPOSURE|REQUIRE_HUMAN_APPROVAL|BLOCK`,
`reason_codes[]`, `counterfactual`, `subject`, `risk`,
`top_drivers[]`, `policy`, and **`execution_authorized:false`**.
Even `CONTINUE` is *advisory*, never payment or trade permission.
For a Predge settlement-risk record require exact signed `market_id`
**numeric** and `condition_id` bindings, verify Ed25519 canonical UTF-8
signature and content hash from Predge's published key, enforce freshness,
and use signed `dispute_count`/`sent_to_uma_vote` where a `disputes[]`
array omits records. An unsigned slug is insufficient. Predge clean
cannot override a more restrictive Geomacro decision; absent actual verified
current GRO => fail closed `PAUSE` / human review.

## Included examples

* `gro-country-example.json` — old canonical country test-vector,
  **unsigned as a GRO**. NOT a verified current source observation.
* `gro-corridor-example.json` — synthetic corridor shape only,
  **unsigned** and INCOMPLETE.
* `risk-gate-request.json` — pilot-only request structure; example IDs
  and monetary context are synthetic.
* `risk-gate-response.json` — illustrative fail-closed advisory.
* `manifest.json` — machine-readable field and scope contract.
For real GRO delivery request an independently signed and unexpired
`gro-1.1` object with its `integrity`, `verification`, evidence and
rights flags unchanged. **Never relabel these fixtures as production signatures.**

## For separately gated signed-market driver acceptance

For the separately gated signed-market driver, Predge must confirm its
**own** server-enforced partner quota and credential header: target ~100
checks/day, HARD maximum 500/day. **Neither quota nor credential is
required for the existing free public research news GET.** They must provide
settlement-risk endpoint specification, current signing key, independent live
networked PUBLIC_SANDBOX signed sample and signed/countersigned LOI v2 if required for the separate signed-market
integration, with the mutually agreed kickoff date. Geomacro verifies signature, clock, numeric ID,
origin, actual server counters and fail-closed responses. No fees, prepaid
costs or minimum commitments. A public research news feed alone is **not**
an agreement to redistribute structured intelligence commercially.
The existing unsigned research feed is available separately from any
legacy Supabase-backed Risk Gate endpoint. Do not send a paid request or
claim signed-market driver production GO until external signature,
counter and policy gates are verified. The first real-input feedback
milestone is **2 November 2026**, with earlier integration blockers to be
reported as they arise. That future update is not proof of a completed test.

Relevant canonical sources:
`schemas/gro-1.1.schema.json`, `src/lib/risk-gate-contract.ts`,
`src/lib/risk-gate-api.server.ts`,
`docs/ops/PREDGE_SHARED_72H_DERIVED_NEWS_FEED_20261019.md`.
