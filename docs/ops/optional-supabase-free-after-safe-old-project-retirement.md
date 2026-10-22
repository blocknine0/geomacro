# Geomacro: permanent old Supabase database exit and optional new Free sidecar

> **SUPERSEDED OWNER DECISION — 2026-10-22:** The old Supabase project **must remain active and must not be deleted**. The retirement guidance on this page is historical planning only, **not approved for execution**. See [RETAIN_OLD_SUPABASE_20261022.md](./RETAIN_OLD_SUPABASE_20261022.md). Any new delete or bulk Storage removal needs fresh explicit owner authorization.

Status checked 2026-10-22. Owner decision: **retire old Supabase** `ldpwajisioljyjtojvfx`; do not reuse `geomacro-staging` (`hencqxkmmcgnothotqpq`) as the replacement. Zero paid infra before revenue.

## Database authority after exit

| Content | Permanent place | Rules |
| --- | --- | --- |
| Immutable original historical PostgreSQL export | Private Backblaze B2 | Canonical original PostgreSQL custom archive, full SHA256 readback and disposable PostgreSQL 17 restore, verified in Actions #39598466442. **An archive is not a queryable live database.** |
| 23,648 original private Storage files, 57,459,939 source metadata bytes | Private B2 | Four certified private bundles; complete original per-file SHA256 restore run #39651599672. No direct end-user access to raw evidence. |
| Geopolitics/Macro-FX/Critical Minerals serving hot rows | Cloudflare D1 | Only small current public derived objects with original evidence proofs, validity/freshness and private B2 pointer; do not import the whole old PostgreSQL schema. |
| Historical news, source facts, raw evidence, full GRO archives | Private B2 | No raw originals to buyers or website, preserve provenance and rights. |
| x402 settlement/usage/entitlement/idempotency | Cloudflare Durable Objects, or verified equivalent production authority | Never move payment authority to Free sidecar merely because it has 500 MB quota. Independent customer replay/ledger acceptance is mandatory. |
| Current signed hot risk index/GRO projections | D1 with B2 durable proof | Fail closed on expired, unverified, missing signatures or no commercial rights. |
| Credential-free public Intelligence endpoints | Worker/D1/B2 | The old Supabase URL and secrets must not be present or required. |

Never copy 552 MB raw old PostgreSQL data into a new 500 MB Free project. B2 backup is cold durable storage; programmatic queries require new small D1 projections and tested routes.

## Separate optional new Supabase Free sidecar

After **old project is safely retired**, a fresh and separately configured Free project may handle ONLY small non-revenue-critical user services:

- Human sign-in, OAuth callback, small non-sensitive profile and account preferences, optionally Supabase Auth.
- Limited support tickets, bug reports, opt-in notification preferences and account administration records.
- Optional non-critical tester avatars/thumbs and tiny admin Realtime notification feed, provided privacy/auth and egress are measured.
- A lightweight Edge Function for account-only hooks/feedback, if runtime PAUSE/timeout cannot affect commercial APIs.

**Not allowed** in this Free sidecar: 195-country data ingest, scheduled scraping, raw evidence/news, country histories, production GRO signature/certification authority, public Intelligence/GRI/Risk Indices hot reads, B2 archive custody, rights proofs/keys, x402 money ledger, settlement, paid entitlements, or an always-on production health dependency.

The old live functions cannot be relinked to a new project simply by copying source files: their deployed versions, secrets, source references, callers, authentication and privileged permissions require independent inventory and migration.

### Official Free limits and stricter Geomacro operator budgets

Official Supabase limits (as checked 2026-10-22; consult current pricing before launch):
- **500 MB** database per active Free project;
- **1 GB** Storage and **5 GB** egress at organization/plan scope;
- **50,000** Auth MAU, **500,000** Edge Function invocations/month;
- **2 million** Realtime messages and **200** peak connections;
- at most **2 active Free projects** across owned/admin organizations;
- an inactive Free project can pause after ~7 days, so cannot be an irreplaceable 24/7 serving component.

Geomacro **internal precautionary budgets, not provider quotas**: target at most 150 MB database; 100 MB total sidecar files, 1 GB egress/month, 25,000 Edge invocations/month and 1,000 internal realtime updates/day. Investigate sustained growth near 70% of these precautionary budgets; fail closed instead of moving core intelligence into this database. Keep a manual backup because Free does not provide production PITR/daily backups.

Sources: https://supabase.com/docs/guides/platform/billing-on-supabase , https://supabase.com/pricing , https://supabase.com/docs/guides/platform/free-project-pausing .

## Gates BEFORE old project deletion or source Storage API removal

**Both original sources currently remain at old Supabase until all customer paths are cut over**. Their existence does not imply backup failure. If any gate fails, keep the original untouched.

1. Private B2 PostgreSQL snapshot SHA256 + full original disposable PostgreSQL 17 physical restore and record counts accepted (run #39598466442).
2. Both old Storage buckets complete original B2 per-object SHA256/full-body readback accepted (run #39651599672).
3. **Supabase-origin-free** B2 independent canary: retrieve and verify one original item from each bucket with zero Supabase URLs, keys or network calls; best-effort quota-governed Actions workflow `legacy-b2-origin-free-restore.yml`. Prior run #39668475305 was QUOTA_HELD and did not complete this distinct test.
4. Public customer historical fragment/media retrieval must work end to end from verified B2/D1 without relying on `live_fragment_manifest` old Storage paths. Expose no private originals; preserve strict source rights. An archive bundle alone does **not** implement customer serving.
5. All four tester avatar profiles and existing user auth/session semantics have independently accepted new storage/read-back implementation, OR the optional tester capability has been explicitly retired with no surviving API consumers.
6. Commercial `agent_payments`, `commercial_payment_events`, `commercial_credit_accounts`, `commercial_entitlement_grants`, credit usage and other revenue ledgers are independently reconciled with the new Durable Object authority. Payment idempotency, replay and existing users' rights continue to function.
7. All **10 actual deployed** old Supabase Edge Function versions, source, caller paths, authorization and required secrets are reimplemented/retired. A GitHub `index.ts` file is not proof of the deployed version.
8. Source ingestion, certification, signing, paid API, Ask Geomacro, GRI and Risk Indices pass live non-funds acceptance without old Supabase credentials.
9. Verify zero remaining old source accesses/writes, security/retention/legal preservation, rollback and outage acceptance. Then and only then obtain explicit owner deletion confirmation.
10. If removing original Supabase Storage files, use **Supabase Storage API only**, never `DELETE FROM storage.objects` SQL. Deletion is irreversible. Execute tiny identity-verified batches only after gate #1-#9. Project deletion remains prohibited before all batches reconciled.

Old primary project `ldpwajisioljyjtojvfx` and original storage are currently marked **DO NOT DELETE**. A green preservation workflow is **not** deletion approval.

## Useful workflow links

- [Verified PG17 B2 backup restore](https://github.com/blocknine0/geomacro/actions/runs/39598466442)
- [Original private Storage complete B2 restoration](https://github.com/blocknine0/geomacro/actions/runs/39651599672)
- [Read-only non-Predge old-primary retirement audit](https://github.com/blocknine0/geomacro/actions/runs/39664353196)
- [Supabase-free B2-origin canary](https://github.com/blocknine0/geomacro/actions/workflows/legacy-b2-origin-free-restore.yml)
