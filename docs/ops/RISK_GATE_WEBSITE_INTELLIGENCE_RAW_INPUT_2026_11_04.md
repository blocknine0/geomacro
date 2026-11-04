# GeoMacro Risk Gate: existing Website Intelligence as a raw input

## Scope / meaning of raw
The existing canonical Website Intelligence journal is
\`website_derived_intelligence\` (Cloudflare D1): up to 600 GeoMacro-authored,
three-category derived story JSON records, each with immutable native
publication time, D1 first-seen time, and exact/day precision.

This integration accepts that existing D1 story JSON as **raw research input
for the next Risk Gate extraction/verification stages**. It is NOT an upstream
publisher article or original paid news text. There is no new crawler, B2
archive copy, source feed, web/customer response, database rewrite, or
commercial rights promotion.

## Five lanes
1. \`canonical\` — private D1 original observations.
2. \`private_osint\` — private 25h research ring.
3. \`reusable_news\` — minimized three-category observations.
4. \`gdelt_cameo\` — hot D1 CAMEO index sample.
5. \`website_intelligence\` — all valid retained Website Intelligence
   \`story_json\` references, including verified-looking official releases,
   feed candidates, and unverified OSINT-derived website cards. Website
   status is **not** independent truth or commercial rights proof.

## Implementation and end-to-end lifecycle
- Additive migration \`0119_derived_risk_gate_website_raw.sql\` adds
  \`derived_risk_gate_website_raw_signals\`, a dedicated keyset cursor,
  \`idx_website_risk_raw_source_scan\`, and a five-lane unified private
  pending-view. The old four-lane CHECK constraints remain untouched.
- The 20-minute protected-main discovery workflow uses the same authenticated
  \`/v1/internal/risk-gate/derived-discovery?lane=website_intelligence\` path.
- The Worker reads only the EXISTING 72h D1 journal, verifies the same
  \`verifyDerivedStory\` contract as the public website, canonical original
  date/precision, D1 first-seen timestamp and entire GeoMacro story content
  hash. No original publisher article or source-specific URL is fetched.
- Up to 100 item keyset pages are reported as a bounded, rights-unverified
  discovery packet. The protected runner applies the existing Step 1
  \`reviewDerivedRiskGateBatch\` rights HOLD rule.
- The Worker checks the entire page hash and raw story ID/content via indexed
  exact-ID readback. One atomic D1 batch writes only a SHA256 fingerprint,
  stable original Website Intelligence row ID, category, original time, first
  seen and rights status; it also advances the durable cursor. Another exact
  D1 readback validates both content hashes and cursor.
- After a complete website pass, the cursor resets for the next scheduled
  poll. This catches changed GeoMacro-authored \`story_json\` with the same
  original ID, but does NOT rewrite the source publication clock. Identical
  records remain one signal per original ID. A revised content hash stays
  \`UNVERIFIED_SOURCE_RIGHTS\` and \`HOLD_SOURCE_ACCESS_OR_EXPRESSION\`.
- The existing protected \`?view=pending\` now includes this fifth lane
  through a D1 UNION ALL view. \`?view=website_raw&signal_id=<sha256>\`
  resolves an already indexed signal to the latest exact, SHA-matched
  GeoMacro-authored story JSON in the original D1 journal for internal
  verification only. It never makes this payload a paid product.
- Existing 72h cleanup also removes expired Website raw references, while
  leaving the canonical website journal untouched.

## Boundaries and truthful acceptance
- The public/static Website archive, historical B2-only copies and items
  evicted from the canonical 600-entry journal are NOT silently reconstituted.
  The protected raw accessor returns 410 for evicted rows or 409 for a
  revision that has not yet completed the discovery recheck.
- Category is preserved exactly. A website geography free-text field is NOT
  silently converted into an ISO3 code; country is null until separately
  verified. OSINT website cards remain unverified discovery leads.
- No new source license, GDELT event truth, paid Risk Gate authorization,
  GRO score signing, PREDGE mutation, or payment is introduced.
- Production complete requires actual merged main SHA, D1 migration/Worker
  deployment, nonzero current journal readback across observed categories,
  a successful protected main-only discovery run, verified pending queue, and
  a round-trip raw lookup. A passing CI run alone is not sufficient.
