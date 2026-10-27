# Private owner Telegram group official-original alert reader
Producer: `blocknine0/geomacro-telegram-signals`, owner original alert worker.
This main repository only uses authenticated HTTPS GET on the producer's
`/v1/private/owner-news` endpoint; no direct Supabase DB access, no POST,
no publisher Telegram group read, no PREDGE and no x402 mutations.

For the website / server runtime configure secret environment variables
`GEOMACRO_OWNER_NEWS_READ_URL=https://<producer-worker>/v1/private/owner-news`
and `GEOMACRO_OWNER_NEWS_READ_TOKEN` (same independent 32+ character producer
read bearer). The typed `readOwnerOriginalNews()` server-only helper validates
each source ID's canonical issuer hostname, three domains, 25-hour native
release freshness, schema and unverified state, and refuses redirects.

For the GitHub read-only monitor, store those same two names as main repository
Actions secrets and set `TELEGRAM_OWNER_NEWS_READ_ENABLED=true` variable.
Hourly GET monitor only: it **cannot** write to Supabase or the main D1.
Observing first-party publisher release title/URL is useful for research,
but alone is not independent fact corroboration or country-specific evidence.
There is no inference that every country or every 152 Telegram channel is live.
