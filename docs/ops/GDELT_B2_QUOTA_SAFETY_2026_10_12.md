# GDELT GAL B2 free-tier quota recovery

Status: code-level safety mitigation for manual legacy recovery; **not** live GDELT ingestion acceptance.

GDELT GAL is fetched from `storage.googleapis.com`. Those upstream requests do **not** consume Backblaze B2 transactions. In the legacy `sync-gdelt-gal-production.mjs` path, an accepted compressed fragment is stored as **one B2 PUT** and independently read back using **one B2 GET**. The source files are parsed/deduplicated before any B2 write, and no-new-file or zero-new-relevant-event cycles do not archive.

The `gdelt-gal-live-sync.yml` workflow is **manual-only**, additionally gated by explicit `permit_legacy_supabase_gal=true` and an independently normal Supabase free-tier write budget. Frozen Supabase means **no recovery run**; the B2 quota guard never overrides this freeze.

## Shared B2 cap fix

The legacy GDELT B2 writer previously omitted `B2_ACCOUNT_QUOTA_REQUIRED` and could therefore make ungoverned B2 calls. The production recovery workflow now resolves the same main-owned `geomacro-control-plane` D1 database, checks the same account-wide daily counters before upstream work, and sets `B2_ACCOUNT_QUOTA_WORKFLOW_ID=gdelt_gal_recovery` and a four-request local budget. Both the workflow wrapper and direct synchronizer refuse missing/invalid D1 admission. Actual B2 network requests use the existing canonical `createB2Client()`, which reserves atomic D1 quota tickets on each PUT, GET, retry and native fallback. The read-only preflight is advisory; concurrent jobs can consume headroom after it, in which case the next atomic reservation safely fails closed.

This preserves source timestamps, current freshness thresholds, batch deduplication, B2 full hash readback, existing manifest authorization, non-commercial defaults, and source rights. It adds no source activation, Supabase write authorization, account spending, real-money settlement or destructive archive cleanup.

## Other sources and transaction exposure

- Telegram's authorized producer uses individual B2 PUT+GET pairs **per accepted new post**; at high traffic this can dominate daily Class-B usage. No publisher activation is implied; batches need a separately validated queue/protocol migration.
- Governed EIA/NOAA statistical imports already use gzip fragments with verified readbacks; PR #2082 proposes an eligible multi-source bundle plus shared limiter.
- Public Intelligence, Global Risk and Risk Indices B2 fallback readers can repeat cross-instance Class-B reads when verified Cloudflare hot-edge cache misses; keep D1 hot serving and account-wide enforcement authoritative.
- Legacy archive/restore/cleanup and country-GRO verification tools perform B2 GET/PUT; execute only on demand with a bounded quota plan, never on every new source heartbeat.
- Open live source mesh (e.g. ReliefWeb/NASA FIRMS), when its legacy writer is enabled, uses Supabase storage rather than B2 for that path; its Supabase quota must be accounted separately.

To prove this fix after PR review, run the new deterministic tests first, then **only when Supabase is unfrozen and a manual recovery has been authorized**, capture actual B2 request usage, remote D1 quota ledger receipts, B2 full-body readback and manifest/cursor verification. Never report runtime success from CI or a manual permission gate alone.
