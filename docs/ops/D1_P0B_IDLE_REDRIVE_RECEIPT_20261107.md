# P0B D1 hotspot remediation — 2026-11-07

## Provider observations

Read-only Cloudflare Query Insights were collected at 2026-11-07T09:38:10.689Z:
https://github.com/blocknine0/geomacro/actions/runs/42350591970
Job 128367801766 (rerun). This is a rolling one-day, control-plane database
sample, not the UTC-day account-wide quota. Original SQL and bound values
remain inside the protected runner.

| SQL SHA256 | Exact source | Rows read | Executions |
| --- | --- | ---: | ---: |
| fa578c6e5f335b9765e714ce1793b95f7f6680c67353705a3a71a7b9f118ad7d | P0B deep outbox parity | 1,060,352 | 114 |
| b37dabd5f591b130c997e7b9a578f46e40aa5bf839781c7209f9238c8a3db109 | backlog redrive daily committed count | 1,021,353 | 139 |
| f45adbbe4f327891bfe11846175cfec70c1ef598db297d1f4047e19d54f0b2cf | P0B normalized metadata count | 502,032 | 36 |

The checked-in attribution test hashes actual protected status SQL and matches
these provider fingerprints. Unknown statements remain unattributed.

## Changes and correctness

PR #3668, independently merged as 30d1d927bdabbca6358d2326be89ee33d0f58967,
reduces repeated deep polling, omits routine normalized metadata counts and
scopes Hot50 recovery to the selected countries. Deep parity remains mandatory.

This follow-up first selects due redrive work using existing queries. If no
bundle or legacy item is due, it returns DRAIN_CLEAN without scanning all
committed candidate rows. For nonempty work, the original exact daily
committed count and 90,000 ceiling still execute before any Queue dispatch.
Invalid/missing count telemetry refuses dispatch. No new counter,
background writes, source cadence reduction, queue deletion or ACK shortcut
is introduced. Deploy path filters explicitly include the changed runtime.

This removes one journal count per idle tick, not all reads in the database.
It does not assert that all 139 historical executions were idle or that their
entire cost is eliminated. The rolling sample must age out and new provider
measurements must confirm the actual reduction.

## Release boundary

At 2026-11-07T09:34:27.059Z protected Stage A reported
CANARY_ACCOUNT_D1_BUDGET_HELD, with account UTC-day reads 3,385,005 and writes
350,310. Both exceed the 140,000 normal/day targets. Receipt:
https://github.com/blocknine0/geomacro/actions/runs/42360268739
Job 128367067463. Spend verification was UNVERIFIED_ADVISORY and did not
cause this hold. Existing consumption cannot be undone by a code change.

Keep the canary hold until the actual protected rollout prerequisites pass.
This receipt does not claim deployment, daily budget acceptance, B2 physical
parity or issue #3648 completion. Index write relief from migration 0206 must
also be remotely verified; source batching alone does not reduce billed rows.

## Mutable-index write amplification

Migration 0210 replaces the source foreign-key helper index
`(source_id,state)` with `(source_id)`. The dedicated state/lease index and
all primary/unique constraints remain unchanged. No runtime source-state
lookup uses this helper index; parent-source FK maintenance retains indexed
source_id lookup. This removes the redundant mutable-state index maintenance
from normal queue state transitions, with a one-time index rebuild at rollout.
Physical production rows_written savings require provider measurement; SQLite
functional tests do not claim Cloudflare billing totals. The migration fixture
runs the existing P0B admission/crash/ACK tests with the replacement index and
explicitly tests indexed FK lookup and rejection of orphaning parent deletion.
