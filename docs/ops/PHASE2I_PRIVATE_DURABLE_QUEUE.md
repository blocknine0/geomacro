# Phase2I encrypted durable buffer: deployment and acceptance

The existing 8,000-candidate GitHub AES-GCM queue raised PHASE2I_BACKLOG_CAPACITY_NOT_DURABLE after restoring 7,969 originals and observing new ones. This is an explicit guard, not evidence of 128 MB OOM.

**Architecture:** source fetch -> 500-item source candidate chunks -> AES-GCM(gzip(JSON)) -> dedicated private Cloudflare R2 PUT and exact hash GET -> SQLite-backed Durable Object item index -> 10-minute lease -> existing provider-quota D1 staging -> verified original record IDs -> DO ACK. Crypto key stays on protected GitHub runner; no source URLs or raw titles enter public storage.

Provisioning before runtime switch:
1. Create a new PRIVATE R2 bucket named geomacro-private-osint-phase2i in the existing Cloudflare account. Configure lifecycle and resource quota alerts. Do not attach a public website bucket.
2. In GitHub production environment, add a dedicated secret GEOMACRO_PHASE2I_DURABLE_TOKEN of at least 32 random characters.
3. Merge vetted code, then run Deploy Phase2I Durable R2 DO on main. It configures the SQLite DO binding, R2 binding and secret, and verifies authenticated private health.
4. After successful deploy, set production environment variable GEOMACRO_PHASE2I_DURABLE_URL to https://geomacro-phase2i-durable-queue.daspallab202391.workers.dev/ (must include the final slash). Optionally set GEOMACRO_PHASE2I_DURABLE_ENABLED=true to enable auto-deploy.
5. Verify unskipped scheduled 15m and 20m jobs: 500-entry AES-GCM chunks, original-date retention, R2 independent full-readback, secure 10-minute lease recovery, provider D1 exact receipt ACK, zero duplicate admission and current pending + expired census.

The source tick imports still-eligible, unacknowledged legacy AEAD artifacts during cutover, so old pending originals are not abandoned. Once opted in, no 8,000-object transient snapshot is sealed or uploaded. B2 archival, website publisher, commercial rights, payments and PREDGE are unchanged.

**Non-negotiable acceptance limitation:** Existing D1 provider approval remains 3–5 rows per permitted tick. At five new D1 rows every 15 minutes, 7,969 pending rows require approximately 16.6 days, beyond the original 72-hour clock. This implementation fixes buffer durability but cannot prove all 7,969 D1-ACKed before expiry without separate legitimately approved throughput. Expired items are counted explicitly instead of silently labeled drained.

Offline tests check 7,969 chunk roundtrip, idempotency, fail-closed R2 readback, and recovered lease ACK. Offline Node heap increment is not a live Cloudflare Worker RSS measurement: a less-than-60MB production memory claim requires instrumented live proof. Code merge alone is not successful production activation.