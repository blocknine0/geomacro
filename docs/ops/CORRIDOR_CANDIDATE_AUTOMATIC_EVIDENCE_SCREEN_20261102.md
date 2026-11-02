# Corridor candidate automated original-evidence screening

## Scope / data lineage

- Canonical main's `Direct Global Corridor Intake (Isolated)` discovers native RSS candidate metadata with original publication clocks.
- Main's authenticated private D1 writer already persists candidates to `corridor_native_news_candidates` and independently reads them back.
- This feature hooks into that **same** scheduled `source-intake` job, immediately **after** the D1 write/readback succeeds, and inspects exactly its already-acknowledged candidate cohort. It does **not** issue any additional D1 query, re-fetch RSS, produce duplicate website news, or require a new Supabase/B2 credential. The independent route screen is **distinct** from signed GRO reader being built in `labs/risk-corridor-7d/`.
- Sanitized proof goes into `artifacts/direct-corridor-intake/article-evidence-screen.json`, attached with the existing 3-day workflow artifact. **This version does not create a D1 record of the screen results**; D1 only contains the original candidates. No new client route or publish method.
- The scheduled cron remains `6,21,36,51 * * * *` (15-minute intended cadence; GitHub scheduling best-effort). The actual main deploy of this change requires independent review/approval.

## Conservative verification stages

1. **D1 acknowledgment gate.** Proceed only if the existing protected PUT and independent GET both passed and the D1 receipt's item counts match the current cohort. On failure: abort without fetching.
2. **Bounded publisher-native article fetch.** Only six pinned source issuers; candidate SHA-256 recomputed from source ID, permalink, original RSS clock. HTTPS, same-host, no redirects, no URL queries or hashes, no credentialed URLs. GET one article body at most 160 KiB, 7-second timeout, maximum **24 candidate pages/run**, 3 concurrent, round-robin selection for omitted candidates. Denials, failed network, oversized/non-HTML responses become explicit failure states; never bypass limits.
3. **Original article content checks.** Analyze ONLY `<article>` or `<main>` content; exclude page navigation/header/footer/sidebars. Require an explicit named corridor, disruption action and **seven-digit IMO vessel identifier** close to each other. Bare corridor mentions produce only `ARTICLE_ROUTE_CONTEXT_ONLY` and cannot become incidents; non-corridor macro headlines are not positive signals.
4. **Independent publisher match.** Same corridor + action + vessel IMO in article bodies from **different source IDs**, with their source-native **publication clocks** no more than 36 hours apart: `INDEPENDENT_VESSEL_ROUTE_REPORT_MATCH`. This is strong *report context*, not proof of incident date, magnitude, location or shipping disruption. If no such match, keep `SINGLE_SOURCE_ROUTE_CLAUSE_OBSERVED` or a non-confirming status.
5. **Fail-closed risk gate.** Always `event_verified:false`, `corridor_impact_verified:false`, `verified_corridor_events:0`, `signed_gro_generated:false`, `commercial_rights_verified:false`, `chargeable:false`. No risk score, execution authorization, news resale, PREDGE, paid API or customer delivery change. Genuine event verification requires a separately approved event-specific official source adapter and independent event-clock evidence.

**Important limitation:** the current published 30 records had zero corridor-specific candidates. This verification system can truthfully return zero qualified corridors when articles provide no specific route evidence. It cannot make all general macro or crypto articles into corridor incidents.

## Operations and proof

- Every post-merge production `source-intake` run must execute the screen after the D1 publisher and upload its result; zero selected candidates is a valid informational result, **not** a verified news event.
- Required counts: `candidate_count`, `inspected_count`, `deferred_count`, `article_body_reads`, `body_route_mentions`, `route_clause_observed`, `independent_vessel_route_matches`, `verified_corridor_events:0`. The inspected+deferred equality must hold. Corroboration still has zero paid rights.
- No original article text, original titles, URLs, IMO number or source bodies in the receipt/log. Only fixed source IDs, candidate SHA, article body SHA and allowed route labels. No sensitive D1 query or secret.
- On provider 403/429: refuse bypass/retry in same run. Missing/expired, off-site redirects, invalid clocks, malformed HTML and ambiguous cases stay unverified.
- Initial rollout acceptance requires PR tests + a **post-merge actual scheduled main receipt** showing the workflow step and artifact. Passing unit tests or seeing the 30 D1 rows alone is insufficient.
- D1 read quota: exactly zero new D1 operations in verification stage; per-run external article GET max 24. No B2 reads/writes. Separate Supabase Free 7d buffer integration intentionally out of scope here; do not silently share main root tokens.

Master staging issue: https://github.com/blocknine0/geomacro/issues/3339
