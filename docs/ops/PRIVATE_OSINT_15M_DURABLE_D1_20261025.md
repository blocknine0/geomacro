# Private 15-minute OSINT: durable D1 research receipts

25 October 2026. Only three categories: geopolitics, macro/FX, critical
minerals (internal key `rare_earth`). Canonical 195 ISO3 country routes.
Source list is the existing registered original/official inventory. Routing
does NOT imply a verified publisher in every country.

## Implemented operation
`Private Global OSINT 15-Minute Discovery` runs GitHub Actions on a
best-effort five-minute schedule and immediately after a successful trusted
D1 control-plane deployment. All selected registered source endpoint URLs
are checked on each tick; 5-minute polling does not guarantee a request
starts or completes within five minutes.

The collector creates sanitized *provisional factual tag records* from
publisher-native RSS/Atom dates or supported official first-party GOV.UK
JSON native dates. Unclear/unsupported clocks are rejected. It hashes
source/item identity and never sends titles, article bodies, original URLs,
Telegram posts, source usernames or model prompts to D1.

New endpoint `/v1/internal/private-osint-15m` is **never** a public route.
It requires a distinct HMAC domain-separated token issued from the
existing protected ledger-root derivation. The admin token is not accepted
by this route, and this limited token cannot call existing admin, partner,
paid or public writer routes. No new paid provider, Supabase, B2 request,
standalone computer, public feed or third-party collection permission.

Protected D1 migration `0028_private_osint_15m_durable.sql` stores:
- 25-hour provisional factual JSON, ISO3, category, native feed clock,
  immutable D1-server `first_seen_at` and mutable `last_seen_at`;
- previous 24-hour bounded per-source/category transport checks, using
  opaque hashes, no registered source URLs;
- rolling max 4,000 items, with capacity exclusions exposed in the
  authenticated receipt.

Every protected PUT is a single D1 transaction with per-item exact JSON
readback, first-seen timestamp verification and machine-readable receipt.
A final separate authorized GET tests the private reader. The encrypted
HTTPS request secret remains in production GitHub secrets only. No
full/replay publisher feeds or source data artifacts are uploaded to GitHub.

## What constitutes verification
- Source-native feed publication timestamp observed: *provisional*.
- Durable authenticated D1 insert and exact readback: *verified only for
  persistence/identity/clock retention*.
- Publication-to-FIRST D1 insert within 15 minutes: measured and reported
  per observed native feed time, not an inferred scheduler guarantee.
- Independent original ARTICLE page/body native clock, same-event
  corroboration, content rights, scoring, human review and signed GRO:
  **NOT VERIFIED by this lane**. These need their separately governed
  publisher evidence/readback authority before being marked so.

GDELT global 15-minute index remains private discovery hints, never
treated as first-party source publication. No blanket Telegram scraping.

## Operational release gate
1. Run exact offline tests of the new D1 producer and endpoint, security
   negative tests and existing three-category discovery contracts.
2. Merge only green product/security CI; confirm `Deploy D1 Control Plane`
   migrates 0028 and deploys code with its protected secrets. A deployment
   may be blocked by the existing independent Predge token-rotation gate:
   don't weaken it to force OSINT activation.
3. Confirm `Private Global OSINT 15-Minute Discovery` has
   `private_osint_d1_persisted:true` and
   `d1_write_exact_readback_verified:true` from a real production scan.
   A successful `verify` job only proves unit contracts.
4. Report real count `native_feed_to_first_durable_write_within_15m`
   alongside late/excluded counts and total source states. No fresh news in
   a publisher or an unavailable source is not a clock success.
5. Source page-verified 15m global breaking news can be called ready only
   with real independently checked original article publication/retrieval
   clocks and 195x3 cell evidence. This source-discovery lane does not
   fabricate these outcomes. Owner's existing paid/signed products and
   Predge 72-hour partner contracts are unmodified.
