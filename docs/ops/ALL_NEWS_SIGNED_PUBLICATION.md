# Per-news signed publication and complete readback

`GET /v1/public/intelligence-publications?offset=0` joins every unique
retained Intelligence newsroom item to its existing issuer-signed envelope
and the separately signed private original-page review. Pages contain 40
items; follow `next_offset`. The endpoint reads the same D1 journal, creates
no new table, and does not fetch or expose original articles, references,
HTML hashes, reviewer private keys or raw news.

A signature is verified against the deployed approved issuer registry, not
a self-supplied public key. The returned envelope signs the exact derived
content and original publication date. Missing, corrupt, revoked or swapped
signatures remain explicitly pending. Alternate journal IDs for identical
content are deduplicated by the existing canonical input hash. Revisions
require different signed content; neither signing time nor readback time
replaces the original publication time.

`current_source_verified_signed` requires a valid issuer signature, a
separate valid LOW source-review signature bound to the same input/category/
original time, exact source time between 15 and 60 minutes old, and a
classified official release rather than an unclassified candidate. All
other retained items are still returned with their precise pending or dated
state. LOW review proves original-page bytes and native publication time;
it does not assert semantic corroboration, commercial rights or scores.

This is `GEOMACRO_AUTOMATED_DERIVED_INPUT_V1`, not the legacy external-reviewed
or dual Facts/Rights commercial Intelligence/GRO/GRI profile. Fields keep
that distinction machine-readable. Existing signed hot-product health,
source rights, scoring, billing and payment gates are unchanged. This new
feed cannot by itself make the legacy 0/3 or deep-health 503 green.

Both existing ingestion lanes and the D1 deployment now run
`scripts/ops/verify-all-news-signed-publications.mjs`. This reads the journal
independently, follows every proof page, verifies every envelope against
operator-configured public key pins, and requires exact full-set coverage.
It rejects truncated pages, unsigned items and changed content; an ID-only
inventory is insufficient. The safe receipt separately counts valid issuer
signatures and server-verified source reviews, and never calls either
commercial certification or independently verified source review evidence.
Existing producer signing repairs absent signed inputs on its next authorized
run. Source-review failures remain visible and cannot be repaired by an
issuer signature alone. No new cron, paid provider, B2 request or Supabase
operation is introduced by this readback.
