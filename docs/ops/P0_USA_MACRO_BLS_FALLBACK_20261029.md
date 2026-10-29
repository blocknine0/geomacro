# USA Macro/FX P0 — public-domain CPI-U structural fallback (29 Oct 2026)

## Scope

This repair targets **USA `macro_monetary` for an explicitly selected, single-country structural-baseline Store digest only**, not the live Macro/FX category, all countries or a signed risk object.

Existing B2-qualified structural observations remain first choice. If a paid Store query lacks a matching, rights-approved, source-native `macro_monetary` observation, the approved USA-only BLS source is evaluated. A previously denied B2 record must never become eligible simply because the dimension matches.

Source: official U.S. Bureau of Labor Statistics all-items unadjusted CPI-U (`CUUR0000SA0`), GET API v1, no API key.
- API contract: https://www.bls.gov/developers/api_signature.htm
- Series: https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0
- Rights: https://www.bls.gov/opub/copyright-information.htm (BLS own federal published material is public domain except copyrighted imagery). This source excludes all imagery and BLS trademarks; credit is requested by BLS but not stated as an obligatory license condition.
- Raw publisher payload and source identifier stay server-side and are **never returned** to buyers.

Safety:
- Strict exact series, USA country only, monthly M01–M12 only, not M13 annual; requires success result and finite positive index, excludes provisional/flagged data and future periods.
- Original **observation month end** is the freshness clock. A retrieval timestamp is NOT an event, publication, CPI-release time or monetary policy decision.
- Each derived observation carries a SHA-256 of the original API response, normalized exact series row and declared measurement month for internal audit.
- Expired >400-day data, 4xx/5xx/HTML/invalid or over-limit JSON, duplicate months and unavailable upstream fail closed with **no charge**; 12-hour memoized cache and one-hour failure cooldown, no background polling.
- No generalized equivalence of GDP/market rates to CPI, no fake index scores, no retroactive signing, and no new Supabase/D1/B2 source writer.
- This is one structurally usable measured module. Profile (2 dimensions) and current signed Macro products are **not** satisfied by this alone.

## Exact acceptance still required

The PR validates deterministic synthetic fixtures but does NOT prove live BLS response, merchant USDC prerequisites, or first payment. Run production no-funds preflight after syncing/publishing exact merged GitHub SHA and inspect USA `macro_monetary` status, source-specific rights proof and frozen deliverable bytes. Any missing proof stays 422/no payment.

PREDGE integration remains fully immutable. Geopolitical-security source acquisition and Critical Minerals payable payment rail remain separately open tasks; the UCDP CC BY 4.0 feed requires source attribution incompatible with current upstream-identity-private paid contract, and is not silently commercially certified.
