# Sanctions first-party source continuity — OFAC and UNSC (29 October 2026)

## Why this is needed
OFAC explicitly retired its RSS service on 6 February 2025. A 2026 live sanctions monitor must **not** rely on that retired endpoint or reinterpret email signup as a free machine API. The official current Sanctions List Updates listing is `https://ofac.treasury.gov/recent-actions/sanctions-list-updates`. UN Security Council maintains a first-party list of amendments `https://main.un.org/securitycouncil/en/content/list-updates-unsc-consolidated-list`, but the separately documented RSS endpoint did not provide a confirmed working anonymous GET; a 403 cannot be bypassed by changing proxy, network or authorization.

External source checks:
- https://ofac.treasury.gov/recent-actions/20250206 — official RSS retirement announcement
- https://ofac.treasury.gov/recent-actions/sanctions-list-updates — current official list
- https://main.un.org/securitycouncil/en/content/list-updates-unsc-consolidated-list — original UNSC table
- https://main.un.org/securitycouncil/sites/default/files/unsc-rss_instructions.pdf — documented RSS guide (actual accessibility not assumed)

## Implemented as part of existing 195×3 daily no-funds audit
The bounded observer `scripts/lib/official-sanctions-listings-observer.mjs` checks exactly two pinned first-party HTTPS HTML URLs. It refuses redirects, improper MIME, oversized bodies, transport denials, and quota 429; it makes **no retry and no 403 bypass**. Every HTTP status becomes a source-level receipt; a failing publisher does not erase a healthy independent source. No raw article, page text, HTML, URL supplied by a customer, provider credential or payment ever enters its JSON receipt.

The OFAC parser only counts a first-party `/recent-actions/YYYYMMDD` notice if it ALSO has one unambiguous visible month/day/year date nearby. It does not derive original release time from the URL. The UNSC parser only counts exact first-party table rows containing the native `DD/MM/YYYY` date. A generic page `Updated date` is rejected.

**These rows are listing discovery candidates only**, not original-article readback, independent confirmation, country-specific impact, licence, reviewer signature, new signed GRO, or payable response. The categorical query test may use the source-gap status to route additional research; it must never promote an item to customer output from this observation alone.

The scheduled original-news ingestion and PREDGE flows are unchanged. No new cron, D1/B2 writes, paid feeds or cloud plan required.

## Production acceptance sequence
1. On PR run `node --test scripts/tests/official-sanctions-listings-observer.test.mjs` and the real `--live` two-source read-only probe. Inspect source-specific HTTP/dated listing outcomes; if a provider is blocked, record that fact.
2. After verified main merge, the existing daily `Global 195x3 human machine source-gap regression` performs exactly two more external GET requests alongside its existing no-funds test. Inspect the sanitized source receipt in the Action artifact. This proves the candidate monitor ran, not uninterrupted 24/7 event supply.
3. For qualifying publication downstream, develop separately reviewed original sanction-notice page parser, country/target mapping, original native clock, rights determination, and at least one independent same-event corroboration. Confirm D1 original and B2 receipt under existing provider quota admission, then allow the existing canonical commercial gates to decide deliverability.
4. Do not price, sign, activate checkout, auto-merge bad provenance or alter PREDGE. A healthy source monitoring day with zero new sanctions is legitimate.

## Operational limit
The daily source probe is useful as an inexpensive reachability alarm. Continuous near-real-time sanctions tracking requires an admitted frequent publisher poll with a durable scheduler/queue, actual source health/circuit state, independent D1/B2 readback and measured 72-hour runtime evidence. This change DOES NOT establish that SLA or all 585 country-category cells.
