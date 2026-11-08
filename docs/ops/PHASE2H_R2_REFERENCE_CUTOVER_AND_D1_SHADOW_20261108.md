# Phase2H private R2 reference lane + Cloudflare D1 shadow billing probe

Status: **STAGED / PRODUCTION HOLD**. PR #3725, no canonical migration,
public URL, commercial delivery, new paid entitlement, B2 archive ACK, or
worker binding is activated by this PR.

## Exact changes

- `workers/control-plane/staged-migrations/0213_phase2h_raw_ref_only_v1.sql`
  creates an independent reference-only table (no `raw_json` column).
- `workers/control-plane/src/phase2h-raw-object-refs.mjs` writes up to 50
  validated Phase2H observations into **one content-addressed private R2
  bundle**, then performs an independent full-body R2 GET byte/hash readback
  **before** inserting any D1 pointers. Only source clocks, identity SHA,
  R2 bundle SHA/key, original-record digest/length/index, UTC signed time,
  HMAC-SHA-256 pointer authentication and country/category metadata enter D1.
- D1 pointer INSERT is one conditional JSON-table statement; provider
  `meta.rows_written` is exposed only when actually reported, never inferred.
- The exact-ID private reader verifies the pointer HMAC **before** R2 GET,
  checks bundle and record SHA-256, validates the full record and original
  SHA-256; if no pointer exists it falls back to the old D1 `raw_json`.
  If a pointer exists but fails proof, return 503; NEVER serve a legacy row
  in its place.
- An independent, additionally gated indexed country/category reader can
  merge the newest 40 protected R2 pointers with legacy indexed D1 rows,
  restoring bytes only into bounded per-request memory. It does not persist
  restored raw records to D1.

## Contracts and audit boundaries

This is **private staged observation storage**. A valid HMAC proves only that
the holder of the private reference key authenticated that exact pointer. It
does NOT independently verify source truth, original publication,
copyright/redistribution rights, reviewed GRO scores or partner eligibility.
A verified private R2 staging PUT does not equal a verified B2 archival ACK.
The original `phase2h_private_raw_news` schema and B2 verification, retention,
`gro_evidence_jobs` and 0208/0212 counters are unchanged. Consequently,
referenced rows **must not** be counted as legacy B2-archived or certified
Hot50 evidence until a separate reviewed B2 archive/counter migration ships.

The reference lane is disabled by default. Do not set
`GEOMACRO_PHASE2H_REF_ONLY_V1=1` on production until ALL readers, archive
governor/retention, ledger/census parity and release gates have been
independently verified. `GEOMACRO_PHASE2H_REF_ONLY_READERS_V1` independently
gates the additional protected country-index reader. New configuration:
dedicated *private* R2 Worker binding `PHASE2H_PRIVATE_R2`; secret
`PHASE2H_R2_REFERENCE_HMAC_KEY` must be 64 random lowercase hex characters.
Do not attach any public bucket or expose the secret to GitHub logs.

## Other legacy consumers not yet migrated (blocking full cutover)

Some paths still SELECT `phase2h_private_raw_news.raw_json` and do not
reconcile new private object references:

- `workers/control-plane/src/unified-risk-gate.mjs` TWN fallback;
- `workers/control-plane/src/gro-evidence-enrichment.mjs` B2-ACK-dependent evidence;
- `workers/control-plane/src/corridor-risk-gate-jit.mjs` private per-country preflight;
- `workers/control-plane/src/risk-gate-controlled-bypass.mjs`;
- `scripts/ops/phase2h-archive-private-raw-news.mjs` B2 producer;
- `scripts/ops/compile-daily-grounded-digests.ts`;
- `scripts/ops/p0a-intelligence-completeness-production.mjs`.

Do not claim this is a completed production-wide reader cutover until these
are reconciled, new R2 raw records receive provable B2 archive coverage,
legacy D1 raw bytes have been independently migrated and purged under a
quota-gated, time-travel-backed procedure, and real Cloudflare costs are
measured. Existing legacy data remains intact for backward compatibility.

## CI

```bash
node --test scripts/tests/phase2h-r2-reference-cutover.test.mjs
node --test scripts/tests/d1-publisher-shadow-billable.test.mjs
node scripts/ops/verify-d1-publisher-billable-shadow.mjs --dry-run
```

CI uses deterministic SQLite and R2 mocks; it never claims Cloudflare billing.

## Real billable D1 rows_written — separate shadow only

1. Provision an **independent disposable Cloudflare D1** with exact name
   `geomacro-d1-publisher-shadow` (optional `-suffix`). This must not be
   GeoMacro's canonical D1. Do NOT run the script until provider account-wide
   row usage leaves adequate headroom under owner 140k/day ceilings.
2. Supply account ID, a scoped D1 token, the **shadow** UUID and separately
   the **production** D1 UUID to block accidental prod writes; require
   `GEOMACRO_D1_SHADOW_TARGET_APPROVED=YES`.
3. Run once with the real provider (not `--dry-run`):

```bash
GEOMACRO_D1_SHADOW_TARGET_APPROVED=YES \
GEOMACRO_D1_SHADOW_DATABASE_ID="$SHADOW_D1_UUID" \
D1_DATABASE_ID="$PRODUCTION_D1_UUID" \
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
node scripts/ops/verify-d1-publisher-billable-shadow.mjs --run-shadow
```

The script first proves provider-reported database UUID **and** shadow-only
name; it creates a synthetic publisher schema with matching revision triggers,
performs one 50-item conditional bulk insert, one **identical 50-item retry**,
50 individual-row inserts as a baseline, and a bulk retry with **one changed
story**. It fails closed if any provider `result[0].meta.rows_read` or
`rows_written` is missing, the repeated batch writes any rows, or the
single changed story writes none. No real source payload or sensitive query
binds are logged.

Machine result: `artifacts/release/d1-publisher-shadow-billable-rows.json`.
PR benchmark status file:
`artifacts/benchmarks/benchmark-results.json`. Until a real authorized run,
Cloudflare billable results remain **null / unmeasured**.

### Guardrails

The shadow query observes **billable D1 rows**, not SQLite instruction
counts; provider index and trigger rows count separately and may exceed 50
for 50 new records. A one-statement 50-row bulk INSERT is **not** a single
billable D1 row write. R2 byte offload shrinks D1 payloads but does not
magically reduce how many metadata rows/index entries are written.
R2 PUT and GET are independently metered and require separate quota proof.
Real money acceptance remains OFF throughout this step.
