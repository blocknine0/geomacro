# Geomacro owner project checkpoint — 2026-10-22
This is a durable, credential-free project-status note for subsequent tasks.
It is **not** permission to delete a Supabase project or spend funds.

## Locked product scope
- Geomacro: geopolitical, macro/FX and critical-minerals/rare-earth intelligence.
- One reusable on-demand structured intelligence engine; primary `POST /api/v1/intelligence/query`, category-specific reuse, 195-country coverage target.
- Commercial outputs are derived structured intelligence, **not raw upstream content**. Signed provenance, faithful evidence boundaries and legally necessary source-rights checks remain required.
- Free-tier infrastructure until revenue; production must not depend on a laptop running 24/7. Cloudflare D1/B2/GitHub Actions are preferred; no new paid dependencies.
- Unified x402 locked capability prices in USDC: `gri_read` 0.005 cached / 0.01 change, country digest 0.02, corridor digest 0.05, country profile 0.03, corridor profile 0.08, intelligence query 0.05 focused / 0.10 standard / 0.15 complex.
- Predge has a 90-day free evaluation relationship; do not claim full partner cutover or terminate legacy partner dependencies without acceptance. Do not duplicate raw-data distribution.

## Old Supabase identity / preservation invariants
- Old project **`ldpwajisioljyjtojvfx`** (not the separate staging project); last checked `ACTIVE_HEALTHY` on 2026-10-22. Treat as read-only preservation source for the exit effort.
- Source PostgreSQL **logical archive uploaded to private B2**, SSE-AES256, full independent B2 SHA256 readback and independent disposable PostgreSQL 17 physical restore **verified**.
  - Database archive: GitHub Actions [39590890260](https://github.com/blocknine0/geomacro/actions/runs/39590890260).
  - Independent restore: GitHub Actions [39598466442](https://github.com/blocknine0/geomacro/actions/runs/39598466442).
  - Matched restored baseline: 33,138 live structured events, 21,178 GRO records, 23,648 Storage **metadata** records and 5 payment events.
  - Subsequent protected script also does exact content comparison of nine historical commerce tables, separate from customer-runtime cutover.
- Both original private Storage buckets, 23,648 source objects and 57,459,939 metadata bytes, are now **backed up to private B2** in four manifest-bound bundles and all original-byte hashes have been independently restored and verified.
  - Full all-shard verification: [39721967867](https://github.com/blocknine0/geomacro/actions/runs/39721967867).
  - Independent origin-free canaries in both buckets: [39727346450](https://github.com/blocknine0/geomacro/actions/runs/39727346450).
  - Immutable original-bundle index fingerprint prefix: `5eff883cadf814cd`.
  - The source objects are **still physically present** on Supabase: preservation is not production read-path cutover.
- Latest protected old-primary read-only census: [39742634406](https://github.com/blocknine0/geomacro/actions/runs/39742634406). It found **0 Storage objects modified since archive baseline**, 23,461 referenced historical fragment objects and 4 referenced avatar objects; 5 agent payment rows, 5 commercial payment events, 4 entitlement grants, 4 credit accounts.
- The old Supabase project's database and Storage **must not be deleted or paused** until source-independent live reads, Auth/customer access, payment-credit-entitlement continuation, all ten deployed Edge Function and secret/caller cutovers, Predge acceptance and fresh final census have independently passed. Never delete raw Storage metadata with SQL: Supabase requires its Storage API for actual object deletions.

## Current unclosed blockers / evidence
1. **Historical-fragment read-path:** private B2 original restore helper and both-bucket canaries exist. Full live website/API consumers, fragment lookup and per-user authorization cutover are not independently accepted.
2. **Four tester avatars:** B2 source bytes preserved, but `src/lib/testnet-tester-avatar.server.ts` still uses legacy Supabase profile reads and Storage upload/download. Migrate profile ownership and authorized reads/writes before removing old bucket.
3. **Commercial customer state:** historical old DB is backed up, but real-time ledger/entitlement/customer read-write service cutover is not yet independently accepted; keep the settlement safety gates intact.
4. **Ten deployed Supabase Edge Functions:** actual deployed versions of all 10 were downloaded using the official Supabase CLI, archived to private B2 and independently full-body SHA256 readback verified. Protected clean-status backup run [39745873010](https://github.com/blocknine0/geomacro/actions/runs/39745873010) passed, with `verified_private_source_files=10`. Two deployed index sources had differed from GitHub main, so this live-source preservation matters. The GitHub-hosted ephemeral CLI workspace emitted a permission-limited temporary cleanup warning; the runner is destroyed after the job. **Edge Function runtime secrets and customer/Predge callers are still NOT cut over or accepted.**
5. **Predge preservation hold:** latest owner-preservation CI [39742634406](https://github.com/blocknine0/geomacro/actions/runs/39742634406) specifies `predge_legacy_continuity_owner_hold=true` and `predge_legacy_runtime_cutover_verified=false`. Preserve old project until independently verified partner cutover plus renewed owner sign-off.
6. **Web product deep health and signed hot snapshots:** full HTTP 200, current 3/3 hot snapshots and real payment acceptance are separate launch tasks; do not infer they became healthy from archive completion.
7. **Groq:** existing Groq API fallback implementation exists in the repo; do not equate code merge with verified complete global real-time coverage or use unverified LLM output as original evidence.

## Next execution order
1. Preserve and independently accept deployed Edge Function runtime **secrets, access policies, URL consumers and replacement responses**. Actual deployed source code has already been preserved and verified in private B2; no new paid API.
2. Add B2/D1-origin-free, authorization-preserving read routes for *real production consumers* of historical fragments and tester avatars; verify under a production-like signed request, no fallback to old Supabase.
3. Verify full live commerce customer/account/entitlement read/write reconciliation against backed-up ledger with no funds and no replay/double-charge.
4. Independently accept Predge partner continuity and all 10 Edge Function callers, secrets and expected responses.
5. Fresh exact source vs archive content reconciliation, all routes and owners approved. Only after a new explicit owner ACK may the old Supabase Storage API remove originals and the project eventually be deleted.

### Reporting contract
Every update must separate **implemented**, **CI-tested**, **production-accepted**, **blocked**, and **not attempted**. No secret strings, customer PII, raw source files or unverified deletion claims in GitHub Actions artifacts.
