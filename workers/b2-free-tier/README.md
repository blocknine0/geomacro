# GeoMacro B2 Free-Tier Gateway

This Worker is a narrow S3-compatible gateway for GeoMacro-managed files in
the existing private `geomacro-private-archive` bucket. It uses D1 as the
object index and quota ledger. Browsers never receive B2 credentials or direct
B2 URLs.

## Guardrails in this implementation

- D1 reserves the upload row, bytes, and upload-request ticket in one SQLite
  trigger. The Worker then reserves the shared account-wide Class-A ticket
  before it can call `PutObject`.
- The hard D1-managed storage ceiling is 9,200,000,000 bytes. An upload is
  rejected unless the account-wide starting storage baseline has been verified.
- Upload requests are capped at 2,000 per UTC day. Class-A writes (uploads and
  exact-version deletes) are capped at 2,000 account-wide per UTC day. Class-B
  reads use the same existing D1 account governor (2,000 GET plus at most 40
  HEAD requests). Existing native authorization calls are capped at 40 per day;
  all listing calls remain disabled, so their Class-C list count is zero.
- The gateway calls `reserveB2AccountQuota` from the existing control-plane
  module before each origin GET, PUT, and DELETE. This shares the same atomic
  D1 ledger used by GeoMacro's existing Cloudflare edge readers; the local
  gateway counters are an additional per-gateway limit, not the account-wide
  source of truth.
- Backblaze class mapping: S3 `PutObject` and `DeleteObject` are Class A;
  `GetObject`/`HeadObject` are Class B; object listings and account/key
  administration are Class C. Uploads are not Class C. The request's 2,000
  upload policy is therefore enforced against Class A.
- These are GeoMacro-enforced daily ceilings, not Backblaze's free transaction
  allowance: Backblaze lists Class A/B/C as free for pay-as-you-go customers,
  while the first 2,500 daily free calls apply to Class D. GeoMacro caps its
  guarded Class B/C traffic at 2,080 operations/day (2,000 GET + 40 HEAD + 40
  native authorization), with all list operations disabled. Backblaze Caps &
  Alerts limit dollar spend; they are not request-count quotas.
- Public GETs check Cloudflare Cache API before D1 or B2. A verified origin
  response receives `Cache-Control: public, max-age=604800, immutable` and an
  ETag. Cache API is POP-local and may evict entries; a cache miss still uses a
  D1 Class-B reservation and one B2 GET.
- Objects use unique random names. D1 stores the exact B2 `x-amz-version-id`
  returned by `PutObject` as `b2_file_id`, so cleanup can issue an exact-version
  `DeleteObject` without listing.
- TTL cleanup runs daily and before uploads. At the 8.5 GB soft watermark, it
  evicts the oldest opted-in (`evictable=1`) ready object until it reaches the
  target or the bounded cleanup batch ends. Non-evictable files are retained.
- Any B2 provider storage, download, or transaction cap response blocks this
  Worker for the rest of the UTC day. Unknown PUT outcomes retain the pending
  D1 byte reservation instead of undercounting a possibly stored object.
- Authenticated `GET /v1/internal/objects?path=<exact-key>` supports known
  pre-existing keys without invoking any list API. A cold exact-key read imports
  its size, MIME type, SHA-256 and B2 version ID into `files` as
  `baseline_accounted=1`; those bytes are already included in the verified
  account baseline and are excluded from the managed-byte sum. The response is
  integrity-checked and pinned to that exact version in the Worker Cache API.
- Authenticated `PUT /v1/internal/objects?path=<exact-key>` updates a known
  mutable key through the gateway. A D1 pending row locks the key and reserves
  projected bytes plus one upload/Class-A ticket before `PutObject`. After B2
  returns a version ID, a D1 batch records the displaced version for exact
  deletion and moves the current pointer to the new version/hash. Internal
  read cache keys include the version ID, so a successful write bypasses any
  older cached version. An ambiguous B2 write retains the reservation and key
  lock until reconciled rather than risking an undercount.

## Important account-wide boundary

D1 can account only for objects and operations routed through this Worker or
explicitly added to its ledger. The baseline row must include the existing
account's total B2 bytes from the Backblaze console, including other buckets
and non-current versions. For an account-wide hard guarantee, every other B2
writer/reader must either be migrated to a shared quota/storage ledger or have
its credentials revoked. The existing GeoMacro B2 quota worker remains a
separate path until that migration and exact-head production acceptance are
completed. Do not describe the account as locked merely because this Worker
deploys successfully.

The 9.2 GB limit applies to the tracked baseline plus the `files` rows. B2
lifecycle processing is asynchronous, so old-version removal is not immediate.
Keep the hard gate at 9.2 GB and the verified baseline conservative.

### Existing object reader/writer cutover gate

The internal exact-key route is a migration primitive, not a complete
account-wide cutover by itself. Set `INTERNAL_GATEWAY_TOKEN` only on the
gateway and trusted server/Worker callers. Before routing a mutable legacy key
through it, run its writer with `B2_STORAGE_MODE=gateway`,
`B2_GATEWAY_URL`, and the separate `INTERNAL_GATEWAY_TOKEN`. The shared
`scripts/ops/b2-s3-client.mjs` then routes reads and writes through the gateway
with no direct-B2 fallback in gateway mode. The three public edge Workers and
server-side readers have the same explicit gateway mode. Without that mode,
the staged legacy route remains available for rollback. Do not switch a reader
until its writers are gateway-only, its exact keys are indexed, and versioned
edge-cache behavior is verified. Keep legacy credentials until all deployed
callers, operational workflows and rollback windows pass acceptance.

## D1 setup

Use the existing `geomacro-control-plane` D1 database; do not create a second
database. Review `migrations/0001_b2_free_tier_gateway.sql`, then apply it with
the existing D1 deployment process or Wrangler. `schema.sql` is the standalone
copy for review/import workflows.

Before allowing uploads, read the Backblaze account's current total stored
bytes in the Console, including every bucket and old version. Set that value as
the D1 baseline and mark it verified:

```sql
UPDATE b2_storage_baseline
SET account_bytes = <verified_account_bytes>,
    verified_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton = 1;
```

Never estimate the baseline from `files`; the table begins empty and does not
index pre-existing objects.

## Cloudflare Worker configuration

1. Set the real existing D1 ID in `wrangler.toml` and use the existing
   `geomacro-control-plane` binding.
2. Create a Backblaze application key restricted to the existing bucket.
   Grant `readFiles`, `writeFiles`, and `deleteFiles` only; do not grant
   `listFiles`, `listBuckets`, or `listAllBucketNames`. The gateway's D1-backed
   path allowlist admits only `geomacro-evidence/v1/`, `telegram/leads/`,
   `telegram/owner-exports/`, and the configured P0-B `spool/` path. Backblaze
   `namePrefix` is one literal prefix, so a single key cannot express these
   disjoint paths; the bucket restriction plus the gateway allowlist is the
   effective boundary. Never grant this key account-wide bucket access.
3. Store these as Worker secrets: `B2_KEY_ID`, `B2_APPLICATION_KEY`, and a
   high-entropy `UPLOAD_BEARER_TOKEN`. Also set a separate high-entropy
   `INTERNAL_GATEWAY_TOKEN` for trusted server-side exact-key reads and writes. Keep the
   endpoint, region, and bucket in Worker variables as shown in `wrangler.toml`.
4. Deploy the Worker, bind a Cloudflare hostname, and change frontend/API
   clients to read only `/v1/files/{id}`. Uploads use `PUT /v1/files`; cleanup
   uses authenticated `POST /v1/admin/cleanup`.
5. Do not expose upload bearer tokens to browsers. Send uploads through an
   authenticated server-side API. Public visibility is explicitly opted into
   with `x-geomacro-visibility: public`.

The one daily Worker Cron invokes TTL cleanup. If the account has no spare
Cloudflare Cron trigger, call the authenticated cleanup endpoint from an
existing scheduled control-plane job instead of adding another trigger.

## Backblaze Console setup

### Caps & Alerts

1. Open **B2 Cloud Storage → Caps & Alerts → Edit Caps**.
2. Clear **No Cap** for storage, downloads, and Class A, B, and C transaction
   spend caps. Configure the minimum accepted daily dollar cap, `$0.00`, for
   each category to block billed overage. If the UI rejects zero, leave the
   operation blocked and resolve the account's cap setting before production;
   do not select **No Cap**.
3. Add the available 75% and 100% cap alerts and save. Backblaze documents that
   these are spend caps; they do not replace the Worker's 2,000-call D1 limits
   or its 9.2 GB byte gate.
4. After saving, verify the cap values in the same page and wait for provider
   propagation before production writes.

### Bucket lifecycle

Backblaze buckets are versioned. Lifecycle settings affect stored older
versions and may run asynchronously. In **B2 Cloud Storage → Buckets →
`geomacro-private-archive` → Lifecycle Settings**, add a custom rule scoped to
`geomacro-evidence/v1/private/b2-managed/` that keeps only the latest version
and deletes hidden/non-current versions after one day. Do not apply this rule
to the whole archive bucket: GeoMacro's historical evidence outside this
prefix must remain intact. Confirm the saved prefix and rule in the console.

## Production lock checklist

- [ ] Apply the D1 schema to the existing control-plane database.
- [ ] Import the verified account-wide byte baseline from Backblaze Console;
      include all buckets and versions.
- [ ] Create a bucket- and prefix-restricted key with no list capabilities;
      set its secrets only on this Worker.
- [ ] Set/verify storage, download, and transaction spend caps and alerts in
      the Backblaze Console.
- [ ] Save and verify the prefix-scoped lifecycle rule.
- [ ] Route every frontend/public B2 file read through the Worker hostname;
      remove B2 URLs from browser bundles, HTML, API responses, and source maps.
- [ ] Search all GeoMacro workflows, Workers, scripts, and deployment secrets
      for other B2 credentials and direct B2 requests. Migrate them to the
      account-wide shared governor or revoke their credentials before claiming
      an account-wide lock.
- [ ] Migrate writers for every mutable legacy key; set their caller's
      `B2_STORAGE_MODE=gateway` and verify each write updates its D1 version
      pointer. Direct overwrites do not update that pointer.
- [ ] Confirm repeated mutable-key writes return a new version ID/hash and the
      next read uses a new version-specific cache key; test ambiguous write
      reconciliation before production rollout.
- [ ] Confirm the only gateway S3 methods are `PUT`, `GET`, and exact-version
      `DELETE`; verify no list, bucket, or key-management method exists.
- [ ] Verify the shared D1 ledger never exceeds 2,000 uploads/Class-A calls,
      2,000 Class-B GETs plus 40 HEADs, and 40 Class-C native authorization calls;
      listing operations remain disabled.
- [ ] Run a controlled upload, confirm the D1 `b2_file_id` equals B2's
      `x-amz-version-id`, fetch twice through one Cloudflare POP, and verify
      the second response is a cache hit with no new D1/B2 origin reservation.
- [ ] Test hard storage rejection at 9,200,000,001 projected bytes, daily
      quota rejection at request 2,001, provider-cap day lock, and D1 outage
      fail-closed behavior before enabling frontend traffic.
- [ ] Confirm the website no longer contains a direct B2 fallback.

## Verification commands

```sh
node --check workers/b2-free-tier/src/index.mjs
node --test workers/b2-free-tier/tests/*.test.mjs
```

Sources: [Backblaze Cloudflare private content](https://www.backblaze.com/docs/cloud-storage-deliver-private-backblaze-b2-content-through-cloudflare-cdn), [B2 transaction pricing](https://www.backblaze.com/cloud-storage/transaction-pricing), [B2 data caps](https://www.backblaze.com/docs/en/cloud-storage-data-caps-and-alerts), [B2 lifecycle rules](https://www.backblaze.com/docs/en/cloud-storage-lifecycle-rules).
