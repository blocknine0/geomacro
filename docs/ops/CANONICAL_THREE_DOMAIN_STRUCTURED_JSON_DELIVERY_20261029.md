# GeoMacro three-category canonical source → structured JSON → HTTP delivery

**Contract**: `geomacro.three-domain-structured-delivery.v1`
**Endpoint**: `GET https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/three-domain-structured-output`
**Authorization**: none, free observational only. The paid API remains `POST /api/v1/intelligence/query` behind existing x402 and original country/rights/readback qualification.

## What is implemented

The direct Cloudflare Worker serves a machine-friendly JSON document containing **three explicit category keys on every successful read**, even when a particular category has no real observation:
- `geopolitics`: genuine native-time observed geopolitical issuer-derived news plus any official reference baseline.
- `macro`: Macro/FX native issuer news versus separately dated annual/monthly monetary and statistical reference.
- `rare_earth`: Critical Minerals native original news versus separately dated source/commodity baseline.

Each category has **independent** `native_release_records` and `official_reference_records` arrays, plus `source_check_current`, `last_source_check_at`, counts, `delivery_state`, and required attribution. Every news record carries the preexisting issuer-native exact or day-only publication date, topic, development type, `what_changed`, `why_it_matters`, and explicit `corroboration_status=NOT_INDEPENDENTLY_VERIFIED`. Every official reference row carries `observation_period`, `clock_semantics`, a contextual finding and implication; it explicitly has **no publication-event timestamp**. A 2025 annual reference can never be sold as a 2026 current event.

The projector takes **only** the existing `threeDomainEvidenceContinuity` canonical D1 results. It does not poll new upstream feeds, scrape URLs, fetch payment rail metadata, authorize x402, write D1, call B2, or touch Supabase. The Worker constructs the *same* anonymous per-POP cache key as the existing `/v1/public/three-domain-continuity`, preserving original `Cache-Control: no-cache`, Cookie and Authorization exclusion. This prevents a second machine view from independently scanning D1 on normal public cache hits; origin reads can occur on cache miss and must still meet provider quota. It is not a free global storage SLA.

### Example of machine contract (illustrative shape only)
```json
{
  "ok": true,
  "schema": "geomacro.three-domain-structured-delivery.v1",
  "delivery_channel": "PUBLIC_READ_ONLY_STRUCTURED_JSON",
  "categories": {
    "geopolitics": {"delivery_state": "NO_OBSERVATION_AVAILABLE", "native_release_records": [], "official_reference_records": []},
    "macro": {"delivery_state": "NO_OBSERVATION_AVAILABLE", "native_release_records": [], "official_reference_records": []},
    "rare_earth": {"delivery_state": "NO_OBSERVATION_AVAILABLE", "native_release_records": [], "official_reference_records": []}
  },
  "commercial": {
    "chargeable": false,
    "payment_required": false,
    "payment_authorized": false,
    "commercially_qualified": false,
    "paid_evidence_must_be_separately_verified": true
  }
}
```
The example is **not** a real current-news receipt. Actual HTTP responses include the full per-category contract and clocks. No fabricated event is returned when a publisher is quiet; one category may be present even when another is unavailable. The endpoint returns **503, not a fake successful zero-record result**, if all canonical D1 sources/readbacks are unavailable or the source schema is malformed.

### Real evidence vs paid product boundary

The original Ukraine presidency RSS and Brazil BCB SGS-433 IPCA were independently read and added to protected source monitoring by merged #3129, #3131 and #3128. **Those private observation receipts are not silently promoted into canonical public journal D1, nor paid Store evidence.** Only separately admitted original, source-validated D1 news and valid official context already present at read time can appear in the public JSON. Existing same-event, country-specific origin, publisher reuse rights, source catalogue/provenance, canonical D1/B2 hash readback, signed risk where required, prepared frozen bytes, real buyer-approved USDC mainnet x402 settlement, and external buyer acknowledgment remain independent preconditions for a paid offer.

### Deployment/acceptance

The protected-main `Deploy D1 Control Plane` workflow deploys the Worker whenever eligible source changes land on `main`, subject to existing owner credentials and provider quota. A new post-deploy no-funds real Worker `curl` + `jq` acceptance confirms schema, all three category keys, typed arrays, no-charge guarantees and per-category counts. This does **not** assert a nonempty three-domain dataset. The Product CI suite tests positive, negative, stale, malformed, issuer-clock forged, source-smuggling and 503 cases.

No PREDGE code, workflow, credentials, delivery or quota is changed.
