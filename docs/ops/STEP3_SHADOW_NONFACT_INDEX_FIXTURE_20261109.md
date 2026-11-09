# Step3 Shadow 0204 — non-fact, isolated, recoverable index fixtures

## Why

[Physical read-only run #42599941303](https://github.com/blocknine0/geomacro/actions/runs/42599941303) proved all three 0204 indexes exist, `PRAGMA quick_check('table')` passes, and forced covering-index traversal matches a full table scan, BUT **zero rows were compared**. This is a vacuous proof and is now a mandatory HOLD in [PR #3799](https://github.com/blocknine0/geomacro/pull/3799).

No provider-sourced real original, licensed source or signed GRO may be synthesized just to force an index pass. For isolated physical index-engine validation, this workflow seeds **clearly labeled NON-FACT, synthetic, non-commercial test fixtures** in the **dedicated Shadow D1 database only**, never in production, publisher, source inventory, Predge feed or commercial risk gates.

## Exact physical procedure

1. Owner reviews main SHA and explicitly pins `GEOMACRO_STEP3_REVIEWED_SHA` for the protected `production` environment. Repo must be `blocknine0/geomacro`, ref `main`, approved Shadow D1 UUID distinct from actual production UUID, `config/d1-hotspot-v2-canary.hold` present.
2. Existing Shadow schema and verified 0204 objects/indexes must be present. Exact rows in each of the three tables must be <=2996 before insertion; probe is bounded `SELECT EXISTS(... LIMIT 1 OFFSET 2996)`.
3. Account-wide Cloudflare Workers Paid current billing-cycle read/write data, owner 30% reserve and migration headroom must PASS, using the existing provider authenticated governor. No old Free-plan, local snapshot, self-declared Paid, spend-policy bypass or new payment.
4. Before any D1 write: capture fresh real Shadow D1 Time Travel bookmark; AES-256-GCM encrypt with existing protected key; private R2 PUT/GET byte equality, signed recovery manifest PUT/GET verification. Bookmark and payload remain in-memory only.
5. Insert exactly 3 non-real synthetic fixtures per Shadow table using fixed, allowlisted `INSERT OR IGNORE`. No production SQL. All dates are **2000-01-01 to 2000-01-03** so regular 72-hour feeds do not include them. The non-real payload explicitly marks `synthetic_test_data`, `rights_approved=false`, `qualified=false`, or `risk_gate_eligible=false`. No original article or facts.
6. Verify all nine exact immutable keys and JSON values from physical Shadow D1 readback, handle partial replay idempotently and HOLD if any duplicate key belongs to different data.
7. Emit **signed `status=NOT_YET_VERIFIED`** receipt containing the separate `fixture_status=PASS_SHADOW_ONLY_NONFACT_REPRESENTATIVE_KEY_ROWS`; it NEVER says signed Stage1, certified source or production migration PASS.

The subsequent **read-only** Shadow 0204 diagnostic can then establish actual nonempty table/index key parity. This is a physical index verification fixture only, not proof that a real geopolitical event occurred or that source rights are commercially licensed.

## Exact manual invocation (after CI/reviewed merge)

```bash
gh variable set GEOMACRO_STEP3_REVIEWED_SHA \
  --repo blocknine0/geomacro --env production \
  --body "<reviewed-main-40hex-sha>"

gh workflow run step3-shadow-0204-nonfact-index-fixture.yml \
  --repo blocknine0/geomacro --ref main \
  -f approval=SEED_NONFACT_0204_SHADOW_ONLY
```

No local `set -e` is necessary; the GitHub Actions workflow uses its own isolated strict shell with fail-closed status. After a successful physical fixture receipt, run the read-only 0204 diagnostic on main again, and only then review replacing D1-unsupported `integrity_check` with real physical supported `quick_check + complete bounded index parity`, retaining independent other index/counter/source and B2/R2/HMAC proofs.

The authoritative canary HOLD stays in place; this process cannot release traffic, payments or production D1 migration.
