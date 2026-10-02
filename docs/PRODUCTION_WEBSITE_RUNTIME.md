# Geomacro Production Website Runtime

Status: production serving contract.

## Customer-facing authority

The public website must remain usable when Supabase is paused, quota-restricted or unavailable.

Primary serving path:

`Geomacro SSR/server functions -> private Backblaze B2 verified public snapshots -> browser UI`

Supabase is not a customer-facing production serving dependency. It remains available only for trusted ingestion, recovery and explicitly operator-enabled maintenance/fallback work.

## Required hosted server secrets

The Lovable/SSR production runtime must provide these **server-only** variables:

- `B2_KEY_ID`
- `B2_APPLICATION_KEY`
- `B2_S3_ENDPOINT=https://s3.us-east-005.backblazeb2.com` (optional because the application pins this endpoint, but if set it must match exactly)
- `GEOMACRO_SUPABASE_RUNTIME_MODE=standby`

Never expose B2 credentials through `VITE_*`, browser JavaScript, public JSON, logs or client-side network calls.

GitHub Actions secrets do not automatically configure Lovable runtime secrets. The hosted runtime must be configured separately.

## Required production surfaces

The following customer-facing routes are release-critical:

- `/`
- `/intelligence`
- `/global-risk`
- `/ask-geomacro`
- `/data-api`
- `/institutional`
- `/contact`
- `/api/health`
- `/api/public-production-health`

`/api/public-production-health` is the canonical public serving smoke. It must return HTTP 200 only when the hosted runtime has B2 credentials and can read verified Intelligence and Risk snapshots. It reports no secret values.

## Failure behavior

- Never fall through from a public production read to Supabase automatically.
- Never substitute zero-risk, synthetic scores or invented history when a verified package is unavailable.
- Keep a bounded last-verified B2 continuity window and label stale-but-verified readings as last verified rather than live/current.
- Preserve the previous successfully rendered client state during a transient refresh failure.
- Fresh Ask Geomacro questions use ephemeral live retrieval; no live-query durable write is required.

## Continuous prevention

`Production Website Health` checks the live B2 production health, alignment contract and core pages every six hours. Product CI contains static regression guards that fail if the public Intelligence, Risk Indices or Ask Geomacro paths regain a Supabase serving dependency or a browser direct-Supabase URL.

Deployment remains two-stage: canonical GitHub `main` is mirrored to the Lovable-linked repository, then the owner explicitly publishes the synced revision. A successful Git mirror is not proof of a live deployment; the public build marker and health smoke must match the published canonical SHA.
