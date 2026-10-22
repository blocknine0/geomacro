# Owner decision · 22 October 2026: retain old Supabase

**Binding current operational decision:** Keep existing Supabase project `ldpwajisioljyjtojvfx` active. **Do not delete the project.** Do not empty either Storage bucket or remove existing user credentials merely because independent B2 backups exist. Older runbooks proposing retirement are historical plans, not current authorization to delete.

## What is complete

- Legacy full PostgreSQL logical backup in private Backblaze B2, full SHA256 readback and independent PostgreSQL 17 restore: [production acceptance #39598466442](https://github.com/blocknine0/geomacro/actions/runs/39598466442).
- Both old private Storage buckets, 23,648 file bytes records / 57,459,939 source metadata bytes, original content preserved in four private B2 bundles with exact whole-body/per-file verification: [acceptance #39651599672](https://github.com/blocknine0/geomacro/actions/runs/39651599672).
- Actual deployed source bodies of ten Supabase Edge Functions independently B2-readback verified: [acceptance #39745873010](https://github.com/blocknine0/geomacro/actions/runs/39745873010).
- None of these restore receipts is authorization to delete source files, cancel credentials, or change live customer service.
- Old customer authentication, tester avatar path, and remaining Edge callers **may continue to use existing Supabase**. Independent D1 shadow snapshots and B2 cold reads are recovery safeguards, not automatic production switches.

## Permanent safe operating model

1. Production Geomacro intelligence and x402 continue using canonical Cloudflare Worker/D1/B2 design; avoid feeding large historical source data into Supabase.
2. Preserve all existing Supabase critical records/Storage while the project is retained. No project deletion or destructive migration tasks.
3. Keep confidential source files and payment/identity records private; do not put backup content or private customer rows in GitHub artifacts or public application.
4. Run `Retained Supabase Continuity (Owner Keep, No Deletion)` daily; it uses only a single read-only PostgreSQL SELECT and reports aggregate counts on the same project. Never writes to B2, Cloudflare, or Supabase.
5. Drift from the October 21 certified B2 restore is information for review and future incremental backup, **not a reason to erase newer Supabase rows**. The immutable snapshot is a recovery point, not continuously updated live replication.
6. Treat separate feature switches such as `GEOMACRO_LEGACY_B2_COLD_READ` and `GEOMACRO_TESTER_AVATAR_READ_BACKEND` as optional and default-OFF until independently accepted. Do not flip them merely to satisfy a cleanup deadline.
7. Any later decision to delete the retained project or bulk-remove Storage must be a **new explicit owner instruction** after separate data/recovery/caller acceptance.

## Evidence and limitations

Original private B2 backups are verified, but current future login/session/Edge secrets are not implied to be B2-restorable. An archived database is not a replacement for live PostgreSQL; 14-table D1 customer shadows are private recovery copies and not a live authentication provider. The external system status is `ACTIVE_HEALTHY` as last read through Supabase, but can change independently. The retention audit is not an uptime guarantee.

This supersedes the earlier *optional-supabase-free-after-safe-old-project-retirement.md* directive to delete the old project. Preserve historical references for provenance, but apply this newer owner decision operationally.
