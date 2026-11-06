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
- `B2_GATEWAY_URL` and `INTERNAL_GATEWAY_TOKEN`; the ingestor never holds B2 credentials.
- Optional `POLL_SECONDS` (900 second default, bounded to 60–3600).

The process never calls B2 directly or lists objects. It exports a bounded D1
batch, writes one gzip NDJSON archive object using a deterministic UTC-hour key
through the authenticated gateway, and asks the Control Plane to verify the
gateway's D1-indexed exact readback before acknowledging the pointer. The
gateway reserves storage and B2 request quota and updates D1 version metadata.
If any step fails, affected records remain pending and are retried in a later
hour. Public consumers query `/api/v1/feed` on the Cloudflare Worker; no public
B2 URL is returned.

Source timestamps without a publisher timestamp are held out. Country and
risk tags use deterministic title/summary rules. Sentiment remains `null`
until a supported scorer exists. Google News headlines are tagged at 0.55 and
are not treated as independently verified facts.
