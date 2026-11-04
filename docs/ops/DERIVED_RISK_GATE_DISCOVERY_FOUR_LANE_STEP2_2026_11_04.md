# GeoMacro commercial Risk Gate, input Step 2 — four existing news-ingestion lanes

Date: 2026-11-04. **This step wires discovery and holds ALL input as unverified**; it does not issue a commercial entitlement or imply source legal immunity.

## Canonical four input lanes
1. \`phase2h_private_raw_news\`: Geopolitics, Macro/FX and Critical Minerals admitted original-source observations (existing 72h private D1 archive path, with independent B2 archival unchanged).
2. \`private_osint_news_25h\`: worldwide private OSINT RSS/Atom research observations; first feed-native timestamp and country candidate are research metadata, NOT proven facts, licence or a right to reuse the publisher text.
3. \`reusable_news_items\`: the already ingested three-category sanctioned/minimized factual-JSON source layer; no original URL or publisher article text exists in this lane.
4. \`risk_gate_gdelt_event_index\`: the existing D1 **hot** GDELT CAMEO event-reference index. GDELT's DATEADDED/index time is **not** the event or original publication time; CAMEO class is not an independently verified occurrence. The separate full B2 GDELT archive is **not** automatically enumerated by this D1 hot-index bridge.

These are existing D1 records, not promises that all publishers successfully returned new items. Other independently stored B2-only archives and any D1 source lanes outside the four named tables are not automatically covered by this first integration.

## End-to-end ingress flow (after merge/deployment)

\`existing 15m/20m source collection → existing D1 write/readback → protected Worker GET keyset page (<=100) → signed-in GitHub main-only 20m consumer → resolveDerivedCommercialEligibility/reviewDerivedRiskGateBatch → protected D1 POST re-verifies exact page fingerprint → atomic insert of no-prose discovery rows + cursor advance → independent D1 exact readback → protected pending queue for next corroboration stage\`.

- Every stored signal contains only \`signal_id,lane,original_ref,category,country_iso3,source_clock_at,first_seen_at,source_sha256,rights_state,review_status\` and creation time. \`source_clock_at\` is a **source/index timestamp**, not asserted event occurrence. Country may be null or tentative.
- No article title, body, paragraph, private feed URL, or original article is returned by this protected endpoint or inserted into this new table. SQL SELECT never projects \`raw_json\` or \`projection_json\`.
- Newly ingested items are held as \`HOLD_SOURCE_ACCESS_OR_EXPRESSION\` and \`UNVERIFIED_SOURCE_RIGHTS\`, never \`commercialEligible:true\`. The Step-1 independently sourced signed-scoring path remains authoritative for later promotion. A source item that is already recorded by D1 does not prove authorization to run additional fetches.
- No source acquisition, new news subscription, paid provider, partner/PREDGE write, customer API, GRO signing or PayPal/USDC operation is added.
- Duplicate \`(lane,original_ref)\` is ignored, immutable first-seen ordering and atomic cursor acknowledgment prevent dropped pages on retried/failed consumers. Identical events across different sources are retained as distinct observations until properly corroborated; cross-source headline dedupe is NOT a verification shortcut.
- Exactly one GitHub Actions consumer is serialized by concurrency, runs every 20 minutes on best-effort GitHub schedule, uses existing root-admin token, and prints only aggregate category counts. The route is owner-admin only, *not* public, not partner and not customer-facing.
- Window: 72h canonical/GDELT, 25h Private OSINT/reusable. If a job is delayed beyond source retention, page response reports \`coverage_gap_detected\` instead of manufacturing full historical coverage.

## Deployment and verification
- Migration \`0117_derived_risk_gate_discovery_bridge.sql\` is additive; existing source tables are untouched.
- Worker route: \`/v1/internal/risk-gate/derived-discovery\`, under the existing \`authorized(request,env)\` root credential check.
- Main-only workflow: \`.github/workflows/derived-risk-gate-discovery-20m.yml\` begins scheduling only once merged into \`main\` and once the protected D1 Worker and migration have actually deployed.
- Offline test: \`node --test scripts/lib/derived-risk-gate-review-loop.test.mjs scripts/lib/facts-only-gri-v12-dual-attestation.test.mjs scripts/tests/derived-risk-gate-discovery-bridge.test.mjs\`.
- Live acceptance REQUIRES real D1 remote migration readback, protected Worker GET and POST nonzero real rows, exact D1 pending queue readback, all four lane cursors verified, source counts by three categories, and a successful **scheduled** workflow run. CI-green or a configured source registry alone is not proof of continuous live ingestion.

Do not mark this Step 2 production-complete unless the checks above are observed. The full B2-only GDELT archive and any other source stores require separate inventory/adapters before claiming literally 100% ingestion coverage.
