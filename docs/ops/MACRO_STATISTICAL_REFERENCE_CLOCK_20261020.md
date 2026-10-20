# Macro statistical reference dates are not issuer publication clocks

20 October 2026. Two legacy structural adapters had promoted a dataset reference period into `published_at`: World Bank Pink Sheet commodity data used the first of the month; UNCTADstat used the first of a month or the fetch time for annual/quarterly data. These are not authentic source publication timestamps. Repeated daily downloads therefore falsely created new published events.

Both now retain numeric values, unit, issuer and source record identity while returning `published_at: null`, `observation_period` and `clock_semantics` (`reference_month`, `reference_year`, `reference_quarter`), plus `native_publication_time_verified: false`. The existing `observed_at` is explicitly retrieval time and never eligible as current original publisher news.

Invalid months, malformed quarters and fabricated dates are rejected. This does not rewrite historical records, establish source rights, confirm current FX trades, sign any GRO or enable payment. Follow on with an explicit read-only audit of old records before current signed promotion.

Acceptance: `node --test scripts/tests/macro-statistical-reference-clock.test.mjs` plus P0 adapter certification and CodeQL. No B2/D1/Supabase writes or funds.