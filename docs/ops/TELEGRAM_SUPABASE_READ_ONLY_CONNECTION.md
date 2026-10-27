# Telegram Signals: isolated Supabase, main GeoMacro read only

Producer is the private repository `blocknine0/geomacro-telegram-signals`.
It exclusively ingests consented Telegram Bot posts and writes the separate
Telegram-signal Supabase project. This main repository does **not** receive a
Supabase service_role key, Telegram Bot token or write endpoint.

Server-only variables:

- `GEOMACRO_TELEGRAM_SIGNALS_READ_URL`:
  `https://<deployed-producer-worker>/v1/private/telegram/signals`.
- `GEOMACRO_TELEGRAM_SIGNALS_READ_TOKEN`: independent 32+ character private
  token. Must match producer `TELEGRAM_SIGNALS_READ_TOKEN`.
- GitHub variable `TELEGRAM_SIGNALS_READ_ENABLED=true` to enable main's
  hourly external read-only API smoke check. Store URL/token as repo secrets
  with the two names above for the workflow, and runtime server env values
  for the actual application.

The existing `on-demand-telegram-fallback.server.ts` prefers the
Supabase-backed producer's read-only GET when configured and original article
evidence is insufficient. It returns only the number of UNVERIFIED metadata
leads. No Telegram message body, post URL, article title, verified outcome,
database mutation, PREDGE integration or commercial delivery is introduced.

A monitored read endpoint plus metadata does not prove a news fact. The
existing original-source corroboration/qualification pipeline continues to
control whether any signal becomes qualified GeoMacro intelligence.
Activation additionally requires live publisher-authorized Bot posts,
producer migration, deployment and outside-in end-to-end readback.
