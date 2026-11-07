# GeoMacro five-gate protected remediation package — 2026-11-08

Complete runnable TypeScript and GitHub Actions sources. No fake provider
responses, synthetic stories, unreviewed migrations, secret literals or payment
activation are included. The package intentionally reports `HOLD` whenever an
actual prerequisite is missing.

## Install in the authoritative GeoMacro repository

From a clean checkout of `blocknine0/geomacro` with its existing
`config/d1-hotspot-v2-canary.hold` present:

```bash
# Put this extracted directory beside the repository; then run FROM the repo root:
bash ../geomacro-release-remediation/install.sh
npm run release:remediate
```

The installer copies exactly the listed source files and merges six package
scripts into the existing `package.json` without dropping dependencies.
Review the git diff, commit on a protected branch, require CI/review, and merge.
It never touches a provider, creates secrets, or enables payments.

### Dedicated scripts

- `scripts/apply-d1-migrations.ts` — `--verify` (read-only schema/history/
  `PRAGMA index_list`/`EXPLAIN QUERY PLAN`) and `--apply` (reviewed 0204–0211
  original-SHA, one-migration-at-a-time Wrangler 4.136.3 runner). The runner
  requires the production GitHub Actions `main` identity, exact remote main,
  genuine Workers Paid, <60k current-UTC read and write rows, Time Travel backup,
  bounded source-table exposure and a fresh cost envelope before each DDL.
  Outputs a private-key-signed `artifacts/release/d1-schema-acceptance.json` only
  after every physical schema and migration history check passes.
- `scripts/canary-promoter.ts` — the authenticated Cloudflare Workers
  Deployments REST API, `0 → 1 → 10 → 100%`, fifteen observed minutes at every
  stage, provider-sourced host HTTP 5xx ratio <0.001, Worker requestDuration
  p99 <50 ms, and exact version binding parity. Rollback to baseline 100% on
  any later-stage failure, preserving `config/d1-hotspot-v2-canary.hold`.
  A 0%-stage validates the existing baseline, not an undeployed candidate
  (Cloudflare cannot version-override an inactive candidate).
- `scripts/verify-d1-quota-proof.ts` — Cloudflare GraphQL Analytics of EVERY
  account D1 database for a fully closed previous UTC day, with an extra hour
  to allow analytics to settle. A signed report proves exactly the observed
  billable rows, not an atomic account-wide hard stop or a provider signature.
- `src/middleware/quotaCircuitBreaker.ts` — SQLite-backed Durable Object
  transactionally reserves conservative **upper bounds** on a centrally
  integrated caller's D1 operations, with trusted provider snapshot sync and
  stale-telemetry fail-close. It is NOT a provider-enforced hard cap; a D1 query
  can scan more than its predicted maximum, and independently executing D1
  producers bypass it. Integrate ALL D1 callers before claiming comprehensive
  enforcement; still keep provider quota monitoring and billing alerts.
  `src/middleware/quotaWorker.ts` and `wrangler.quota.jsonc` define a private
  two-minute provider sync Worker and SQLite-based DO. Before deployment, add
  its internal secret/analytics credentials to Cloudflare using protected
  secrets; never put secrets in vars or git. Bind `D1_QUOTA_DO` to all central
  D1 Workers with `script_name: geomacro-d1-quota-governor` and route governed
  queries through `withQuotaCircuitBreaker` with exact worst-case row bounds.
  **Existing GitHub Actions and REST D1 direct queries must also be governed**.
- `scripts/certify-b2-parity.ts` — verifies the existing protected live D1
  manifest, first and second D1 readback, full paginated B2 physical S3
  `ListObjectsV2` within the exact protected spool prefix, full B2 GET +
  AES-GCM/hash restoration on every indexed batch, and **actual R2** S3
  listing + checksum readback against `p0b_private_r2_fallback`. It rejects
  extra/unindexed objects and holds if either list cannot fit the explicit
  provider request budget. It checks all four GeoMacro Queue backlog metrics
  twice plus the complete D1 unhandled census. Backblaze Class C LIST budget
  does NOT have an independent canonical D1 counter, so operator must approve
  the strictly limited LIST attempt with `B2_LIST_ALLOWED=1`; the existing
  total ledger conservatively reserves a GET ticket for each LIST attempt.
  `b2-physical-parity-certificate.json` is integrity evidence, NOT a blanket
  Backblaze provider Class-C spend guarantee.
- `src/risk/hot50Attestation.ts` — reads genuine **150 event** records from
  `HOT50_EVENT_MANIFEST_PATH` (default
  `artifacts/hot50-risk-gate/verified-primary-events.json`). For each of the
  exact 50 countries × 3 categories it demands ≥3 distinct primary issuer
  records, independent HTTPS original-byte GET/hash verification, matching
  native publication timestamp and ≥3 shared canonical fact terms; then it
  invokes the pre-existing GeoMacro pinned facts AND rights dual-signature
  verifier (real source authority keys required). Produces an ES256 or Ed25519
  3-hour signed `hot50-risk-gate-proof.json` using `SIGNING_JWK`, with an actual
  random nonce. No RSS headline, unscored Google News, same-event copy or
  GeoMacro self-signature can substitute for original/event/rights evidence.
  A cryptographic signature proves integrity, not external reviewer identity.
- `scripts/release-remediate.ts` — `npm run release:remediate` launches the
  five *verification* tracks in parallel, captures genuine PASS/HOLD exits,
  and never starts DDL, rollout, real-funds transactions, or source invention.

## Protected workflows

`.github/workflows/canary-promotion.yml` uses the existing exact-main
production environment and serializes production-mutating workflows using
`geomacro-d1-control-plane-production`. Manual `operation=migrate` is a
protected, one-at-a-time production migration run; the operator must provide
`confirmation=MIGRATE_D1_0204_0211_NO_FUNDS` in the protected workflow dispatch. `operation=promote` validates
D1 schema and does a true Cloudflare REST rollout, checking metrics after a
full 15 minutes per stage. `operation=verify` is a parallel no-funds audit.
`operation=release-hold` demands all five real signed receipts and a closed
UTC 24-hour D1 proof, then removes the hold only from the **ephemeral checkout**;
an independently reviewed PR/merge is REQUIRED to delete the authoritative
hold on GitHub main. Do NOT automatically write it to main.

The workflow uses the existing owner production secrets where known, plus
`SIGNING_JWK`, `CLOUDFLARE_ZONE_ID`, `P0B_PRIVATE_R2_BUCKET`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM`,
`GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM`, and source-rights key hashes in
protected repository/Cloudflare settings. No secret value is included here.
`B2_LIST_ALLOWED` must be an explicit production environment variable `1` for
an authorized bounded physical listing, otherwise the parity job holds.

## Non-negotiable acceptance boundaries

1. A success in CI is **not** proof of live Cloudflare D1 migrations or a
   one-day 140k billed-rows target. The 2026-11-07 live baseline observed
   millions of D1 rows read, and the exact-live canary remains blocked until
   the provider actually admits migrations and readback confirms them.
2. Cloudflare Workers Paid $5 is the base subscription, NOT an account-wide
   $5 hard invoice cap. KV/DO cannot enforce a hard limit on Cloudflare's
   measured rows_read/rows_written across independent Workers and REST callers.
3. Cloudflare Worker requestDuration p99 may be unavailable for some Workers
   plans/configurations. A missing metric is HOLD, not a guessed 50ms PASS.
   The API host 5xx ratio and script duration are separate metric scopes.
4. Complete original evidence, legitimate independent source/rights proofs,
   and signed current GRO must exist. These scripts will never invent 150
   events just to satisfy the requested Gate count.
5. Four zero Queue snapshots are best effort and are only part of complete
   backlog acceptance; durable D1 outbox and historical raw state must also be
   zero with independently verified B2/R2 object state.
6. No paid-news provider dependency, commercial payment authorization,
   195-country Risk Gate scope expansion, review certificate invention,
   manual migration-history edits, or silent quota extension is introduced.

### External technical contracts verified against official documentation

- Cloudflare Worker Deployments REST: `POST /accounts/{id}/workers/scripts/{name}/deployments`
- Cloudflare D1 GraphQL: `d1AnalyticsAdaptiveGroups` / billed `rowsRead` and `rowsWritten`
- Cloudflare Queues REST: `GET /accounts/{id}/queues/{queue_id}/metrics`
- Cloudflare Durable Objects SQLite-backed storage; Cloudflare R2 and
  Backblaze B2 S3-compatible SigV4 API

All audit report signatures must be verified before acceptance; the package's
`verifySignedEnvelopeFile()` performs this against the protected signing JWK.

## Execution safety

The installer never runs provider scripts. Without real Cloudflare/B2/R2
credentials, native time-valid original evidence, and existing source rights
signers, all provider-dependent commands fail closed, as intended. Never
suppress those errors with `continue-on-error`, dummy JSON fixtures, or
synthetic evidence; use the existing protected GitHub environment with actual
provider authorizations.