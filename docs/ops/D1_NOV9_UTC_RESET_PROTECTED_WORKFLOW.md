# GeoMacro: 9 Nov 2026 00:00 UTC D1 reset and protected one-shot migration

**This runbook is an operational plan, not a claim of deployment.**
The optional one-shot GitHub workflow is
`.github/workflows/d1-nov9-utc-protected-migration-window.yml`.
It is inactive until merged into `main` AND
`GEOMACRO_STEP3_NOV9_ARMED=YES` is explicitly configured as a GitHub
Actions repository variable (or an authorized manual dispatch with
`execute=true` is started). The production environment approval policy
and GitHub secrets remain mandatory. The workflow does NOT remove the
HOLD file, deploy a Worker, merge a PR, suspend source ingestion, revoke
commercial signatures, or stop B2 archival.

## Calendar, clocks and controls

| UTC 9 November 2026 | Kolkata (IST) | Action | Next action permitted only if... |
|---|---|---|---|
| 00:00:00 | 05:30:00 | D1 UTC daily usage window rolls over | **Do not assume** GraphQL counters are fresh; no SQL |
| 00:05:00 | 05:35:00 | Run `check-d1-headroom.mjs --check` | Account-wide today's read **<10,000** AND write **<10,000**, strict 140k/80k reserve also PASS; otherwise HOLD |
| 00:10:00 | 05:40:00 | Re-gate, run real 50-record shadow billable test | Named separate shadow UUID != canonical DB, `retry.rows_written === 0`, one delta matches real single-item provider write count, exact 50-ID readback |
| 00:20:00 | 05:50:00 | Re-gate, exact SHA orchestrator `--apply` | Protected Time Travel bookmark captured before SQL; 0204 -> 0211 -> staged 0212 -> staged 0213, bounded input sizes, schema/index/counters/historical proof and HMAC readback |
| After completed | — | Independently inspect all receipts, Worker source continuity and signatures | ONLY explicit post-migration PASS can start a **separate** reviewed Step 4 canary; HOLD file still untouched by this workflow |

Actual GitHub scheduled starts may be late or dropped, and production environment
reviewers may delay approvals. The workflow fails closed if the 00:05 start is
after 00:09:59 UTC, the shadow stage starts after 00:14:59 UTC, or the
mutation stage starts after 00:29:59 UTC. It does **not** retry migrations
after a missed window. The exact date guard prevents an automatic repeat
on 9 November in a later year.

## Arm the protected window

In GitHub `blocknine0/geomacro` → Settings → Secrets and variables →
Actions, set repository variable:

```text
GEOMACRO_STEP3_NOV9_ARMED = YES
```

On the protected `production` environment, verify existence and exact
scopes (do NOT paste values into logs or this chat) of:

```text
CLOUDFLARE_ACCOUNT_ID                GitHub Actions secret
CLOUDFLARE_API_TOKEN                 least-privilege D1 + GraphQL secret
D1_DATABASE_ID                       var or secret; canonical geomacro-control-plane
GEOMACRO_D1_SHADOW_DATABASE_ID       var or secret; separate named shadow D1
GEOMACRO_COMMERCE_LEDGER_TOKEN       secret; protected root-only HMAC reader
```

Review the exact source SHA pinned by the workflow:
`3c8fe6a51c8b34aa75d43ab0c77e5395d3fe16f2` (original Step 3 PR #3727).
The runner itself rejects a mismatched checkout. An update to PR #3727
will **not** change this pinned source automatically; changing the pin
requires a separately reviewed PR.

If the new workflow has been merged to `main`, a manual fallback is
GitHub → Actions → **D1 November 9 UTC Protected Migration Reset Window**
→ Run workflow → `main` → **execute=true**.
Manual runs are subject to the **same exact 9 November UTC time windows**,
headroom test, production environment, source pin and shadow proof. Do
not rerun after any applied migration without reviewing the prior log.

## Locally equivalent commands (manual shell)

```bash
node scripts/ops/check-d1-headroom.mjs --check
# At 00:05 UTC, verify both counters < 10,000, not merely < 60,000.

# At or after 00:10 UTC, BEFORE any production SQL:
node scripts/ops/check-d1-headroom.mjs --check
node scripts/ops/verify-d1-publisher-billable-shadow.mjs --run-shadow

# At or after 00:20 UTC (same UTC day), with explicit protected approval:
node scripts/ops/check-d1-headroom.mjs --check
export GEOMACRO_STEP3_EXACT_SHA="$(git rev-parse HEAD)"
export GEOMACRO_STEP3_APPLY=APPROVE_ONLY_0204_0211_0212_0213
node scripts/ops/run-step3-protected-d1-migrations.mjs --apply
```

The orchestrator currently **re-runs the shadow test** as an independent
same-execution precondition. Thus 00:20 may consume a second set of native
shadow D1 rows. The repeated headroom gate accounts for provider usage.
No test result is invented from SQLite or SQL-call count.

## Step 3 strict PASS / Step 4 canary handshake

Step 3 **remains HOLD** if any of the following proofs are missing:

1. Cloudflare provider GraphQL all-database UTC usage below 60k reads and
   writes with at least 80k remaining of the owner 140k/day envelope
   at every stage. The 00:05 fresh reset additionally requires both
   observed counts strictly below 10k.
2. 50-record shadow billing: unchanged retry writes **0** billable rows,
   and one changed batch writes **the same native billable delta as one
   individually changed row**, including index/trigger work; exact
   50-record final readback.
3. Production D1 exact UUID, current Time Travel bookmark with private
   owner-controlled retention, hash-pinned 0204/0211/0212/0213 history,
   bounded DDL seed/index budget, exact index plans, integrity and
   counter parity, unchanged legacy original identities; no corruption.
4. Non-empty **actual** reference pointer set with the real private R2
   HMAC-SHA256 and full object/record hash readback. **No newly populated
   references means pointer cryptographic certification is NOT PASS**.
5. B2 physical archive readback, unchanged B2 ACK/census paths, public
   and authenticated customer HTTP/API parity, live first-party ingestion
   continuity, unchanged commercial signing/verdict evidence, payment
   policy and no production source-loss regression.
6. Sanitized full execution receipt has
   `status="PASS"` and
   `post_migration_readback_explicit_PASS=true`, independently
   checked against the exact production account, Worker SHA, UTC date
   and archived artifacts.

**Only after all six conditions are independently verified** may the
release owner authorize removing
`config/d1-hotspot-v2-canary.hold` in a separately reviewed PR,
merging/promoting the applicable optimization branch, and a protected
0%-traffic → small canary → verified gradual promotion of PR #3725
(Step 4). Do not automate HOLD-file deletion or PR #3725/#3726 merging
from this reset workflow. PR #3726 includes staged 0214; that migration
is NOT in the approved Step 3 scope.

A successful scheduled GitHub workflow is not by itself permission
to remove the HOLD if the independent production parity receipts are
missing. On any uncertainty, leave main ingestion, commercial
signatures and B2 archival untouched and report HOLD.
