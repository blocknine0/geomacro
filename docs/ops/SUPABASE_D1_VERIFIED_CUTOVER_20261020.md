# Supabase -> Cloudflare D1 / B2 crosscheck: primary project
Verified on 2026-10-20 using live Supabase management/SQL read-only inspection and canonical GitHub main.

**NON-DESTRUCTIVE.** This is a timestamped read-only observation and migration acceptance contract, not evidence a migration has completed. Never interpret Supabase's ACTIVE_HEALTHY status as proof it is required in the live website data path. Never delete, truncate, pause, overwrite or regenerate production records based on this report.

## Live inventory independently checked

Primary authoritative Supabase project: `ldpwajisioljyjtojvfx`, status `ACTIVE_HEALTHY`.
Separate staging project `hencqxkmmcgnothotqpq` was `INACTIVE`.
Production primary has 174 physical tables:
- 139 `public` application tables
- 27 `auth` Supabase-managed tables
- 8 `storage` Supabase-managed tables
- 10 deployed Edge Functions still reported `ACTIVE`. They may not all receive active traffic.
- `pg_cron`, `pg_net` and `pgmq` were not installed in this database query.

### Data requiring preservation, not blind copy or deletion

| Legacy table/family | Reported rows | Cutover strategy | Current admission |
|---|---:|---|---|
| `geomacro_risk_objects` | 21,178 | Preserve signed object identity, original evidence provenance, exact canonical object hashes, signing-key history in verified B2; only current genuine verified commercial GRO to D1 `country_gro_verified_hot` | **0 unexpired** as of 20 Oct; do not relabel historical as current |
| `live_external_observations` | 46,163 estimated | Preserve independently restorable private historical evidence, rights and raw references in B2; build own D1 derived hot projection only from verified use permissions | Never direct raw data to customers |
| `live_structured_events` | 33,124 estimated | Old structured history needs schema/version/rights and native time preservation; independent from newly derived 72h D1 journal | Latest old DB observations 10 Oct |
| `live_raw_source_snapshots` | 30,777 estimated | Archive object bytes and hashes to B2, then attest successful restore; do not replace data with snippets | Not public/paid |
| `storage.objects` | 23,648 estimated | Verify **each** raw object archive and exact hash/restore before any per-object legacy cleanup; never SQL DELETE `storage.objects` | No removal authorized |
| `live_source_certification_queue` | 11,676 estimated | Preserve source rights/reviewer hashes and unresolved candidates. Do not upgrade `CERTIFIED` to actual fresh source | 3,427 rows `CERTIFIED` status; not 3,427 source endpoints guaranteed |
| `live_country_primary_source_directory` | 195 | Canonical ISO2->ISO3 mapping; source URL/rights/verification state remains explicit in D1 verified directory, not unconditional activation | Source directory only |
| `live_country_statistics_source_directory` | **194** | The single missing ISO2 code, confirmed by a direct SQL anti-join against the 195-row government directory, is **VA (Holy See/Vatican City)**. Record a source-directory exception or genuinely verified official statistics source; do not fabricate a central statistics office | **194 present, VA absent**, no inference |
| `live_country_monetary_authority_directory` | 195 | Preserve original authority/verification state; merge in D1 country provider catalog with no invented freshness | Source directory only |
| `live_country_critical_mineral_source_directory` | 195 | Preserve national original source/verification state; match mineral ontology by region and market | Source directory only |
| `commercial_api_credentials` | 11 | Owner-controlled rotation, key-id and hash reconciliation in D1 auth; **never export plaintext tokens, rehash a different token, or silently reenable revoked key** | 1 enabled/unrevoked/unexpired row observed |
| `commercial_payment_events` | 5 | Immutable, exact cross-ledger idempotency, asset/network/environment/revenue reconciliation before routing any real payment | All 5 were settled **testnet nonrevenue** |
| `coinbase_x402_deliveries`, `commercial_entitlement_grants`, `commercial_api_credential_lifecycle_events`, `agent_commerce_deliveries` | Present | No automatic paid cutover before exact replay, lost-entitlement and double-settlement tests | Migration **not accepted** |
| `auth.users` | 0 (estimated) | Do not imply testnet developer login/embedded wallet SIWE is absent; require user/session/nonce identity mapping | Migration **not accepted** |

The project also has GRI snapshots/contributions, source-correlation, 195-country coverage targets, private archives, API rate limiting, audit logs and testnet/agent states. The categories above are NOT the entirety of 139 public tables; the code-generated full file/workflow audit covers all reachable reference sites and the live database's `information_schema` must be saved in an owner-private complete SQL manifest before final shutdown.

## Crosscheck of *actual* old data timing

- The newest `geomacro_risk_objects.generated_at` was 2026-10-09 12:56:35 UTC. Current unexpired count **zero**.
- The historical `live_structured_events.last_observed_at` was 2026-10-10 (geopolitics and macro) and 2026-10-10 (critical minerals).
- `live_external_observations` latest `published_at` differs by domain and may be substantially older than `ingested_at`. Never substitute ingestion time for native event time.
- All 5 old commercial payment events are `environment=testnet`, `revenue_classification=testnet_non_revenue`, `commercial_revenue=false`.
- Total signed GRO count or a 195-country source directory does NOT establish current verified commercial GRO availability.

### Further read-only archive and entitlement counters

Measured at the same audit date:

- 41,487 of 46,163 `live_external_observations` rows hold non-null `archive_bundle_key` **and** `archive_bundle_sha256`.
- 29,934 of 30,777 `live_raw_source_snapshots` rows hold these two archive reference fields.
- 9,324 `geomacro_risk_objects` carry direct archive key/hash; 8,695 carry bundle key/hash. These populations may overlap. Do not add them together.
- `live_structured_events` has 61 rows marked `commercial_eligibility_status=VERIFIED`, **not** 61 newly eligible news releases and not a current signed GRO.
- 4 `commercial_entitlement_grants`, 3 `coinbase_x402_deliveries`, 3 commercial API credential lifecycle events, and 8 agent-commerce delivery rows require separate immutable entitlement/replay integrity verification.
- 23 legacy `live_source_registry` rows, 9 rows simultaneously `enabled` and `derivative_intelligence_allowed`.

**Non-null archive references do not prove Backblaze bytes still exist, pass SHA-256, restore correctly, or have redistribution rights.** No original rows or secrets were exported or deleted by this read-only audit.

### 2026-10-20 acceptance update

The **four official source-directory metadata families** have now been copied
without changing old source records to private Cloudflare D1 and independently
SHA256/readback verified:
[import #39459307233](https://github.com/blocknine0/geomacro/actions/runs/39459307233)
and [private Worker acceptance #39460591204](https://github.com/blocknine0/geomacro/actions/runs/39460591204).
A total of **779** row copies were verified (195/194/195/195, missing
statistics VA). Internal-only source directory read API is authenticated,
hash-checked, and cannot grant licensing or source activation.
This narrowly improves the source catalog row; **it does not imply the
other 135 public application tables or all Auth/Storage objects are copied**.
Authoritative database remains online pending lossless further migrations.

## What is already Supabase-free

- Public 72h Geomacro-derived news journal via Cloudflare D1, same IDs and structured projection for website and free research. 15-minute original-release delay and source rights restrictions remain.
- Predge Risk Gate request ingress and separate readiness endpoint through D1 Worker; fail closed if partner secret or genuine GRO is missing.
- Owner-only private signed country GRO -> validated B2 exact readback -> D1 hot store, in PR #2557; **publisher existence is not published current data**.
- Core D1 security budget, quotas, provenance and no-funds diagnostics.

## What still requires conversion or verified retirement

1. **Customer commerce and credentials**: `src/lib/commercial-access.server.ts`, `src/lib/coinbase-x402.server.ts`, credential lifecycle, refunds, replay and ledger. A D1/DO substitute must preserve the original idempotency keys and grant entitlements. Do not silently use a fresh account.
2. **Agent and legacy product routes**: `src/lib/agent-query-response.server.ts`, old external modules, tests and A2A/demo/testnet paths. Use structured D1 continuity only where contract/verified native observation is compatible.
3. **GRI/Indices and signed publisher**: historic `scripts/lib/gri-db-client.mjs`, `scripts/ops/publish-country-gro-hot-bundle.ts` query Supabase. Migrating the read path is NOT enough to claim scores will refresh. Requires genuinely current scored certified inputs or truthful no-score mode.
4. **Supabase-deployed functions**: `live-gdelt-ingest`, `live-structure-intelligence`, `live-flash-ingest`, `live-flash-corroborate`, `public-risk-indices`, `public-early-warning`, `gro-archive-read`, `gro-archive-maintain`, `raw-snapshot-read`, `archive-verify-read`. 10 deployed in the old project; use D1/Worker equivalents with attested parity and explicitly verify last invocation before retirement. Deployment status alone is not use.
5. **Supabase Storage historical bytes**: no complete storage-object -> B2 hash readback manifest has been established here. Preserve all 23k+ references; no mass deletion or source-content public leak.

## Required lossless cutover and retirement gate

1. Owner-private full 139-table schema inventory including primary and foreign keys, indexes, trigger/RLS semantics, row counts and clock windows; separately inventory Supabase managed Auth and Storage.
2. Classify every table as *derived hot*, *historical private archive*, *commercial immutable ledger*, *secrets/credentials*, *source directory*, *obsolete verified* or *manual-review*. No unclassified table may be dropped or declared migrated.
3. Copy only appropriate authenticated, rights-eligible records to D1. Preserve original IDs, timestamps and foreign keys, complete value hashes, commercial access policies and revocation state. Encrypt private payloads where appropriate; never put raw customer data in GitHub artifacts.
4. Independently read back archived original bytes from B2 and compare exact SHA256 and object count. Verify D1 primary key, count, hashes and anti-joins in both directions; false if truncation or extras. Repeat for changed rows through a cutover high-water mark.
5. Dual-run deterministic no-funds shadow comparisons for risk, commerce and agent APIs, including expired GRO, missing rights, duplicate payment, revoked key, stale event, quota limits, source inability, redirect and B2 GET failure.
6. Switch only routes with passing evidence, fresh required source and owner-controlled production secrets. Keep **fail closed** for unpaid/unsigned products; observe logs, payment settlement and customer use.
7. Retire old Supabase Edge Functions, credentials and storage ONLY after independent readback and written owner acceptance. Neither this inventory nor any PR authorizes deletion, pausing Supabase or real-money payments.

Run `node scripts/ops/inventory-supabase-d1-repository-crosscheck.mjs`
or workflow `Supabase to D1 Repository Crosscheck` for the full conservatively classified source/API/job filename report. Static source matches cannot establish network reachability or readback.

**Current GO verdict: PARTIAL MIGRATION VERIFIED, REPOSITORY-WIDE ZERO SUPABASE DEPENDENCY NOT VERIFIED.**
