# Official source-directory cutover: owner-only D1 shadow

This migration takes only the four verified legacy **source directory metadata**
families and copies them into an unserved **private Cloudflare D1 shadow**.
It DOES NOT migrate payment/auth, raw news, GROs, GRI scoring, all 139 public
tables, or Supabase managed Auth/Storage. It is additive and reversible,
cannot activate or license sources and leaves old Supabase data untouched.

Read-only Supabase SQL observed on 2026-10-20:
- Government country directory: 195 entries
- Statistics-office directory: 194 entries; direct SQL anti-join identified
  the missing ISO2 **VA** (Holy See/Vatican City); do not invent a statistical bureau
- Monetary authorities: 195 entries
- Critical-minerals directory: 195 entries
- Combined baseline: **779** records, including verification state and source
  URL/notes kept PRIVATE inside D1, not returned by public/partner endpoints.

The path is `scripts/ops/migrate-supabase-official-source-directories-d1-shadow.mjs`,
with committed D1 migration `0021_legacy_official_source_directory_shadow.sql`.

### Safety properties

- Require owner-protected production environment ACK. The first reviewed change to the dedicated workflow on main triggers one bounded protected one-shot import; workflow_dispatch remains available for explicit retries.
- Strictly pinned primary Supabase project, a single REPEATABLE READ READ ONLY
  transaction, no data writes or deletes in Supabase.
- No upstream original article bytes; source directory rows are bounded,
  checked for duplicates, ISO2 identity and disallowed credential-like columns.
- Per-record deterministic canonical SHA256 and aggregate manifest SHA256.
- Idempotent private D1 upsert into `legacy_official_source_directory_shadow`
  ONLY. Not usable by live collectors without separate reviewed code.
- Full independent readback of every row (JSON bytes/hash and cardinality),
  category-by-category. No silent success after partial D1 writes.
- Outputs counts and hash only. No source URL, notes, token, DSN, SQL body or
  article content in logs/artifacts. No B2 operations, x402 or settlement.
- Failure is closed. A missing owner secret or invalid DSN does not produce
  a green source migration claim.

### Owner operation

The D1 schema is deployed. Merging the reviewed one-shot trigger
`.github/workflows/supabase-source-directory-d1-shadow.yml` into `main`
initiates the protected migration automatically once, provided the existing
GitHub protected production `SUPABASE_DB_URL`,
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are present.
A future explicit `workflow_dispatch` remains available for safe retry
if the one-shot run has no secret or quota. No private data or secret is a
workflow input, and unrelated commits do not trigger another import.

Success receipt must report schema
`geomacro.legacy-source-directory-d1-shadow-acceptance.v1`,
`d1_exact_hash_and_cardinality_readback=true`,
`strict_supabase_read_only=true`, `sources_activated=false`, and
counts `195/194/195/195` (or 195 statistics after a genuinely verified
directory entry is independently established).

**Remaining:** Convert source selectors to use this verified private catalog,
compare results with actual original-source probes, and only then retire the
old DB directory reads. Do not assert end-to-end 195-country current news,
fresh GRO, commercial licenses, or full Supabase shutdown from source
directory metadata alone.

### Protected runner PostgreSQL transport fallback

The first protected migration attempts failed **before any D1 write** at
`SUPABASE_READ_ONLY_PSQL`. To avoid creating a new database or copying
credentials into chat, the importer still requires a correctly pinned
authoritative PostgreSQL DSN, and first attempts an isolated PostgreSQL
REPEATABLE READ READ ONLY snapshot. If that network/TLS path fails, it can
fall back to **GET-only** PostgREST against the single fixed original
`ldpwajisioljyjtojvfx` domain with existing protected service-role
credentials. It performs **two full 779-row source directory reads** and
requires byte-identical aggregate manifest digests before writing D1.
The fallback does not read any other table, store credentials, change
rights, or imply a snapshot transaction across HTTP requests.
The only audit output is source read transport, counts, SHA256 and D1
cardinality/hash acceptance. Protected role keys are never printed.
If neither transport succeeds, the import remains blocked.
