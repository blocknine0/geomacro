# Geomacro permanent runtime boundary

Status: Day 3 migration contract, 2026-10-03.

The customer-facing production runtime must keep working safely when Supabase is unavailable. Supabase remains an explicitly isolated migration/recovery source until later retirement; it is not a serving authority.

## Permanent authorities

| State class | Permanent authority | Runtime rule |
| --- | --- | --- |
| Public Intelligence snapshots | Backblaze B2 | B2 is the production serving authority. Missing/corrupt data fails closed or returns bounded unavailable state; do not fabricate freshness. |
| Global Risk / Risk Indices | Backblaze B2 | Paid/public production reads use the B2-only production reader. |
| Canonical country GRO bytes | Backblaze B2 | Canonical country resolution is B2-first. Full signed GRO bytes do not belong in D1. |
| Raw observations / evidence / historical payloads | Backblaze B2 | Durable payload store only. |
| Source certification state | Cloudflare D1 | Compact metadata only. |
| Country x domain readiness | Cloudflare D1 | Compact readiness/index state only. |
| GRO index | Cloudflare D1 | Object ID, subject, validity, payload hash, canonical record SHA, B2 pointer/hash only. |
| Pipeline checkpoints / small control state | Cloudflare D1 | No raw/evidence payloads. |
| x402 delivery replay / idempotency / usage guard / commercial audit coordination | Cloudflare Durable Objects | Transactional commerce authority. |
| Code, migrations, contracts and CI | GitHub main | Exact-head source authority. |

## Supabase runtime classification

Production defaults `GEOMACRO_SUPABASE_RUNTIME_MODE` to `standby`. In this mode `getAppSupabase()` returns no client and `risk-supabase.server.ts` does not permit primary traffic. Any production path that requires a Supabase client in standby is therefore a migration bug and must fail closed rather than silently switching authority.

### Standby/recovery only

- `src/lib/supabase-app.server.ts`: bounded recovery client. Only `primary` or explicit `standby_read` may return a client.
- `src/lib/risk-supabase.server.ts`: publisher/recovery database client. Production standby disables primary traffic.
- `src/lib/global-risk-read.server.ts`: legacy/recovery reader. Paid GRI preflight uses `production-global-risk.server.ts` instead.
- `src/lib/public-intelligence.functions.ts::readPublicIntelligenceRowsFromSupabase`: snapshot publisher/recovery helper. It is not the permanent public data authority.
- `src/lib/risk-object-store.server.ts`: legacy persistence and non-canonical/recovery lookup. Canonical customer country-GRO reads go through the B2-first resolver.
- Supabase archival/readback scripts under `scripts/ops`: migration/recovery tooling only and never a customer-serving dependency.
- Supabase migrations/functions: retained only for rollback/recovery while the old project is in cold standby.

### Legacy/testnet isolation

- `src/lib/ask-intelligence.server.ts`: legacy/Testnet intelligence engine. Public Ask Geomacro uses the hybrid B2-backed production engine.
- legacy Testnet auth/account/avatar/feedback/data surfaces may continue to reference Supabase during the migration window, but they are not launch authorities for x402 commercial intelligence and cannot make the public/commercial production runtime depend on Supabase.
- `src/lib/supabase-feed.ts`: browser compatibility layer; direct browser Supabase data authority is forbidden in production.

## Hard cutover rules

1. `NODE_ENV=production` with no explicit override must remain `standby`.
2. Public/commercial B2 reads, D1 control state, and Durable Object commerce must pass an acceptance test with no Supabase URL/key/DB secret injected.
3. A provider failure must not cause fake freshness, invented evidence, unsigned GRO delivery, or payment without deliverable output.
4. Raw/history/evidence/full GRO payloads are forbidden in D1.
5. D1 GRO `record_sha256` must come from canonical bytes of independently verified B2 readback, never inferred from a Supabase row.
6. Supabase may not be destructively retired until D1/B2 parity, rollback evidence, ingestion migration, fresh GRO publishing and disaster tests are complete.
7. No `storage.objects` deletion through SQL.
8. No threshold weakening to turn `UNREADY`, `NO_PUBLICATION` or `INSUFFICIENT_COVERAGE` into a commercial success.

## Day 3 acceptance

The permanent-runtime health workflow must prove, without injecting any Supabase credential:

- live B2 public intelligence and verified Risk Indices are ready;
- the D1 control-plane Worker can query schema v1 and reports B2 as durable payload authority;
- the Durable Object commerce ledger reports its transactional capabilities;
- production reports Supabase runtime mode `standby` and `supabase_required_for_serving=false`;
- no payment and no destructive action occurs during acceptance.

Fresh ingestion and signed-GRO publication are intentionally handled in Day 4 because their old publisher path still uses the standby Supabase store. They must be migrated before final Supabase retirement.
