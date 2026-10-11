# Free-tier 195+ geography × three-domain intelligence operating boundary

**2026-10-11 checkpoint — practical source monitoring, not 195×3 commercial acceptance.**

## Country denominator — do not conflate countries, areas, and current signals

- Existing canonical classification has **194 sovereign ISO3 codes**, **53 territories**, **3 special entities** = **250 distinct geographical entities**. Historic planning documents call a separate **195-country baseline**. Neither number may be labeled "195 independent sovereign states currently verified" without a deliberate reconciled definition.
- The current D1 `country_domain_state` matrix is *readiness metadata only*; the existing `scripts/ops/audit-90min-three-domain-coverage.mjs` audits 195 minimum per domain and expressly refuses to infer signed intelligence. An all-green structural matrix remains insufficient.
- Source directory records for 195 national government portals and monetary authorities, 194 statistics offices and minerals baselines are **discovery coverage, not working endpoints or new news**. Do not count catalogue records, regional mandates or Telegram discovery entries as independent original-publisher event evidence.

## Actual low-cost data topology

| Layer | Geopolitics | Macro / FX | Critical minerals | Cost / truth boundary |
| --- | --- | --- | --- | --- |
| **Broad global discovery** | Existing GDELT 2.0 event *index* + UN original announcements | Release/calendar discovery + World Bank WDI periodic country metrics | USGS/BGS annual baseline + mineral-trade/policy index leads | Public/free candidate signals; GDELT is not the originating article or a licensing decision |
| **30-minute original-publisher watch** | UN News + UK FCDO | Federal Reserve + Statistics Canada | Two rotating from NRCan, USGS and Australian Industry Minister | Up to **six originating publisher feed probes per 30m slot**; successful retrieval != new event, country coverage or independent same-event verification |
| **90-minute official observation** | Original UN/EU/government sanctions feeds | ECB/Eurostat/central-bank releases | USGS/NRCan/EITI/Australian originals | Existing **13-source** monitoring; some endpoints degraded, never suppress 403/429/invalid publication timestamps |
| **Country-specific expansion** | Activated country-government/sanctions/policy publisher only after endpoint, native timestamps & source use are verified | National bank/statistical publisher with its **own** monthly/quarterly/annual release clock | National mining, geological, customs/export authority; context where no current primary reporting | Select sources only where justified by a real candidate event or scheduled national release. Never poll 195×3 pages every 30 minutes |
| **Paid publication** | 2+ genuinely independent original families, event identity, rights review | Same-event/release evidence plus harmonized methodology and release period | Mineral/commodity and nation specificity, same-event review, rights | Existing trusted reviewer Ed25519 signature + GRO + D1/B2 verified proof + x402. Missing proof -> no charge |

**Existing 30-minute gap fixed in this PR:** a busy first originating publisher previously blocked fetching the *second* original publisher in the same slot. Now probe the second independently named official publisher even when the first has topical items (at most 2 per domain), while preserving existing no-401/403/429-bypass behavior. This improves opportunity to discover corroborating leads but cannot establish same-event identity, publisher ownership, independent corroboration, free commercial content rights or 195-country current intelligence.

## Release-clock semantics

- **Source checked at T:** one successful bounded HTTPS origin fetch, not a development.
- **Original native article at T:** article-level publisher `pubDate/published/datePublished`, not RSS channel update or GitHub execution clock.
- **Near-real-time candidate:** development whose actual native time is within relevant policy window, topic/country parsed, no future timestamp or original URL mismatch.
- **Periodically released statistical metric:** record the official series reference period and edition/date, **not** a claimed 30-minute news event.
- **Country×category current verified:** original article + qualifying second independent originating publisher for the **same canonical event**, source rights, reviewer signature, country assignment, severity, signed current GRO and customer-served verified B2/D1 state; zero news ≠ zero risk.

## Zero-money/resource budget

- Reuse current GitHub main workflow `.github/workflows/three-domain-30m-original-publisher-pulse.yml`, which samples at best-effort UTC 12,42 and stores a 2-day private transport receipt and D1 hash/status checkpoint only. Base feed ceiling **6 origins × 48 slots/day = 288 primary feed requests/day**, plus existing bounded original article-date checks. This is a **request ceiling, not a promise of free hosting or a hard endpoint SLA**. Actual HTTP origins can refuse/restrict usage.
- Reuse the currently scheduled 90-minute official mesh and one grouped D1 metadata SELECT; do not expand it into 195×3 per-site recurring GETs. Honor 401/403/429, robots/publisher licensing, size caps, no unauthorized retries and upstream release frequency.
- World Bank Indicators v2 (https://datahelpdesk.worldbank.org/knowledgebase/articles/889392) is no-API-key global *periodic macro* coverage where source licensing permits. It is not a fresh country geopolitical story or current critical mineral disruption. GDELT's free event **index** releases roughly every 15 minutes (https://gdeltproject.org/data.html) but neither that index nor its timestamps replace first-party original publication.
- Never route raw publisher content into public site/API or models; customer pays for verified Geomacro-derived risk intelligence only.
- On upstream rate-limit, unavailable source, missing native article clock, dormant country, or legal restriction: report exact gap; do not fabricate current country headlines or create synthetic data.

## Measured acceptance, not promises

1. Record source probe health / original native topic counts **for all 3 categories** every completed 30m run, with attempt/success counts per original pair. GitHub schedule delivery is not guaranteed.
2. In the separate 90m D1 audit, require >=195 valid metadata cells/category and expose actual recent verified metadata counts; these are **minimum necessary, never sufficient** for customer coverage.
3. For every proposed `current verified` country×category cell, require a **country-specific** official source original + independent same-event original, first-party date, rights, reviewer signature, GRO and B2/D1 outside-in proof. Count actual cells as received, never mark all 750 or 585 cells by assumption.
4. Per-country priority list is derived from missing/expired *actual* cells, not the mere presence of country directories. No country with no supported original publisher gets a fake "zero news" verdict.
5. x402 payment is fail-closed for unsupported/stale products until separately proven, with explicit real-money owner ACK.

## Scope of PR

This increments **actual original-source breadth in busy 30-minute windows**, with low incremental network cost and strict tests. It does **not** complete global 195-country three-domain intelligence coverage, unfreeze Supabase, change the main trust pipeline, add Telegram scraping or authorize real-money payments. Additional source adapters and independent rights reviews remain future engineering work.
