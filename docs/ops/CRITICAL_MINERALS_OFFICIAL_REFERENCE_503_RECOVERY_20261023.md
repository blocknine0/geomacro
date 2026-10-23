# Critical Minerals: real first-party reference-source recovery, no funds

## Measured failure, not launch certification

The protected read-only web candidate #39944855027 resolved its exact current source-health gate:
- Geopolitics: 3 eligible reviewed observations
- Macro/FX: 2 eligible reviewed observations
- Critical Minerals: 0 eligible reviewed observations; candidate remained 503.

This failure is **different** from the signed B2/D1 Intelligence/GRI/Risk Indices 0/3 and legacy deep health 503. Neither health gate is bypassed.

## Existing open-data category source adaptation

1. Reuse official BGS World Mineral Statistics OGC API. The source's `year` can be a native Jan-1 midnight timestamp (`2006-01-01 00:00:00`) and nationality may be recorded as `country_trans` rather than `country_iso3_code`. Strictly parse only a valid year or 1-Jan zero-hour marker. Output the observation's **historical reference year** only; never manufacture a new mineral event, inferred country risk score or upstream provider record.
2. Add the independently retrieved **USGS first-party Publications Warehouse** JSON for the identical Mineral Commodity Summaries 2026 edition. URL is a fixed no-key GET `https://pubs.usgs.gov/pubs-services/publication/?reportNumber=mcs2026&page_size=2`. Accept only the exact original report id `mcs2026`, 2026 publicationYear and `Mineral commodity summaries 2026` title. This provides a second official issuer endpoint should ScienceBase's specific item request fail. No B2/Cloudflare/credit-card key, query-time sourced article, or raw upstream payload is delivered.
3. The existing live-structured Critical Minerals reviewer already accepts only `usgs_mcs_dataset_catalog`, source-rights scope `USGS_PRODUCED_PUBLIC_DOMAIN` and required USGS credit. The new source outputs that same **edition-only, score-null** kind. BGS is not added to commercial rights review: its minerals statistics licensing must be evaluated separately for third-party commercial reuse.

The existing category fetcher remains bounded with one extra official no-key GET (4 Critical Minerals endpoints total), no persistent storage and no Supabase. Failed or incorrect USGS API JSON remains a truthful 503 rather than a fabricated valid result.

## Verification

`bunx --no-install vitest run src/lib/category-open-data.server.test.ts src/lib/live-structured-deep-health.server.test.ts`

Existing no-funds candidate deploy must read actual first-party supplier payload before scoped live-structured health can return HTTP 200. A dataset catalog edition cannot certify current Critical Minerals market disruption or the 195-country 3-category commercial x402 engine. No current signing authority, GRI numerical index or real-money payments are granted.