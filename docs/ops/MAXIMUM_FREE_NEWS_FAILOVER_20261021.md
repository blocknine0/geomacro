# Geomacro maximum free-source resilience, no new services (2026-10-21)

## Scope
The previous minimum free site acceptance is retained. This upgrade improves the
**actual live first-party ingest pipeline**, not just the health dashboard.
Use the same GitHub Actions 5-minute best-effort fastlane, existing hourly
multi-source collection, existing :22/:52 recovery, existing Cloudflare D1
72-hour Geomacro-authored derived journal, website 15-minute embargo and
shared API/partner derived data. There is no new required subscription,
Cloudflare project, third-party paid API, storage bucket or Supabase.

## Fixed primary portfolio
- Geopolitics: UN News + UK FCDO.
- Macro/FX: Federal Reserve + WTO + ECB releases.
- Critical minerals: Natural Resources Canada + US DOE minerals.

Seven vetted original-source paths are polled as already configured. Pinned
first-party native publication clocks, source-specific credits/rights,
independently checked article identity and existing Geomacro-derived unscored
output remain authoritative. Beehive's currently HTML response is not
silently treated as valid XML. WTO is an officially sourced trade news lead,
not a universal trade data or commercial reuse licence.

## Maximum-*resilience*, zero extra calls in the healthy state
The 5-minute reader now has EXACTLY ONE **conditional** alternative per domain:
- Geopolitics: Global Affairs Canada original statement feed.
- Macro/FX: BIS original press-release RSS.
- Critical minerals: GOV.UK Department for Business and Trade.

Only when **all primary feeds in that category are unhealthy** does it
attempt that category's independently pinned first-party fallback. Up to
3 additional first-party origin reads **per failing run**, no extra reads
if every category has at least one healthy primary. One dead source no
longer blocks the other healthy issuers. Individual unexpected source
exceptions are isolated instead of cancelling all three domains.
Both a failed fallback and exhausted primary must emit real category
failure; do not forge a successful publisher tick.

The same original article canonical parser and category topic restrictions
apply to fallbacks. Native dates and 15-minute original-publication embargo
remain enforced, along with 72-hour retention and exact existing D1 readback.
A category's absence of relevant news is not a transport failure. There
are no duplicate/raw original exports, new D1 tables or new paid offers.

## Global maximum-free boundaries
The existing larger hourly collector covers many more first-party endpoints,
and on-demand 195-country routing is independent. This patch does **not**
claim that 195 countries x 3 domains are fully current, that every issuer
has a valid RSS feed or that a 5-minute GitHub cron offers a fixed SLA.
Country scopes with insufficient dated relevant originals truthfully return
unavailable. Immutable or rights-reviewed paid/signed GRO/GRI and Risk
Indices remain separate, with existing legacy deep health HTTP 503 until
actual independent signed authority and B2/D1 current snapshot verification.
No scheduled job or fallback can synthesize a signed numerical GRI.

## Verify
1. Exact-head `src/__tests__/five-minute-original-news-fastlane.test.ts`
   and Product CI (no synthetic news in production).
2. Existing real `Five-Minute Original News Fastlane` on production main
   shows `conditional_fallback_attempted` only in genuine all-primary
   category outages and no duplicated publisher id.
3. The existing 72-hour public D1 journal and the first HTML response
   should agree at the actual native publication timestamp; report 0
   when no new official release qualifies.
4. `Production Website Health` must continue failing for unavailable
   signed products, irrespective of free-derived uptime.
5. The first real USDC must stay disabled until owner-controlled verified
   merchant/facilitator configuration, licensed exact prepared output,
   no-funds settlement acceptance and explicit owner funds acknowledgement.

Even free-tier hosting and upstream feeds have rate limits and outages;
"permanent" here means committed guarded fallback and automated recovery
logic, not a guarantee that external providers never fail.
