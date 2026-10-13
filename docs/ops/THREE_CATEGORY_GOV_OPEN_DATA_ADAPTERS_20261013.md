# Three category API — government open-data adapters (October 13, 2026)

Adds **a second, typed data modality** to each existing API, without
changing the old GET view=latest first-party original-release reader,
scoring, x402 signing or the canonical payment-protected POST.

| Existing category endpoint | New read-only modality |
| --- | --- |
| /api/v1/intelligence/geopolitics?view=open-data | USGS earthquake occurrence (M4.5+ band) + CISA KEV catalog inclusion |
| /api/v1/intelligence/macro-fx?view=open-data | US Treasury interest-rate reference month + World Bank WDI annual GDP period |
| /api/v1/intelligence/critical-minerals?view=open-data | USAspending contract award search, qualified by literal mineral terms in award description and original obligation date |

Every upstream is a pinned HTTPS host and path, no user-provided URL,
no redirect, 5–6s timeout, bounded JSON and 2-minute in-process cache.
USAspending's **upstream read-only POST search** has nothing to do with
Geomacro payment; no account or payment signature is sent.

## Semantics and legal boundaries

**Event occurrence** is not a publisher release; **catalog added day**
is not exploit date; **monthly/annual data period** is not a current
market tick; **contract obligation day** is not publication or mineral
production. No raw record IDs, source URLs, headlines, supplier names,
indicator numeric values or upstream descriptions are delivered.

Signals have class official_open_data_unscored, null scores,
false independent corroboration/signing/payment fields, and are NOT
commercially chargeable or proof of signed Risk Indices. World Bank
WDI carries the explicit 'World Bank (CC BY 4.0)' reuse credit.
Any future paid product must separately satisfy exact dataset reuse
rights/attribution, causal risk analysis, signed GRO, and x402 binding.

The user's full source-family inventory remains in
scripts/lib/operator-commercial-free-source-lineup.mjs. **This PR
activates five specific APIs, not all listed provider families.**
Other sources have API key, registration, legal licensing, semantic
mapping, data cadence and safe quota questions to resolve individually.
A healthy provider transport does not imply a new qualifying news event.

The no-funds real-network canary is:
bun scripts/ops/probe-three-category-open-data.ts. It logs aggregate
counts only, never raw payloads or any database writes. Missing data,
denials and rate limits stay unavailable rather than synthetic success.

## Deployment

GitHub main and the linked Lovable repository must sync. The website
must publish the matching main SHA before these GETs are truly live.
CI green or GitHub mirror sync is not proof of public deployment.
