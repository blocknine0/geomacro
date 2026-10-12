# Three-category live source activation — approved ReliefWeb

## Canonical live-source model, 12 October 2026

Three private first-party source families are **already scheduled** in `.github/workflows/expanded-official-source-observation.yml` at 16 intended UTC slots/day (90-minute cadence): Geopolitics includes UN News and UK FCDO; Macro/FX includes Fed, ECB and Statistics Canada; Critical Minerals includes USGS, NRCan, Australia Industry and UK DBT. Several additional routes are explicitly quarantined, not represented as working. First-party source transport does not itself imply fresh publication, original article-page date verification, two-publisher same-event corroboration, signatures or 195-country coverage.

The approved ReliefWeb supplement uses the **same existing 90-minute schedule**. There is no new cron or persistent process. It makes **at most one** ReliefWeb API v2 metadata-only POST per run, <=16 scheduled calls/day, bounded to 80 reports. ReliefWeb publishes original information-partner material; it is a **Geopolitics/humanitarian context discovery family**, **not** an independent publisher, and cannot substitute for the Macro or Critical Minerals first-party feeds. The source report's `date.original` is counted privately, not promoted to independently verified article-page time. Its raw report bodies, headlines, external source content and the approved appname are never written to Actions receipts or D1/B2/Supabase. No score, signed GRO or x402 output is created.

### Required one-time provider account binding

ReliefWeb requires an exact **pre-approved** `appname` from its approval email (approval dates since Nov 2025). An arbitrary site domain or another user's appname is not acceptable. Add the *exact approved identifier* as the GitHub **Actions environment secret** `RELIEFWEB_APPROVED_APPNAME` in `blocknine0/geomacro` → Settings → Environments → `production` → Secrets. The existing on-demand private discovery server separately reads its runtime environment variable **with the same name**; configure it there too if that server should make requests. These secrets cannot be inferred from an approval statement or propagated automatically by a GitHub code change. Do not paste secret values to logs.

If absent, the scheduled ReliefWeb step reports `CONFIG_REQUIRED`, sends **zero** upstream requests and does not claim activity. With a valid name, `LIVE_METADATA_TRANSPORT` shows provider response acceptance (not source publisher rights or current intelligence). 401/403/429 produces `ACCESS_DENIED_OR_QUOTA` with no credential rotation or immediate retry.

### Cost and acceptance boundaries

- This metadata observer uses **zero** Supabase, D1, B2 and x402 calls; leave the old `ingest-reliefweb-live.yml` direct Supabase writer manual-only and blocked under frozen free-tier conditions.
- All live-source observations remain private, not directly sold. Rights, independent evidence, risk scoring and cryptographic signing are required separately before publishing derived intelligence.
- Verify after merge: exact production Actions run contains three-domain official transport receipt plus ReliefWeb receipt with `LIVE_METADATA_TRANSPORT`, `api_requests=1`, and source-native counts. If no report within 24 hours, truthfully show zero; this is not a failed HTTP probe.
- The 90-minute GitHub Actions schedule is **best effort**. Actual real-time on-demand research requests can use existing direct official APIs separately, with no persistent data storage; neither mode guarantees 195-country freshness.
