# Predge pilot: preserve old Supabase until partner-specific cutover acceptance

Owner instruction, 22 October 2026: **keep any Predge-related workload that still depends on the original Supabase project running for now**. Do not disable, retire, delete, or rotate away its required routes, database tables, Storage objects, Edge Functions, credentials or partner entitlements as part of the non-Predge migration.

## Actual topology

- Original project: `ldpwajisioljyjtojvfx`. The project remains live. Deletion is not authorized.
- The authenticated 72-hour Predge research feed and the new Risk Gate use the **existing Cloudflare D1 control plane**, not an assertion that *every* Predge dependency has already left Supabase.
- Keep existing old-Supabase-dependent customer and historical endpoints untouched until production callers and contractual service boundaries have been inventoried and individually accepted on replacement infrastructure.
- Backup preservation (including independent database and original Storage-byte B2 restores) is **not** application cutover proof. Do not substitute archival copies for live customer reads without authentication, owner checks, replay/freshness handling and end-to-end acceptance.
- Keep the protected Predge research continuity and old Supabase read-only retirement-census workflows enabled. No new paid API, payment, or increased quota is implied.

## Strict cutover / eventual deletion rule

The old Supabase project must remain accessible while **any** relevant Predge or other legacy consumer depends on it. Required before even proposing retirement:

1. Inventory partner-bound tables, credentials, Edge Functions, Storage pointers and endpoints. Avoid assuming D1 migration of the research/Risk Gate routes covers all dependencies.
2. Prove exact protected replacement-read parity and no-loss replay/entitlements for every actual consumer, including old source bytes and non-Predge uses. Do not move credentials to public GitHub files.
3. Complete no-funds authenticated Predge pilot acceptance from the partner's actual integration, then explicitly confirm with the owner that all old-project dependencies may be retired.
4. Only after complete independent acceptance and explicit renewed owner authorization should a *separate, reviewed* deletion plan use Supabase's official Storage API. Never delete `storage.objects` directly with SQL, and never infer permission from successful B2 backup alone.

The read-only `legacy-nonpredge-retirement-readiness` report intentionally includes `predge_legacy_continuity_owner_hold: true` and `predge_legacy_runtime_cutover_verified: false`. These reflect the current owner restriction. It does not pause or change any Predge route.

Research pilot continuation is subject to its existing auth, 500/day D1 limit, and code-level 2027-01-17 expiry; preserving Supabase does not override those limitations.
