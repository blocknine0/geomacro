# Official Macro reference availability gap: WDI latest nonempty

The protected main audit on Oct 20 found 2025 annual World Bank CPI values for 166/195 canonical countries and GDP growth for 181/195 countries. **This does not mean the other countries have no historical observations**, or that any given 2025 series is the same as a current publication.

The separately documented official WDI `mrnev=1` query obtains the most recent non-null annual period per World Bank reporting geography. One bounded no-key GET with 700-row cap, 512KiB maximum streamed body, 25s timeout, no redirects. Filter strictly to the existing 195 ISO3 countries, no region/aggregate substitutions.

The new 3-day private metadata receipt reports exact reference **year** for each canonical country and the per-indicator counts for any historical observation, reference within 5 years, reference within 10 years, missing entirely. It does not save a single numerical value and does not report historical years as live releases or current events.

A missing/restricted data source must remain unavailable, not zero-filled, mathematically guessed or upgraded to a qualified geopolitics/minerals event. The government-country source and rights gates remain unchanged, and no B2/D1/Supabase, x402, payment or new cron is introduced.

IMF DataMapper's exact 2025 official WEO bulk read returned **two genuine HTTP 403** on GitHub in run 39392402140, so this PR prevents a **second identical publisher** request after the first hard access denial in one scheduled run. A blocked IMF WEO reference remains unverified and does not count as additional actual GDP/CPI coverage.

Source docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures
