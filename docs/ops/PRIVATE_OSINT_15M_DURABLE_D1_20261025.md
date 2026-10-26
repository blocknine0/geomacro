# Private 15-minute OSINT: durable D1 research receipts

25 October 2026. Only three categories: geopolitics, macro/FX, critical
minerals (internal key `rare_earth`). Canonical 195 ISO3 country routes.
Source list is the existing registered original/official inventory. Routing
does NOT imply a verified publisher in every country.

## Implemented operation
`Private Global OSINT 15-Minute Discovery` runs GitHub Actions on a
best-effort 15-minute collection schedule and immediately after a successful trusted
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

## What counts for the 15-minute ingestion objective
- Scope is **private source-native breaking-news discovery and D1 ingestion**;
  independent event verification in that 15-minute window is **not required**.
- A source-native feed publication timestamp is a *provisional claim*, not
  verification of an original article or the event.
- Authenticated D1 insertion and exact readback prove only private
  persistence, identity and immutable first-seen time.
- The native feed publication timestamp to FIRST D1 insert <=15 minutes
  is a measured on-time ingestion; later records count as late.
- Independent corroboration, original-page audit, rights review and
  signed/paid products are separate downstream work and are not
  a blocker for internal OSINT research ingestion.

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
5. Judge this private OSINT lane only by actual source checks, native
   timestamps, D1 first-seen receipts and the within/over-15-minute
   counts. The independent verification SLA is omitted; full 195-country
   discovery coverage is still not claimed from routing alone. Owner's
   existing paid/signed products and Predge 72-hour partner contracts
   are unmodified.
