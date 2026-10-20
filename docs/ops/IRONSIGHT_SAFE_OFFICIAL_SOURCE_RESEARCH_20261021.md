# IRONSIGHT integration: official-source research, free cloud execution

Date: 21 October 2026
Upstream: https://github.com/NoblerWorks-HQ/IRONSIGHT
Upstream source repository: MIT, copyright (c) 2026 Nobler Works.

## What was integrated

Geomacro independently implements a bounded reader for two original government-source RSS URLs listed in IRONSIGHT:
- U.S. CENTCOM official publisher: `https://www.centcom.mil/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=808&max=20`.
- U.S. Department of Defense original publisher: `https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=10`.

The code is `scripts/ops/probe-ironsight-official-sources.mjs`; independent negative tests are `scripts/ops/probe-ironsight-official-sources.test.mjs`. The six-hourly GitHub-hosted workflow is `.github/workflows/ironsight-official-research-probe.yml`. This path runs with zero Telegram keys, zero funds, no Supabase, no B2 and no 24/7 laptop. Strict issuer allowlist, one GET per issuer, manual redirects, 403/429 no-bypass, bounded 192 KB XML, no malformed feed accepted and no synthetic date if native original publication time is absent. Logs are bounded read-only transport metadata, no XML or article text.

IRONSIGHT's source list is a *discovery hint*, not an existing Geomacro publisher authorization and not an independent same-event corroboration. This workflow does **not** promote research candidates to Intelligence, GRI, Risk Indices, Predge or commercial x402, because merely observing a publisher RSS envelope cannot prove exact original article identity, current original publication time or applicable reuse rights. Promotion must reuse existing Geomacro original-source provenance and rights checks.

## MIT is for software, not every upstream news item

The IRONSIGHT repository MIT licence permits use of the project's software subject to retaining its notice. It does **not** licence content owned by CENTCOM, DoD, Reuters, BBC, Telegram channel publishers, Google, or other services. IRONSIGHT's own README says it operates as a noncommercial educational/research viewer and names unofficial endpoints that may violate provider terms. This repository imports neither the Next.js UI/dependencies nor the Telegram embed scraper, bulk RSS newspaper feeds, Google Translate unofficial proxy, Yahoo market proxy, maps, prediction-markets or military flight tracking.

The original publisher may separately grant broad reuse rights for some U.S. government works. That requires verifying the specific content, third-party exceptions, required attribution and product usage, not presuming the entire feed is owned by the U.S. government or commercially cleared.

## Execution and proofs

After PR green checks and merge, GitHub Actions > `IRONSIGHT Independent Official Research Sources (No Funds)` runs on main automatically every six hours and supports manual dispatch. Observe sanitized enum outcomes `OFFICIAL_FEED_TRANSPORT_OBSERVED_RESEARCH_ONLY`, `REDIRECT_NOT_FOLLOWED`, `NON_200`, `PUBLISHER_FORBIDDEN_NO_BYPASS`, `RATE_LIMITED_NO_RETRY`, `NOT_XML_MEDIA_TYPE`, `UNQUALIFIED_XML_ENVELOPE`, `NETWORK_OR_BOUND_EXCEEDED`.

If a real official feed and real native original article pass rights/source tests, register the issuer's own exact source in Geomacro's existing original-source newsroom adapter **in a separately gated PR**; then the existing 15-minute Intelligence delay and single-source derived journal can apply. Do not feed unsigned scraped Telegram text into paid outputs.

There is **no** claim that this makes 195 x 3 cells current, guarantees every news event in 20 minutes, activates protected Telegram authorization, or generates certified GRO/GRI. An authorized private channel acknowledgement (even if real) is not accessible to public CI, and neither a MIT software licence nor a public URL substitutes for channel-owner or Telegram platform permission.

## Validation

1. Independent unit tests for fixed official origins, good native-dated RSS, undated Atom, HTML/XML rejects, 403/429, redirects, output secrecy, no source bodies/IDs, budgets, and no Telegram source/session.
2. Actual GitHub-hosted probe (not desktop). Transport receipt only; do not interpret green CI as verified news or rights.
3. No website changes, free-plan upgrades or public-API exposure.
