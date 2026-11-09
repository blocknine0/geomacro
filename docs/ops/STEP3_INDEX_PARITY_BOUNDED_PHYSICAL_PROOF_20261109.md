# GeoMacro Stage 1 index integrity replacement — bounded physical logical parity

**Motivation.** Shadow-only [#42595314318](https://github.com/blocknine0/geomacro/actions/runs/42595314318) physically applied 0204 but could not verify: native D1 rejected table-scoped `PRAGMA integrity_check`. Independent read-only [#42596722763](https://github.com/blocknine0/geomacro/actions/runs/42596722763) confirmed 0204 native history/ledger/index/schema. [#42597684518](https://github.com/blocknine0/geomacro/actions/runs/42597684518) established all three D1-supported table `PRAGMA quick_check('table')` return exact `ok`.

## New independent logical index parity proof

`scripts/lib/d1-step3-index-parity.mjs` registers only the eight exact newly introduced indexes from fixed migrations 0204, 0212, 0213 (0211 introduces no indexes). For each index, it builds:

1. Physical `EXPLAIN QUERY PLAN` for a full `NOT INDEXED` table scan;
2. Independent `EXPLAIN QUERY PLAN` requiring `USING COVERING INDEX <exact-index>`;
3. One full bounded projection of `rowid` plus all index key columns with `NOT INDEXED`;
4. One full bounded projection through the exact forced covering index (`INDEXED BY`);
5. A second independent full bounded table projection (`NOT INDEXED`) to detect concurrent writes.

The verified cap is **3000 rows per table** (`LIMIT 3001` fails closed at 3001). All rowid/key projections are compared in memory, sorted by rowid, with SHA-256 digests. The full private row contents and their digests are **never logged, uploaded, displayed, or retained**; receipts contain only index names, checked row counts, proof enum and provider metered rows-read. No SQL migration or D1 mutation is authorized.

The 0204 read-only Shadow diagnostic evaluates all three new 0204 indexes after the existing **account-wide provider Workers Paid monthly headroom check**. The exact physical result is uploaded with previous quickcheck/metadata receipts. `quick_check` is *not* promoted to a substitute for full SQLite `integrity_check`. Logical key-row parity checks only the registered new indexes; it does not claim unrelated indexes are structurally sound. The Stage 1 migration runner's full-integrity condition remains **HOLD** in this PR until separately reviewed acceptance criteria and real provider proof support a safe replacement.

## Guardrails

- No customer data, production D1, deployment, D1 ledger writes, protected canary or payments are touched.
- No weak `COUNT(*)` equivalence; every projected key and rowid must match, and covering-index and non-index query plans must be physically proven.
- Concurrent mutations, missing/truncated provider metadata, 3001+ rows, noncovering index paths, mismatched rowids/values, partial data, timeouts → HOLD.
- The read-only probe itself requires the real account-wide Cloudflare subscription and D1 headroom check.
- GitHub PR / main push compile & negative tests, and no environment variable auto-update.
