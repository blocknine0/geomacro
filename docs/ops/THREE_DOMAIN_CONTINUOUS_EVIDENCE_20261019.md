# Three-domain continuous evidence (no fabricated real-time headlines)

Canonical free, source-neutral read-only Worker:
`GET https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/three-domain-continuity`

Implemented independently of Lovable SSR and legacy paid/signed hot snapshots.
Combines exactly the existing three zero-cost inputs:

1. The official-publisher D1 30m source pulse (target, not an uptime promise).
2. The 72h first-party-origin rolling Geomacro-derived news journal (0 news
   is valid; 15-minute embargo and original clocks remain enforced).
3. Existing 3-domain D1 observed open-data context from multiple independently
   checked official API families (geopolitics, macro/FX, critical minerals).
   These include historical annual data with its **reference period**, not
   invented current event timestamps. No new upstream requests or store.

A verified source context is current only within 3 hours of its original
`checked_at`. Older but structurally valid context within 14 days may be
shown with its **original** timestamp as
`LAST_KNOWN_HISTORICAL_NOT_REALTIME`, never current or chargeable. Older,
malformed, forbidden or mismatched data is dropped, not refreshed.

The endpoint always returns one status object per category if D1 is readable;
a source failure cannot erase other verified categories. The source pulse
is independent of the open-data context and journal. If one is unavailable
the response says so. Three successful connections do not guarantee three
current news releases, complete country coverage or commercially eligible
new facts. No raw upstream, no publisher article identity, no funds, no
Supabase/B2 access, no signed GRO/GRI scoring.

The existing scheduled 30m pulse performs a separate read-only direct
Worker canary during schedule runs, without adding an extra GitHub timer
or calling the paid endpoint. If a live original publisher, Cloudflare
runtime or GitHub cron fails, the service **must** report degraded rather
than manufacture current records. For actual commercial earning, the
separate evidence, rights, source-native time, exact price and x402
settlement conditions still apply.

Additional canonical website-side route (after exact Lovable publish):
`GET https://geomacro.live/api/v1/intelligence/query?view=continuous`
This is a fixed-origin, no-funds proxy with a strict three-domain response
contract. If the website cannot serve its SSR route, clients can continue
to use the independently deployed direct Worker URL. The two GETs expose
the same truthfully labeled D1-derived source measurements, never x402
readiness or paid fulfillment.
