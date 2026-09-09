# Country Flash Intelligence Production Runbook

This runbook activates the low-latency country-level breaking-news layer introduced by PR #125 without changing the core Geomacro rule that raw fast-wire leads do not directly mutate GRI or Risk Gate outputs.

## Production boundary

- Fast Telegram/RSS items are leads, not truth.
- Every new item starts `UNVERIFIED`.
- Independent evidence can move an item to `CORROBORATING` and then `VERIFIED`.
- A single source cannot self-verify.
- Source reliability changes verification weight, not ingestion permission.
- Restricted publisher/relay content must not be exposed as a raw commercial customer feed.

## 1. Required GitHub production secrets

Configure these as GitHub Actions secrets before running the Supabase deployment workflow:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`
- `FLASH_INGEST_TOKEN`

`FLASH_INGEST_TOKEN` should be a long random secret generated specifically for the country-flash worker/function boundary. Do not reuse a user password, Telegram credential, Supabase service-role key, or wallet secret.

The workflow intentionally does not print secret values.

## 2. Supabase deployment workflow

Workflow:

`.github/workflows/deploy-country-flash-supabase.yml`

It is manual-only and has two modes.

### Plan

Run `mode=plan` first.

The workflow:

1. validates required deployment secrets;
2. links the production project;
3. runs `supabase db push --dry-run`;
4. makes no production database/function changes.

Review the migration plan before applying anything.

### Apply

After the plan is correct, run `mode=apply`.

The workflow:

1. repeats the migration dry run;
2. applies pending migrations with `supabase db push`;
3. syncs `FLASH_INGEST_TOKEN` into Supabase Edge Function secrets;
4. deploys `live-flash-ingest`;
5. deploys `live-flash-corroborate`;
6. runs non-synthetic endpoint smoke checks.

Both Edge Functions are deployed with `--no-verify-jwt` because they use the dedicated `x-geomacro-flash-token` application-level authentication boundary. The functions still reject requests that do not carry the exact flash token.

Expected production endpoints:

```text
https://<SUPABASE_PROJECT_ID>.supabase.co/functions/v1/live-flash-ingest
https://<SUPABASE_PROJECT_ID>.supabase.co/functions/v1/live-flash-corroborate
```

The ingest smoke check deliberately submits an empty authenticated payload and expects the function's validation error, so it proves routing/auth/configuration without inserting a fake news event.

The corroboration smoke check runs one normal corroboration cycle against current stored data.

## 3. Worker container image

Workflow:

`.github/workflows/country-flash-worker-image.yml`

Pull requests build the container but do not publish it.

On `main`, the workflow publishes:

```text
ghcr.io/blocknine0/geomacro-country-flash:<git-sha>
ghcr.io/blocknine0/geomacro-country-flash:latest
```

Use the immutable Git SHA tag for production deployments when possible. `latest` is a convenience pointer, not a rollback record.

## 4. Long-lived worker runtime secrets

The container host needs these values through its secret manager/runtime environment. Never bake them into the image.

```text
GEOMACRO_FLASH_INGEST_URL=https://<project>.supabase.co/functions/v1/live-flash-ingest
GEOMACRO_FLASH_CORROBORATE_URL=https://<project>.supabase.co/functions/v1/live-flash-corroborate
GEOMACRO_FLASH_INGEST_TOKEN=<same value as FLASH_INGEST_TOKEN>
FLASH_CORROBORATION_INTERVAL_SECONDS=15

TELEGRAM_ENABLED=true
TELEGRAM_API_ID=<telegram api id>
TELEGRAM_API_HASH=<telegram api hash>
TELEGRAM_SESSION=<telethon string session>
TELEGRAM_CHANNELS=@liveuamap,@FinancialJuice,@ReutersWorldChannel
TELEGRAM_SOURCE_RELIABILITY_JSON={"liveuamap":60,"financialjuice":45,"reutersworldchannel":35}
TELEGRAM_MAX_BODY_CHARS=6000

BREAKING_RSS_ENABLED=true
BREAKING_RSS_POLL_SECONDS=45
BREAKING_RSS_BOOTSTRAP_MAX_ITEMS=25
BREAKING_FEED_USER_AGENT=Geomacro/1.0 (+https://geomacro.live; contact=contact@geomacro.live)
```

The worker does not need the Supabase service-role key. Keep that key inside the Supabase Edge Function environment only.

## 5. Telegram session creation

Generate the Telethon StringSession locally from a trusted machine:

```bash
cd workers/telegram-flash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python generate_session.py
```

On Windows PowerShell use the normal Windows virtual-environment activation command instead of `source`.

Store the generated StringSession only in the production host's secret manager. Never commit it, paste it into GitHub issues/PRs, or expose it in logs/screenshots.

If the StringSession is ever exposed, revoke/replace the Telegram session before continuing production use.

## 6. Recommended first activation sequence

1. Merge the production-activation PR only after CI is green.
2. Add the four GitHub production secrets.
3. Run the Supabase deployment workflow in `plan` mode.
4. Review the pending migration list.
5. Run the same workflow in `apply` mode.
6. Confirm both endpoint smoke checks pass.
7. Confirm the worker image is published from `main`.
8. Start the container in RSS-only mode first with `TELEGRAM_ENABLED=false`.
9. Verify new RSS records enter `live_flash_events` and remain `UNVERIFIED` until corroborated.
10. Enable Telegram credentials/session and the channel allowlist.
11. Verify Telegram records use stable source/message identity and edits update rather than duplicate the same message.
12. Confirm corroboration edges are being written and no single-source item becomes `VERIFIED` by itself.
13. Only after this runtime verification should the flash layer be treated as production-active.

## 7. Host requirements

Use a service that can run a long-lived Docker container continuously.

Minimum operational requirements:

- restart policy on failure/reboot;
- encrypted secret injection;
- outbound HTTPS access to Supabase/RSS sources;
- Telegram MTProto outbound connectivity;
- persistent service logs with secret redaction;
- health/restart monitoring;
- no public inbound port is required by the worker itself.

The worker is not suitable for a short-lived request/serverless runtime because the Telegram listener is event-driven and long-lived.

## 8. Production checks

Healthy behavior should show:

- Telegram messages reaching `live_flash_events` within the source/network/runtime latency;
- RSS entries generally appearing within the configured poll interval;
- the corroboration loop running around every 15 seconds plus jitter;
- country relations in `live_flash_event_countries`;
- corroboration evidence in `live_flash_corroborations`;
- `UNVERIFIED -> CORROBORATING -> VERIFIED` transitions only when independent evidence satisfies the verifier;
- no direct raw-flash mutation of GRI/Risk Gate merely because a headline arrived.

Do not describe these timing targets as guaranteed source-publication latency.

## 9. Rollback

If production behavior is wrong:

1. stop the long-lived worker first to stop new ingestion;
2. preserve logs and the affected flash IDs for diagnosis;
3. redeploy the previous known-good function revision if the fault is in an Edge Function;
4. deploy a previous immutable worker image SHA if the fault is in the worker;
5. do not blindly reverse applied database migrations after data has been written; use a reviewed forward-fix migration unless a rollback is proven safe;
6. keep raw verification evidence for post-incident analysis unless retention/legal policy requires otherwise.

## 10. Security rules

Never expose or commit:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FLASH_INGEST_TOKEN`
- `TELEGRAM_API_HASH`
- `TELEGRAM_SESSION`

The public website/browser must never receive the service-role key, Telegram session, or flash ingest token.

The production worker should receive only the secrets it actually needs.
