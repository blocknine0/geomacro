# GeoMacro Phase 2H — three-day maximum news storage lock

Owner requirement: **original news may be stored for at most 72 hours**. Applies to *new* Phase 2H original-news records in **Geopolitics, Macro/FX and Critical Minerals**. No automatic changes to PREDGE, the independent historical-data repository/Supabase, monetary transaction records, audit evidence without original news, or unrelated B2 object prefixes.

## Precise clock and layers

- **Canonical D1:** the original first_ingested_at clock is immutable. Authenticated Phase 2H private raw queries deny rows once age >=72h, even if quota or a scheduled cleanup job is held. New raw rows with a stale ingestion timestamp are rejected. Expired rows are not B2 archived.
- **D1 proactive deletion:** bounded schedule every hour at UTC minute 21; provider-verified account critical OR independent Phase2H retention-cleanup admission required. A new index on (first_ingested_at,record_id) prevents unbounded expiry-table scans. The independent lane reserves the full projected source-intake budget through UTC reset, protected PREDGE/critical resources, 25 deletes per remaining hour and extra headroom. It is never a general D1, signing or paid permission. It deletes up to 25 Phase 2H original-news records whose first ingestion was >=60h ago and independently queries exact IDs afterward. A positive response never means all old rows are gone; a remaining-count is reported. When admission is denied or the workflow misses a slot, physical D1 deletion is **not guaranteed**. The 72h query gate remains active.
- **Private R2 HELD escrow:** the existing short-lived encrypted backup has a dedicated private-prefix lifecycle guard of <=48h and a max 1.5MB object. GitHub sealed artifacts have a two-day retention configuration. These are backup copies and require provider readback; they do not certify all news stored.
- **Private Backblaze B2 Phase 2H raw object prefix:** `geomacro-evidence/v1/private/phase2h-raw-news/`. Backblaze **bucket custom lifecycle** must enable `daysFromUploadingToHiding: 1` and `daysFromHidingToDeleting: 1` covering this prefix. Backblaze documents that 1+1 settings complete deletion within 72h of B2 upload. Source item first ingestion might precede B2 upload; enforce D1 TTL separately. Do not use only "keep prior versions 3 days"; the current version would remain forever.
- **B2 archive fail-closed:** the governed Phase 2H archiver now performs its own two quota-ticketed native read-only calls (authorization, bucket settings). If the scoped primary B2 key lacks listBuckets access, the lifecycle settings differ, or provider quota is held, **new Phase 2H B2 raw archiving is blocked**. No bucket rules are silently modified; new rights/keys are not assumed.
- **No other buckets:** changes deliberately exclude PREDGE, historical datasets, Supabase, payment evidence, other B2 prefixes, manual older third-party originals and existing unrelated workflows.

## Operator configuration that remains to be verified

In Backblaze B2 Console -> Buckets -> `geomacro-private-archive` -> Lifecycle Settings -> Use custom lifecycle rules, add prefix `geomacro-evidence/v1/private/phase2h-raw-news/`, hide after **1 day**, delete hidden files after **1 additional day**, and preserve existing rules for other prefixes. Confirm the **read-only lifecycle probe** has minimum `listBuckets` capability from a scoped production credential while preserving `readFiles`, `writeFiles` access used by existing archive. This requires operator approval in Backblaze if capability is absent; do not paste secrets into chat.

Set Cloudflare R2 private bucket lifecycle <=2d for `geomacro/private-osint-held/v1/` as previously specified. Those service rules may require subscription/account permission to configure; no automatic enrollment or new paid provider is authorized.

## Strict acceptance, and what is NOT proven by a merge

1. Verify protected main new-SHA CI + quota-admitted cleanup run and positive independent D1 exact deletion proof.
2. Verify B2 provider **real** lifecycle settings on the exact private raw news prefix; do not equate a green offline test with enabled provider policy.
3. Verify the provider's actual B2 hidden/deleted version inventory after 72h. A B2 lifecycle read is not proof older copies are already gone.
4. Report actual older-than-72h Phase 2H D1 rows, B2 objects and optional R2 mirrored objects, plus missing cleanup slots; never mark a retained copy deleted without proof.
5. No promise of hard physical deletion when Cloudflare daily D1 quota is exhausted, GitHub fails to schedule, Backblaze lifecycle is absent, legal holds apply or a different backup stores the same news. Keep a public/private read cutoff and explicit exception report, not silent positive status.

Backblaze official guidance: https://www.backblaze.com/docs/cloud-storage-configure-and-manage-lifecycle-rules and https://www.backblaze.com/docs/en/cloud-storage-lifecycle-rules

Scope is intentionally narrower than "erase all historical market/news information worldwide"; the user specifically protected PREDGE and the separately governed historical-data repo.

## 30 October launch follow-up

- The provider-verified critical=false, source_intake=true pacing state no longer automatically disables an otherwise separately budgeted Phase2H TTL deletion. The new free-tier admission is independently calculated by `plan-d1-bundled-work.mjs` and explicitly output only as `retention_cleanup=true` when the entire UTC day remainder can be reserved. D1 cleanup is still limited to 25 rows per admitted hourly run, and reports remaining overdue rows: it **does not guarantee** a full physical 72-hour purge if incoming rows exceed delete capacity.
- The B2 provider check is now *inside* `runPhase2hGovernedRawB2`, not just an upstream workflow step. It refuses ALL new raw-news B2 object PUTs unless the existing bucket is independently proven to have an **exact** private Phase2H prefix 1+1-day lifecycle. Bucket-wide rules are not acceptable evidence because they can delete PREDGE and other unrelated archives. The separate workflow preflight was removed to avoid duplicate B2 quota consumption.
- The D1 (first_ingested_at,record_id) retention index is deployed via the canonical control-plane migration path only. Never update PREDGE, historical Supabase or unrelated B2 bucket lifecycle rules.
- Production acceptance still requires actual D1 delete+readback counts, provider B2 exact lifecycle setting and existing-object deletion verification. No code-only PASS or guaranteed invoice-zero claim.
