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

## Before actual 90-day driver kickoff

Predge must confirm its **own** server-enforced partner quota and credential
header: target ~100 checks/day, HARD maximum 500/day. They must provide
settlement-risk endpoint specification, current signing key, independent live
networked PUBLIC_SANDBOX signed sample and signed/countersigned LOI v2 with
email-agreed kickoff date. Geomacro verifies signature, clock, numeric ID,
origin, actual server counters and fail-closed responses. No fees, prepaid
costs or minimum commitments. A public research news feed alone is **not**
an agreement to redistribute structured intelligence commercially.
Legacy Supabase-backed risk-gate endpoint is not a deployed replacement
for the isolated partner pilot; don't send a paid request or claim production
GO until the external gates are verified.

Relevant canonical sources:
`schemas/gro-1.1.schema.json`, `src/lib/risk-gate-contract.ts`,
`src/lib/risk-gate-api.server.ts`,
`docs/ops/PREDGE_SHARED_72H_DERIVED_NEWS_FEED_20261019.md`.

## One-token automatic *private* research delivery (pilot-only)

After the protected D1 Worker deploy the authenticated route is:
`GET https://geomacro-control-plane.daspallab202391.workers.dev/v1/partner/predge/derived-structural-72h`.
Use `Authorization: Bearer <dedicated-research-token>`. The dedicated token
is HMAC-derived *server-side only* from the existing production ledger secret,
under a different domain-separated label than the administration token.
**Never disclose** the root/admin secret to Predge. Share the single dedicated
token through an agreed secure partner channel; it is not returned in GitHub
Actions or this repository.

No partner-scope receipt, per-item rights-review receipt or individual item
ID allowlist is needed for **private non-commercial research evaluation**:
the feed automatically returns exactly the same up-to-600 **public-eligible**
72-hour derived item IDs as Geomacro Intelligence. Predge deduplicates by
`id` while polling, and sees source-native clocks and unclassified flags.
No new D1 table, B2 downloads, Supabase, payment or private-publisher scrape.

The pilot-only path never allows paid use, public or customer-facing resale,
unreviewed third-party material, credited items requiring visibly disclosed
publisher attribution, signed GRO or automated Risk Gate approval. Treat
the records as **driver candidates**, not Risk Gate decisions: Predge's
`risk-gate-1.0` still requires a separately verified current `gro-1.1`
and a policy evaluation. `execution_authorized=false` always.

Maximum provisional pilot expiry is **2027-01-17T00:00:00Z** (90 days
from proposed Oct 19 UTC kickoff). This does not assert a countersigned
LOI or give rights beyond the separately written pilot agreement; if
the actual agreed kickoff differs, reconfigure before any extension.
