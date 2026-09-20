# Exact source certification census

The canonical source inventory and the certification state are different facts.

Run:

```bash
bun run source:certification:census
```

Strict mode:

```bash
bun run source:certification:census:strict
```

The census reads the authoritative production Supabase project and writes:

- `artifacts/source-certification-census/sources.json`: every registered source with its raw certification dimensions and a derived disposition.
- `artifacts/source-certification-census/paths.json`: every governed source-universe path with its certification evidence state.
- `artifacts/source-certification-census/summary.json`: category totals plus the canonical source-network and launch status.

Source dispositions are deliberately descriptive:

- `CERTIFIED`: source-level certification is complete.
- `RIGHTS_OK_BUT_NOT_CERTIFIED`: commercial/derived rights are usable, but the full certification evidence graph is not complete.
- `INGESTION_ONLY`: ingestion is enabled while commercial signals remain disabled.
- `REVIEW_REQUIRED`: rights or other review remains unresolved.
- `BLOCKED`: the source is not currently eligible under the recorded state.

A rights label such as `COMMERCIAL_OK` or `DERIVED_ONLY` never becomes `CERTIFIED` by itself.

The workflow runs this census before the global production coverage gate and preserves the artifacts. The census is read-only and cannot promote, enable, or certify a source.
