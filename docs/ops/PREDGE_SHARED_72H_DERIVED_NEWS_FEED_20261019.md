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