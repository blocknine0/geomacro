# GeoMacro P0 — adaptive D1 original ingestion and B2→private R2 recovery

## Root causes verified in the codebase

* Phase2I source-only historically took `min(providerRows,5)` even though the already-existing authenticated D1 raw endpoint accepts a bounded 50-entry `json_each(?)` multi-insert with one SQL bind parameter. This 5-row application guard was additionally tied to a **protected Free account quota reserve**, not merely SQLite single-primary write contention.
* P0B B2 Spool Manager already used signed SigV4, exact encrypted B2 PUT/GET verification, one alternate-address transport retry, and a 5-minute D1 circuit breaker. It used S3 HMAC signing keys, **not** an expiring upload bearer token.

## What is now coded

1. The quota planner may grant a single current burst of up to 100 originals *only* after a provider-observed snapshot, future source baseline protection, reserved historical B2/archive slots, emergency/partner PREDGE headroom, and a 10k-write safety buffer. Every later slot must independently re-prove capacity. NORMAL mode targets 50; BACKLOG mode targets 100 with at least 500 unacknowledged.
2. Existing raw source `/v1/internal/phase2h-raw-news` accepts 50 originals per D1 `json_each(?)` INSERT and exact D1 per-original readback. The client commits 100 as two serialized 50-row requests to keep 100-variable D1 SQL bounds. Immutable identity collisions are isolated and cannot falsely ACK unrelated originals.
3. B2 S3 request recovery uses a fresh SigV4 signature and separate globally governed B2 operation reservation on each of maximum four attempts: initial + three jittered delays bounded by 100/500/1500 milliseconds. HTTP 401/403/429 and signed redirects do not auto-retry. HTTPS fetch manages connection reuse in Cloudflare Workers; there is no S3 bearer-expiry refresh.
4. On a real B2 failure, when and only when a dedicated private R2 binding is enabled, candidate payloads are encrypted with AES-GCM and gzip-batched (up to 100) into private R2. Independent R2 GET, SHA256 and authenticated decryption are required before a private D1 row `PENDING_B2` can be recorded. No original text/URL is saved in this D1 index.
5. The existing 10-minute Worker cron atomically claims up to two pending R2 ciphertext batches, with 5-minute leases, re-reads the authenticated R2 object, and re-runs original B2 spool+GET+queue admission using the existing account-wide quota and circuit. Only a genuine B2-backed admission and D1 readback can transition to `B2_VERIFIED`. Failed or crashed leases remain recoverable; R2 ciphertext is not deleted during incomplete delivery.

## Private production provisioning

Use a **private** R2 bucket different from `GEOMACRO_PUBLIC_NEWS_R2_BUCKET` and any publicly-served website bucket. No bucket is created or billed by this PR. Set GitHub `production` environment variable `GEOMACRO_P0B_PRIVATE_R2_BUCKET` to the exact pre-existing bucket name. After offline CI passes, merge to `main` and run the existing protected `Deploy D1 Control Plane` workflow. It checks bucket existence and binds `P0B_PRIVATE_FALLBACK_R2` (only when configured), applies migration `0117_p0b_private_r2_fallback.sql`, and preserves B2 S3 credentials. The admin-only `/v1/internal/p0b/status` reports `r2_fallback_outbox.pending_b2` separately from `live_bundle_parity`.

## Acceptance — not yet claimed

* Unskipped GitHub Product, B2/P0A, D1, and source regression workflows must pass.
* Controlled real remote B2 canary must produce 26/26 HTTP 200/201 confirmations across three real sources and independent GET+hash proofs; otherwise degraded and pending.
* A measured 500+ D1 rows per minute without SQLite conflict/provider throttle is a separate requirement. **Cloudflare D1 Free writes 100,000 physical rows/day**, whereas sustained 500 logical originals/minute alone would be 720,000/day before D1 write amplification. This acceptance is structurally impossible on that Free daily limit; neither raising an env variable nor batching changes physical row billing.
* A 100ms B2 response-time threshold is a latency SLO, not an outage detector. The implementation does not rewrite or discard an otherwise successful remote PUT after 100ms; R2 failover starts after failed/timeout network attempts to avoid false B2 or R2 duplicate success.
* With no private R2 bucket binding configured, B2 failures remain fail-closed under the existing global D1 circuit breaker. Do not label the fallback live until remote R2 PUT/GET and replay are observed.

Zero false acknowledgements, B2 archival truth and the existing commercial/Predge invariants take precedence over green checks.