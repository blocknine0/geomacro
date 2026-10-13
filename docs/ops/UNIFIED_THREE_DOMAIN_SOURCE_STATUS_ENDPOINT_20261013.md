# Unified Geomacro source-status view — 13 Oct 2026

**Canonical single URL:** `GET /api/v1/intelligence/query?view=source-status`
continues to serve `POST /api/v1/intelligence/query` unchanged for
existing x402 risk-intelligence requests. The GET does NOT fetch original
publisher articles, invoke intelligence models, sign data or require payment.

The new GET performs **one** bounded read of the existing Cloudflare
control-plane D1-projected `public/source-pulse-30m` response and returns
observational status for `geopolitics`, `macro-fx`, `critical-minerals`
together. It has no B2/Supabase read, no D1 write and is source-private.
Unknown, missing, degraded, spoofed paid/verified, stale or partial-issuer
status remains non-active. No claim of continuous ingestion or 195-country
fresh coverage is made merely by a reachable source.

**Actual private catalogue audit, 2026-10-13:** unified 90m GitHub workflow
[run #38385952870](https://github.com/blocknine0/geomacro/actions/runs/38385952870)
successfully catalogued 1,059 lane references across the three categories
(467 geopolitics, 459 macro/FX, 133 critical minerals). These are **entries**
not unique connected sources or publishers; they include inactive candidate
Telegram channels, historical-only and operator metadata overlays.
Zero Telegram candidates were provider-authorized in the previous pinned
inventory. No raw source identities, URLs or source hashes are exposed
from this public endpoint.

**Production root health audit** in that run: 535 registered discovery
roots, max 40 bounded HEAD checks/90m. The old contiguous selection
probed only geopolitics in that slot: 40 checked, 13 reachable,
zero macro or minerals checked. PR #2168 fixes that category-starvation
by rotating all categories through each slot without increasing free quotas.
The end-to-end all-roots census needs a complete 14-slot observation cycle;
successfully probing an HTTPS homepage is NOT evidence ingestion or licence.

## Remaining operational activation work

- Verify actual current original publisher feed transport separately from
  discovery-root homepage health (existing 30m official pulse).
- Verify `GET /api/v1/intelligence/query?view=source-status` in the actual
  deployed environment. GitHub CI passes do not prove Cloudflare/Lovable
  deployment or fresh D1 data.
- Reconcile all 1,059 **catalogue entries** by owner/credential/rights,
  deduplicate aliases, enable lawful read-only transports where available;
  no remote auth bypass for Telegram, 401/403/429 or copyrighted providers.
- A 90m scheduled workflow is best-effort and not uninterrupted real-time.

Customer-facing results remain derived only; this GET never discloses
publisher names, root links, source IDs or raw original content.
