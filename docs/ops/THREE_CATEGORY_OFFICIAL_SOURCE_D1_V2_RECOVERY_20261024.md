# Three-domain official free-source D1 checkpoint v2 recovery (2026-10-24)

The existing official three-domain poller failed the real protected
[production mesh run #40024304484](https://github.com/blocknine0/geomacro/actions/runs/40024304484)
with `D1_EXISTING_CHECKPOINT_SCHEMA_OR_HASH_INVALID` **before**
any source status or verified original could be accepted. This is a
persisted control-state mismatch, not evidence of a 503 root fix,
source licence, Suman approval or current original news.

## Permanent preservation-first migration

The previous `pipeline_checkpoint` key space
`pipeline=free_source_production_updates` is LEGACY. Never delete,
rewrite, rehash, mark as current, or copy its unvalidated bytes into
another evidence channel. In the existing **same D1 control-plane
database**, versioned read/writes now use the isolated namespace
`pipeline=free_source_production_updates_v2`. The original three
per-category rows stay in D1 for separately authorized forensic review
and readback; this costs at most three additional tiny D1 checkpoint
rows, not a new provider, database, Supabase service or payment plan.

On the very first v2 protected run, the source collector reads the empty
v2 namespace and probes its bounded allowlisted publishers. Per-source
freshness is recorded from **actual returned source-native clocks only**;
the entire first observation is an explicit baseline
(`first_observation_is_new_update:false`). Subsequent 30-minute
scheduled runs dedupe existing hashes and honour 24h/6h 403/429 denial
backoffs. The signed customer GRI/Intelligence/Risk Indices writers
do NOT read this source checkpoint and cannot promote hash-only
observations into source-native article-byte or licence proofs.

### Exact unattended acceptance (NO FUNDS)

1. Check the post-merge GitHub Action
   `Free Commercial Source Lineup No-Funds Rotation`,
   job `read-only-production-mesh`.
2. The safe aggregated receipt must report
   `geomacro.production-free-source-updates.v1` with
   `d1_exact_metadata_readback_verified=true`, `d1_writes=3`,
   `first_observation_is_new_update=false` and per-category reader
   counts for `geopolitics`, `macro`, `rare_earth`.
   `FREE_SOURCE...FAILURE` remains red.
3. Verify subsequent healthy 30-minute cadence dedupes the baseline.
   Provider-denied sources are allowed to remain `degraded`; never
   report them as independently verified original event candidates.
4. For actual signed commercial acceptance independently require
   genuine article page and byte-native clocks, exactly qualified
   per-article Facts/Rights Ed25519 receipts and same-event original
   corroboration, current Suman-reviewed numerical GRI and country
   certificates, exact Pallab approval, real historical B2 readback,
   immutable new B2/D1 signed 3/3 and Deep Health HTTP 200.
   Existing once-consented derived-only machine audit is not a new
   human numerical GRI review.
5. Do NOT enable x402 mainnet settlement without separate owner ACK
   after a genuinely deliverable representative machine buyer request.

If the v2 namespace itself becomes invalid, fail closed with the new
redacted diagnostic receipt. Do not automatically create endless v3/v4
namespaces or restamp stale evidence to fake freshness.

The three product endpoints continue to reuse the **one canonical
three-category derived intelligence engine**. Hash-only D1 source
checkpoints are internal transport diagnostics and never constitute a
fourth paid product or a separate raw-data feed.
