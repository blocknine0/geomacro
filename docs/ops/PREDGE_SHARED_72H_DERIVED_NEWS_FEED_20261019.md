## 2026-10-24 delivery correction (supersedes source-neutral parity below)

The authenticated Predge research route now projects the same bounded D1
journal with **visible required attribution**. The public source-neutral route
continues to exclude credited rows. Private and public item arrays can therefore
differ; acceptance reconstructs each projection independently from the immediate
D1 journal. IDs, native dates, derived prose, 72-hour retention, authentication,
500/UTC-day limit and pilot expiry are preserved.

Known collector credit labels travel in `sources_credited`, with
`attribution_required: true` and `attribution_notices`. Consumers must preserve
these notices. Unknown labels remain withheld. Statistics Canada notices identify
The Daily and the original reference date; OGL notices include the licence URL.
This factual research projection does not certify source rights, authorize raw
article reproduction, resale, paid use, trading, or signed Risk Gate delivery.

For NRCan only, a headline without a mineral keyword may lead to a bounded
original-page check. The original page must pass the existing path, headline,
calendar and publication-date checks. Topic recovery inspects paragraphs inside
the original news-release container, excluding navigation, related links and
footer. Only a finite topic survives; raw body text is discarded. Date-only
releases retain day precision and the conservative next-day release bound.

Production completion requires authenticated live acceptance plus nonzero
qualified Macro and Critical Minerals counts. Partner client acknowledgement is
separate from Geomacro endpoint acceptance and must not be inferred.

---

# One hourly source ingest → three domain Intelligence cards → Predge evaluation feed

## Actual topology (no duplicate ingest, no new D1/B2 storage)

* At 07 past each UTC hour, existing `Website Derived News Continuity`
  reads official original release indexes for Geopolitics, Macro/FX and Critical
  Minerals. At 37 past, `Auto Ingest News` invokes the same D1 recovery
  path ONLY if the primary publisher has missed its 70m readback target.
* Valid source-native original timestamps and a 15-minute public embargo
  (longer conservative embargo for day-only releases) are enforced before
  inserting already-Geomacro-authored derived JSON into the existing
  `website_derived_intelligence` Cloudflare D1 table. Stable opaque IDs
  dedupe retries; maximum 600 records and 72h first-seen/original-date TTL.
* `https://geomacro.live/intelligence` reads the same 72h D1 journal
  and may additionally render live on-demand official-source observations,
  which are NOT automatically part of the retained/partner feed.
* `GET https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/derived-structural-72h`
  is the direct Worker structured JSON output from EXACTLY the persisted
  eligible journal records; no Lovable publication required. Optional
  `?domain=geopolitics`, `?domain=macro`, or `?domain=rare_earth`.
  All returned `items[].id` correspond to those underlying website D1 rows.
* `GET https://geomacro.live/api/v1/intelligence/query?view=structural-72h`
  is the existing website-side equivalent after Lovable publish; the
  direct Worker endpoint is the production-independent fallback.

## Predge 90-day free research pilot

Predge can poll the **same direct Worker GET** every 15–30 minutes and
deduplicate `items` by `id`. Retrieve the whole 72h rolling window; DO NOT
advance solely by original_published_at, because day-only releases may become
eligible long after their originating publication day. `counts` and
`availability_by_category` always include all 3 domains, even if one has 0.
200 with `items:[]` means no qualifying publications observed, not outage;
503 means readback unavailable. Honor 15min + day-only embargo and timestamp
precision; no derived item asserts independent event corroboration or score.

**Rights and pilot gate**: The feed contains source-neutral first-party
Geomacro-authored observations only; original article bytes, titles, URLs and
hidden-attribution records are excluded. Every record has
`commercial_derived_rights_verified:false`, `payable:false` and
`signed_product_verified:false`; feed has
`partner_resale_or_commercial_redistribution_authorized:false`. It can be
evaluated in a private research pilot; a separate genuine pilot agreement
and source-specific rights/partner redistribution review are required BEFORE
Predge uses these as a customer-facing commercially redistributable product.
Do not issue API keys, claim signatures, send real payment or waive publisher
licensing solely because this public research endpoint is accessible.

No new payment, Supabase, B2 network operations, raw source redistribution,
third-party attribution suppression, fake events or additional cron jobs.

Worker deployment must independently pass `verify-shared-derived-news-live.mjs`: parity of all retained journal IDs, category, publication time and derived explanations with structured records. This does not prove commercial redistribution rights.\n
## Candidate-admission tier for 90-day free Predge pilot

Every **valid dated first-party original-source** input admitted by the
existing licensed/approved feed readers is projected even when no topic
keyword matches. Those rows use `official_feed_candidate_unscored` in the
existing 72h Cloudflare D1 journal and
`DATED_OFFICIAL_FEED_CANDIDATE_UNCLASSIFIED` in the exact same website/Predge
structured JSON response. The separate fields
`topical_match_verified:false`, `qualifying_topic_release_verified:false`
and `further_validation_required:true` protect against inventing a
geopolitical, macro or minerals event from an unrelated original publication.

Dated, topic-matched genuine releases remain unchanged. Off-domain links,
unverified originating publication dates, deduplicated repeats, hidden
mandatory attribution, the 15-minute (or conservative day-only) embargo,
72-hour retention and 600-row bound remain enforced. The existing private
GRI and commercial signed-data gates do not accept the candidate-only status.

The public pilot research endpoint charges 0 USDC, bounded to at most 600
retained D1 records per response. The 90-day evaluation is a proposed pilot
term and **not** a private metered quota or enforceable SLA in this public
endpoint. Do not describe this as actual commercial redistribution permission.

## Authenticated 90-day Predge research route — single grant, not per-item approvals

`GET /v1/partner/predge/derived-structural-72h` on the SAME Cloudflare D1
control-plane Worker accepts only a **dedicated** 64-hex Bearer derived in
the protected deploy from the existing root production secret using
HMAC-SHA256 namespace `geomacro-predge-72h-research-only-v1` (not the
admin-token namespace). Token never appears in URLs or GitHub artifacts;
no CORS and no-store private cache response. Authentication cannot grant
original publisher rights, paid eligibility, GRO authenticity or Risk Gate
execution. The endpoint reuses all public-eligible IDs and metadata 1:1
without extra items or manual item allowlist, while honoring the existing
15m/day embargo, withheld mandatory credits, 72h retention and original
source time. The URL is a **research pilot** only and has an upper-bound
pilot time window.


## Production 90-day research-GET protection (no extra storage)

The private Bearer route consumes the existing atomic Cloudflare D1
`central_security_budget` on every authenticated and syntactically valid
GET, with a hard **500 requests per UTC day** across the one purpose-scoped
partner grant (100/day is the recommended operating target). It returns HTTP
429 and `Retry-After` on exhaustion, HTTP 503 if the atomic quota service
is unavailable and 401 for invalid Bearer credentials. No extra cron,
new database table, B2 operation, Supabase or real-money settlement is needed.
Only a hash-derived client bucket reaches D1. The private route still returns
exactly the same 72-hour source-neutral items as the free website research
projection, excluding upstream items requiring attribution. This is **not**
a guarantee of 24/7 provider availability or commercial redistribution rights.
