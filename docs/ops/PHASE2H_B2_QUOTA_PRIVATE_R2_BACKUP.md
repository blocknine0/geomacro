# GeoMacro Phase2H private R2 backup for Backblaze B2 quota and availability

## Source of urgency

Real production Step3 run #42867331554 applied and independently verified
migrations 0204, 0211, 0212, 0213. The final acceptance is still held by
STEP3_PRODUCTION_B2_ACKNOWLEDGED_ORIGINAL_UNAVAILABLE. Neither successful
Shadow B2 seeds nor a private R2 backup can be mislabelled as a live original
B2 acknowledgement, complete inventory or authorization to remove Canary HOLD.

## B2 independent continuity backup

Existing authenticated Phase2H canonical D1-only original export -> existing
private Cloudflare R2 recovery bucket -> AES-256-GCM compressed bundle of
the original record set -> physical provider R2 full-body GET -> AEAD decrypt
and row equality -> independent HMAC-SHA256 cursor GET/readback.

No B2 API or ListObjects calls, no new D1 SQL writes, no B2 fee, no paid
delivery or automatic Worker traffic. Per-object raw and encrypted body are
strictly bounded. No original publisher headlines or raw JSON are printed.

Existing protected workflow path:
.github/workflows/phase2h-private-r2-b2-quota-backup.yml

- Scheduled hourly at minute 43 UTC, or single owner-approved workflow_dispatch
  with exact approval BACKUP_PHASE2H_PRIVATE_R2_NO_B2_OR_FUNDS.
- Main-only protected environment, read-only authentic GitHub main SHA
  comparison before each write, and production private R2 provider-domain
  exposure audit before any private backup.
- Reuse existing recovery AES-256 key, private bucket, authenticated internal
  Worker original-export credential and scoped Cloudflare API. Key material is
  HKDF domain-separated from D1 checkpoint recovery. Preserve key history
  for durable restore after rotation.
- At most 25 fully authenticated Phase2H originals and 500,000 bytes of
  plaintext per hour. This is bounded incremental recovery, NOT an assurance
  all historical originals are copied or adequate to keep up with intake.
- Immutable, calendar-addressable encrypted hourly keys under
  geomacro/private/phase2h-b2-quota-backup/v1/YYYY/MM/DD/HH.json.enc,
  plus one HMAC-bound R2 keyset cursor. Restore uses exact known calendar
  hours; no ListObjects dependency.
- On rerun, an existing hourly object is independently decrypted and checked.
  A divergent record never overwrites it. The prior cursor is verified
  against the last encrypted object before any new write or keyset advance.
- A crash between original object PUT and cursor commit leaves an object
  discoverable from its hour; the next run must not fabricate progress.
- A metadata-only GitHub artifact (7-day retention) records provider outcome,
  object hash and count. The backup object lives in private R2 independently
  of GitHub artifact retention.
- The backup does NOT provide B2 archival ACK, B2 bucket orphan-free proof,
  source rights, HMAC-signed certified Risk Indices or Canary release PASS.
- Cloudflare R2 account-wide operations/storage are shared across GeoMacro.
  This bounded backup does not prove remaining free headroom or a zero bill.
  Increase its throughput only after independent monthly provider utilization
  verification; do not confuse B2 quota with R2 quotas.
- Genuine disaster recovery requires a separately protected, owner-reviewed
  restore action with exact D1 target, fresh backup and readback checks.
  The AES-GCM decryption function is available in
  scripts/lib/phase2h-b2-r2-backup.mjs. No raw source auto-restore to D1.

## What still gates removal of canonical Canary HOLD

1. Real independent production B2 original, exact D1 B2 ACK and B2 readback.
   The previous Step3 final proof was HOLD, despite all four migrations PASS.
2. Genuine exact-current-main signed Step3 physical production PASS.
3. Historical B2 orphan-free physical inventory reconciliation. D1-indexed
   GET proves known items only; the B2 no-ListObjects policy stays in place.
4. Immutable zero-traffic candidate ID, protected 0/1/5/25/50/100 live
   promotion and SLO/rollback evidence for Hot50 three categories.
5. Complete post-promotion UTC-day Cloudflare Paid quota and independent
   provider evidence, signed previous promotion and read-only HOLD review.
6. Only a separate reviewed acceptance PR with all PASS proofs can delete
   config/d1-hotspot-v2-canary.hold. No synthetic PASS, disabled safety
   checks, PayPal/commercial activation or source-rights workaround.

Predge research feed and all payment restrictions remain unchanged.
