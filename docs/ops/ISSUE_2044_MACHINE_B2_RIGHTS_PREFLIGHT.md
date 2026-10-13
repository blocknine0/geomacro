# Issue #2044: B2 source registry rights preflight after actual first-party reread

Private server-only entry point:
`src/lib/geomacro-machine-source-rights.server.ts`

The chain now runs in order: registered source identity -> machine same-event
candidate -> distinct first-party publisher actual HTML SHA-256 and
publisher-native first-publication clock -> ONE existing quota-reserved B2
commercial source rights registry readback (when a real pair passes).

Each claimed publisher ID is bound to the EXISTING source-id allowlist from
the strict reviewer-signed qualifier, not an arbitrary user-supplied license.
Each required B2 source record must be unique, category-exact, CERTIFIED,
ingestion enabled, commercial derived-signals enabled, compatible with
DERIVED_ONLY or COMMERCIAL_OK, nonempty licence metadata and no unmet
upstream attribution requirement in the source-private output contract.

A page-hash mismatch, wrong issuer, syndication or material dispute never
spends even the B2 rights read. Unavailable/stale/null B2 records, missing
source, duplicate source rows or denied rights fail closed. This preflight
does not consult Supabase.

**Crucial:** A B2 registry row is *not* definitive article-level permission.
The success status is
`B2_REGISTRY_COMPATIBLE_ARTICLE_PERMISSION_PENDING` and the result always
contains `actual_article_commercial_permission_verified:false`,
`semantic_same_event_claim_verified:false`,
`signed_commercial_gro:false` and `payment_authorized:false`.
Real independently checked original article copyright/usage terms, exact
semantic event claim verification, source-specific lawful attribution
compatibility, canonical Geomacro machine GRO signing and true production
no-funds acceptance are required before paid x402 delivery.

No third-party independent reviewer is needed for internal Geomacro
candidate verification; FEDERICO_STRICT remains unchanged for partner
requests requiring external review. This code does not auto-issue a GRO,
publish a D1 hot row, B2 PUT, charge funds or expose upstream source bytes.
