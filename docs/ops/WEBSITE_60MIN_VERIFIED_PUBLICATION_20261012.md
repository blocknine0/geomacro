# Website-only one-hour verified data embargo — 12 October 2026

## Founder decision

Geomacro **website** /global-risk, /risk-indices and /intelligence public
display and homepage previews shall release an independently verified record
only after **a full 60 minutes** has elapsed.

**No delay** is added to country/corridor/macroeconomic internal intelligence
generation, independently signed GROs, API/agent read paths or the commercial
x402 availability and delivery logic. Pricing remains unchanged while the
owner prepares updated pricing.

This is a **release policy**, NOT making newer records appear older by changing
their original publication, evaluation, verification or snapshot times.

## Intelligence website

- The SSR/SEO loader filters rows BEFORE they are serialized to web hydration
  or rendered.
- Client refresh/legacy edge fallback filters again before mapping/dedup.
- Both **original publication time** and the persisted record `created_at`
  must be at or before `now-60min`; a recent restore/ingest also waits.
- Missing original publication date and future/stale timestamp anomalies never
  qualify as a current website story. Dated historical verified assessments
  stay historical; unscored observations stay unscored.
- This affects only the website frontend and the website SSR function, not the
  separate canonical x402 POST source collection, signing or settlement flow.

## Global Risk website (and companion website indices)

- Frozen `/global-risk` route and finalized
  `global-risk-domain-indices.tsx` markup remain byte-for-byte unchanged.
- New GET-only server function selects the most recent **genuine verified,
  published, same-methodology GRI snapshot with `as_of <= now-60min`**.
  It retains original ID, original proof/methodology hashes, history and
  independent domain readings. It does not interpolate, rescore or backdate.
- The original event evidence used in the website projection must also have
  real publication/recorded clocks at or before cutoff; per-article source
  names/URLs are **not delivered to the website**.
- If the frozen Supabase read store is unavailable, ONLY a full independently
  verified existing B2 snapshot already older than one hour may be used;
  otherwise the frontend reports verified data unavailable. It must not fall
  back to a new live snapshot merely to make the site green.
- The website /risk-indices view derives its domain data from the **same
  delayed verified GRI**; the existing live machine/worker API remains live.
- Existing Global Risk continuity validator still applies to the selected
  full prior snapshot, including histories and all category hashes. Historical
  point comparison must not be faked.

## Deployment acceptance and limitation

The successful static/CI contract proves minimum-60-minute hold. Full
**continuous exactly-one-hour-behind** availability requires a prior snapshot
always accessible through the verified Supabase history or an independently
verified durable edge history. If neither has one, website must honestly show
unavailable. A freshness delay is not a remedy for missing signed risk evidence.

Publishing needs the owner to publish synced Lovable after merge, and an exact
live check of the website showing no under-60min story/score, correct historical
status and unchanged x402 machine routes. No real-money test or price update.

Master tracker: https://github.com/blocknine0/geomacro/issues/1827
