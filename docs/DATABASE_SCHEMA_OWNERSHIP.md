# Geomacro database schema ownership

## Canonical rule

The Git repository owns the database schema. External ingestion, lifecycle, GRI, market and agent processes may insert/update application data, but they must not create hidden production-only tables or columns.

The authoritative application database project ref is `ldpwajisioljyjtojvfx` unless explicitly changed by a reviewed migration/configuration change.

## Production safety rules

1. Never run `supabase db reset` against production.
2. Production schema changes are forward-only migrations committed under `supabase/migrations/`.
3. Never apply a migration containing `DROP TABLE`, `DROP SCHEMA`, `TRUNCATE`, destructive `ALTER TABLE ... DROP`, or bulk `DELETE FROM` without a separately reviewed recovery plan.
4. Before a write-capable operator script, verify the target project with `npm run db:target`.
5. Before and after a production migration, run `npm run db:verify-core`.
6. Every migration PR must pass the disposable full-chain replay workflow.
7. Browser and server application paths must point at the same authoritative application database.

## Baseline

`000_core_schema.sql` captures the core `events`, `market_disputes`, and `jury_votes` schema that historically existed before the numbered migration chain. It is idempotent and additive on an existing database and allows a disposable/fresh database to enter migrations 001+ with the prerequisites they expect.

## GRI integrity

GRI publication remains fail-closed. No fallback score or synthetic snapshot is permitted. Published snapshots, contribution ledgers, methodology/proof versions, hashes, story provenance, comparison continuity and validation tables are part of the core schema contract.

## External pipelines

Pipelines may read/write data through documented credentials. They must fail if an expected schema object is absent and must never repair schema ad hoc in production.
