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


## Authenticated private news feed — no per-item approval, same D1 records

After protected deployment, the server-only private **pilot research** route is
`GET https://geomacro-control-plane.daspallab202391.workers.dev/v1/partner/predge/derived-structural-72h`.

It returns the exact `geomacro.derived-news-structural-feed.v1` items and
original publication clocks from the public website's shared D1 journal,
plus `geomacro.predge-derived-news-pilot.v1` delivery metadata:
`authenticated_partner_delivery:true`,
`individually_approved_item_ids_required:false`, and
`per_record_manual_review_receipt_required:false`. **No item ID allowlist,
second database, Supabase, B2 or per-item manual source review is needed**
for *public-eligible, non-redistributable pilot research observations*.
Both classified and clearly labeled unclassified first-party source
candidates may be included. Mandatory-credited or unsupported upstream
records remain withheld, as on the free Geomacro public feed.

One dedicated Bearer token is HMAC-derived from the *already configured*
production ledger-root secret with purpose `geomacro-predge-news-research-v1`;
it is separately masked and installed as a Cloudflare Worker secret on each
main deployment. The root token, the general control-plane credential and
private keys are never issued to Predge. **Partner token must be conveyed
through an actual secure authorized channel**, not GitHub, logs or website.
The production acceptance makes one authenticated call and checks that
unauthenticated calls receive HTTP 401; any missing key denies HTTP 503.
Rotate only repository production variable `PREDGE_NEWS_PILOT_VERSION`
(default `1`; increase the numeric version) and re-deploy to revoke
a partner credential **without rotating the commerce/control-plane root**.

Atomic existing D1 `central_security_budget` enforces **500 authenticated
news GETs per UTC day**, with 100/day suggested. Limit concerns news
research polling, not Predge's distinct external Risk Gate settlement checks.
The response is free/no-funds, not a signed `gro-1.1` or Predge
`settlement-risk` signature. Rights-review and a signed LOI remain necessary
for downstream commercial customer redistribution; the research pilot does
not quietly grant those rights or claim a signed kickoff.
