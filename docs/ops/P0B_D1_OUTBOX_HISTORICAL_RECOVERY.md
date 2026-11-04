# P0 #4–6: Transactional B2/D1 Parity and Historical Archive Recovery

Private original-source archival only. No changes to paid-output authorization, public original distribution or PREDGE.

## D1-before-B2 transactional outbox
- Migration: workers/control-plane/migrations/0118_p0b_archive_outbox.sql.
- Save one AES-256-GCM sealed up-to-100-candidate batch to private D1 as PENDING_ARCHIVE before B2 S3 PUT. SHA-256 of the sorted source+candidate identities defines stable batch membership. The source plaintext is not stored in D1.
- B2 S3 PUT, independent GET, SHA256 and decrypt/manifest restoration precede db.batch(). The atomic batch inserts B2 bundle journal, candidate queue rows and updates the outbox to ARCHIVED with actual S3 ETag when present plus SHA256 content identity.
- The existing Worker ten-minute cron CAS-leases pending ciphertext outboxes and retries B2 under existing provider quota/circuit. Failed/crashed lease retains ciphertext for redrive; no false ACK.
- Admin-only P0B status includes outbox pending and explicit mismatches: archived without B2 pointer, missing exact bundle journal, and wrong candidate-item count. Zero mismatches and no pending outboxes are required for overall journal parity.
- One B2 bundle may hold 100 D1 candidate rows: compare objects to bundle ledger and independently compare item count to D1 item rows. Never require objects == items.

## D1 export and ACK (HTTP 400/7500/503)
- Archive-only export uses existing stable keyset by (first_ingested_at, record_id), 25 protected rows per Worker request, with no OFFSET or 72-hour article freshness condition.
- Existing atomic UPDATE/RETURNING accepts up to 48 IDs = 99 SQL bound parameters. On provider 400/7500 or Worker 503, retry same immutable keyset cursor with smaller pages or authenticated Worker fallback. No ACK before B2 object readback.
- New 10-minute historical path additionally invokes Zod 4.6.6 to validate original schema, dates, hashes, category, five-part structure and commercial-rights flags before B2 write.
- Offline regression covers 1200 retained historical rows over six 200-row cycles, 25-row keyset pagination and 48-row ACK chunks; this is not a remote production result.

## Dedicated every-ten-minute historical drain
- Workflow: .github/workflows/phase2h-historical-recovery-10m.yml, main-only cron */10 * * * *; strict GitHub and production environment admission.
- At most 200 D1 rows where b2_object_sha256 IS NULL per admitted run, prioritizing oldest first_ingested_at. Both fresh and older-than-72h retained originals are eligible for archive, but not for the 72h live-news public feed.
- Shares single archive concurrency group, D1 protected source/PREDGE headroom and B2 atomic PUT/GET account ticketing with existing six-hour writer. No provider quota bypass.
- Captures before and after canonical D1 counts for total pending and pending older than 72h. Any remaining pending rows are explicitly reported; no zero-backlog acceptance until real provider census proves zero.

## Real production acceptance (NOT YET MET)
1. Green CI for PR #3549; merge and protected main Worker deploy applying migration 0118. Reconcile changes from independent open PR #3547 first if it merges before this one.
2. Confirm outbox mismatches all zero and pending all zero, bundle journal parity true; independently verify actual B2 remote GET/hash.
3. Confirm real D1 before/after report shows historical and total pending 0. The user-supplied 6054 pending is an acceptance target, not a fresh measured fact.
4. Verify 1000+ real cumulative exports without HTTP 400/503/provider 7500, not only mock tests. Quota hold, network fail and source expiration must never be fabricated as a success.

All B2 quota and Cloudflare D1 limits remain enforced. PR and mocked tests alone cannot establish real-money or production archival completion.