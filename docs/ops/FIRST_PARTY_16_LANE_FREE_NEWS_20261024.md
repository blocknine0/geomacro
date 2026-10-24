# First-party current-news fastlane: free-only 16 lanes (24 Oct 2026)

## Purpose and limits

Expand Geomacro's **existing** authenticated Cloudflare D1 72-hour website-derived
news producer, not a new copy of WorldMonitor, Pharos, market-news aggregators,
GDELT discovery, or historic data. The same GitHub workflow, original-page
timestamp validation, 72h dedupe, 20-minute observational audit, and private
low-authority review continuation remain in place.

There are 16 configured primary **feed lanes**, not 16 independently confirming
organizations and not 16 successful live probes. One publisher may appear in
multiple categories, so count unique issuer families separately. A feed can
be healthy with zero fresh relevant releases, or fail without proving a
country has no news.

### Free new primary lanes (existing vetted first-party adapters)

| Domain | Added lane | Official issuer | Original vs syndicated | Reuse policy |
| --- | --- | --- | --- | --- |
| Geopolitics | `eu_council_press_original` | Council of the European Union | Council's own press releases | https://www.consilium.europa.eu/en/about-site/copyright/ |
| Geopolitics | `nz_beehive_geopolitics` | NZ Government Ministers | Official ministerial release feed | https://www.beehive.govt.nz/copyright |
| Macro/FX | `nz_beehive_macro` | NZ Government Ministers | Same original feed, different topic gate; **NOT independent** | https://www.beehive.govt.nz/copyright |
| Macro/FX | `govuk_global_economy` | GOV.UK publishers | GOV.UK Search API as discovery only, exact first-party Content API first_published_at mandatory | https://www.gov.uk/help/reuse-govuk-content |
| Critical minerals | `nz_beehive_minerals` | NZ Government Ministers | Same original feed, distinct title matching | https://www.beehive.govt.nz/copyright |
| Critical minerals | `govuk_global_minerals` | GOV.UK publishers | Search index cannot substitute for original article; Content API verifies exact publication clock | https://www.gov.uk/help/reuse-govuk-content |

All 6 were already defined in Geomacro first-party source readers. No code
or content from other aggregators is copied. Public official content is **not**
automatically free of copyright exceptions. No source is described as having
been individually signed, rights-cleared for all its pages, or commercially
delivered merely because its feed appears here.

## Invariants

- `.github/workflows/five-minute-original-news-fastlane.yml` continues on
  best-effort 5-minute GitHub scheduling, not a hard real-time SLA; scheduled
  runs can be delayed or missed. Existing watchdog/backstop remains.
- The producer polls at most 16 fixed first-party primary lanes plus one
  conditional rotated existing original lane per quiet category (3 maximum).
- Only exact source native publication timestamps or publisher's verified
  first-published article timestamp count; no feed updated time, collector
  time, synthetic event, article URL guessing or redirected off-host links.
- Three named categories only. Geographic relevance must be evaluated on
  each issuer-authored article; 195 x 3 fresh event coverage is not implied.
- Only Geomacro-authored derived observations are admitted to the existing
  authenticated 72-hour D1 journal; original publisher prose, image, headline
  or raw upstream payload is not stored for sale or provided to Predge.
- Existing review, commercial-rights, independent event corroboration,
  signed score, hot B2/D1 object and x402 payment gates remain **fail closed**.
  These news lanes themselves do **not** make a signal chargeable.
- Individual page licence exceptions, third-party material and publisher
  attribution rules must still be independently checked before paid product
  promotion. Beehive's general reproduction policy excludes third-party
  material and logos. GOV.UK OGL exclusions are respected.
- Source transport, native-clock admissibility, observed D1 readback, website
  visibility, per-category fresh article count, and signed paid readiness
  are distinct acceptance outcomes. Do not merge them into one green status.

## Acceptance path

1. Run `bun run vitest run src/__tests__/five-minute-original-news-fastlane.test.ts`.
2. Run the changed code in the production-hosted five-minute workflow on main,
   with exact protected D1 credentials configured. Do not claim acceptance from
   pull-request tests or a static source registry.
3. Inspect counts for every originating issuer and category, original page
   verification, publisher-native timestamps and bounded retries.
4. Independently verify new rows in the authenticated D1 journal and the
   public website; run `node scripts/ops/verify-original-to-website-visible-20m.mjs`.
5. Only after independently approved rights/evidence/scoring signers, current
   product readback and a separately verified real x402 payment/delivery may
   paid commercial availability be announced.

## Current scope

This change has **no secrets, new database, new hosted service, paid API,
Supabase or Telegram dependency**, and does **not** change prices or Predge
contracts. Does not prove 195-country completeness. Free source discovery
and commercial authorization remain explicitly separate.
