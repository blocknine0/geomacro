# GeoMacro unified ingestion service

Run with `uvicorn ingestor:app --host 0.0.0.0 --port 10000` from this directory.
The service polls the three Google News RSS topics and every standard feed
configured in `GEOMACRO_RSS_FEEDS_JSON`, accepts authenticated unverified OSINT
records at `POST /v1/osint`, and sends at most 100 normalized records per D1
transaction through the authenticated Control Plane route.

Required environment:

- `GEOMACRO_INGEST_WORKER_URL`: Cloudflare Control Plane origin.
- `GEOMACRO_INGEST_WORKER_TOKEN`: `CONTROL_PLANE_TOKEN` for that Worker.
- `GEOMACRO_RAW_INGEST_TOKEN`: distinct bearer secret for raw OSINT intake.
- `GEOMACRO_RSS_FEEDS_JSON`: optional override; by default the service uses the 31-feed governed registry exported from the existing RSS worker.
- `B2_S3_ENDPOINT`, `B2_REGION`, `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`.
- Optional `POLL_SECONDS` (900 second default, bounded to 60–3600).

The process never lists B2 objects. It exports a bounded D1 batch, writes one
gzip NDJSON archive object using a deterministic UTC-hour key, then records the
object hash and pointer in D1. If any step fails, affected records remain
pending and are retried in a later hour. Public consumers query `/api/v1/feed`
on the Cloudflare Worker; no public B2 URL is returned.

Source timestamps without a publisher timestamp are held out. Country and
risk tags use deterministic title/summary rules. Sentiment remains `null`
until a supported scorer exists. Google News headlines are tagged at 0.55 and
are not treated as independently verified facts.

## Render Free liveness

The Render blueprint uses the minimal public `/healthz` endpoint for its
health check. After provisioning the service, configure the Control Plane
Worker variable `GEOMACRO_UNIFIED_INGESTOR_HEALTH_URL` to the exact Render URL
ending in `/healthz`. Its existing one-minute Cron Trigger then makes one
bounded GET every ten minutes, keeping an otherwise-idle Free web service
awake without D1, queue or B2 operations. The Worker ignores malformed or
non-Render URLs and reports failed pings without logging the URL or response
body. Leave the variable unset until the Render URL is known.

This keepalive does not increase Render's monthly free instance-hour pool or
prevent workspace-wide suspension if the pool is exhausted. Monitor usage in
Render before treating the service as continuously available. The service
also remains subject to Render's free-service restarts and outbound-traffic
limits.
