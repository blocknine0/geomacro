# Expanded original official sources — bounded observation (2026-10-10)

**Status: discovery/transport only. NOT commercially admitted. NOT 195-country current intelligence.**

The live Geomacro three-domain original-publisher probe already observes up to 3
source families per category on its existing cadence. This separate, additive
six-hourly monitor observes **three additional official endpoints** without
consuming B2, D1, frozen Supabase, paid AI/model or USDC quotas. All source
data remains PRIVATE. It does not score events or edit risk objects.

| Domain | Additional source | Fixed official endpoint | What it can actually establish | What it CANNOT establish |
|---|---|---|---|---|
| Geopolitics | European Commission sanctions guidance updates | https://finance.ec.europa.eu/node/1296/rss_en | Publisher RSS reachable; optionally source-native item release `pubDate` in 24h | A new legal sanctions designation, worldwide coverage or scored conflict event |
| Macro/FX | ECB statistical press releases | https://www.ecb.europa.eu/rss/statpress.html | Publisher RSS reachable; source-native release clock when present | Live global FX ticks, full national balance sheets or a verified macro-shock |
| Critical Minerals | EITI country metadata API | https://eiti.org/api/v2.0/implementing_country | Official extractives-country listing JSON accessible | Real-time extraction, prices, supply shock or 195-country coverage |

Supporting official references:
- https://www.ecb.europa.eu/home/html/rss.en.html
- https://finance.ec.europa.eu/eu-and-world/sanctions-restrictive-measures/sanctions-adopted-following-russias-military-aggression-against-ukraine/guidance-documents_en
- https://eiti.org/api
- https://eiti.org/open-data

### Three domain production acceptance contract

1. **Discovery**: fixed HTTPS publisher, bounded response, MIME, no redirect,
   exact native publication when available; source availability != event.
2. **Official original event**: article-level original publisher date and
   attribution; GDELT index time, feed update time and HTTP retrieval are NOT
   event times. For EITI, fiscal reporting year is structural context.
3. **Commercial rights**: signed/citable permission for exact dataset/endpoint
   and derived answer redistribution, not implied by public URLs. Keep
   `commercial_eligible:false` until legal/owner evidence is entered.
4. **Same-event corroboration**: independent publishers, not two mirrors or
   multiple URLs on one publisher family.
5. **Scoring and evidence**: canonical signed GRO, permitted source selection,
   country/event attribution and severity. No fabricated story or time.
6. **Quota-governed publication**: only accepted scored data flows through B2
   full PUT/GET SHA256/gzip restore and verified D1 checkpoints. Frozen
   Supabase remains unwritten; missing current hot snapshot stays HTTP 503.
7. **Paid endpoint**: unverified, stale or unsupported country returns no
   payment challenge/charge; x402 no-funds acceptance before owner ACK.

### Cadence, geography and honesty

- Existing official event feeds: continue their established hourly sampling.
- Additional official release/structural probes: **4 times per UTC day**,
  three GET requests per cycle (~12 total requests/day), 5s timeout and
  192-KiB maximum body per endpoint, no retries and no paid credentials.
  This is low-cost, not instantaneous distribution, and may be held by
  upstream rate limits. Event-specific frequency must match actual publishers.
- ECB is euro-area-focused; EU sanctions is Europe-issued/global-designation
  scope; EITI has a limited implementing-country membership. Even a healthy
  three-source observation is **zero proof** of 195 countries current.
- Global country coverage requires national central banks, stats offices,
  sanctions and government outlets, mineral regulators and customs/trade
  administrations; event correlation across distinct publisher families and
  actual site/D1 serving must be independently verified.
- **Status criteria:** an external 403/429, MIME or schema mismatch yields
  `SOURCE_TRANSPORT_DEGRADED`, not fake source freshness. PR tests validate
  safe fail-closed behavior even during publisher outage; real main/scheduled
  production fails RED and preserves a sanitized three-day receipt.

No redistributable raw source articles or bulk EITI data are produced by this
workflow. It is a staging increment, not launch acceptance.
