# D1 repair and Website Intelligence continuity — 2026-11-07

## Observed production state

The owner-provided Wrangler migration history shows 0205–0211 pending. A direct
schema readback shows the four expected 0204 objects, but no 0211 daily-counter
table/triggers. The prior protected runner rejects any pending file except
0204/0211, so waiting for UTC reset cannot resolve this migration-chain blocker.

The owner-provided rolling 24h Insights show 1,925,242 reads on the legacy daily
queue COUNT, 1,060,352 on the deep outbox census, 497,059 on normalized article
COUNT and 380,268 on the raw archive COUNT. These historical query observations
are not the current UTC-day account totals, unique article counts, or proof that
the legacy statements remain active at the moment of this audit.

Public checks on 2026-11-07:
- `/health`: production Worker reports source SHA
  `69a1f7b36b46baf63fac06cecfef713b29a8ee6c`.
- Website build metadata reports
  `018147f47aa126ccb0a6025babb231145e3ba32c`.
- Reviewed repository base:
  `a8f8794bc753efcba8de0f58f77b7885600da68a`.
- The immediate public 72h journal at `2026-11-07T15:35:14.563Z` returned 71
  records: 15 geopolitics, 24 macro and 32 minerals. Applying the existing
  presentation classifier locally found 7 displayable macro and 5 displayable
  minerals records within 24h. The two recent geopolitics records were generic
  actor/action-unknown observations; they remain rejected. These are point-in-time
  public journal observations, not 150-cell coverage or new collection proof.

## Changes

The protected migration job now uses the original 0204–0211 SQL files one at a
time, pinned by SHA256. It preserves Wrangler's normal migration history and
never fabricates completion for missing files. Unknown migrations, including
staged 0212, are refused. Each step rechecks exact current main, the provider's
account-wide 140k UTC read/write policy, minimum 80k repair headroom, bounded
original-table exposure, a conservative per-migration cost envelope, a fresh
Time Travel bookmark, migration history and expected schema objects. The costly
0208 census requires more than the bare 80k read reserve. Large/unknown tables
remain held; no deletion or unbounded backfill is used to evade that hold.

Actual DDL row costs and concurrent traffic are not atomically capped by the
provider API observations. Cost envelopes are conservative estimates, not an
invoice guarantee. Usage is checked again after each migration. A failure may
leave earlier individual migrations successfully committed; a subsequent run
resumes from authentic Wrangler history. It never restores the database,
uploads a Worker, promotes traffic or activates funds.

Existing main already replaces recurring committed-day counts with 0211
transactional counters, raw archive counts with 0208 transactional counters,
and routine P0B health scans with bounded hints. Production acceptance requires
both those schemas and the corresponding deployed runtime; this PR does not
claim that migration history alone eliminates the historical queries.

The category-feed Worker now exposes its provenance headers through CORS.
The browser accepts an old Worker whose custom header is hidden by CORS only
when the exact HTTPS target and every existing response-body contract check
pass. A visible incorrect origin header still fails validation. One failed
category no longer discards the other independently validated categories.
No evidence, actor, time, source credit, score or commercial gate is invented
or relaxed.

## Rollout and remaining acceptance

1. Merge only after exact-head CI/review. The existing protected workflow
   `geomacro-protected-d1-canary-preflight.yml` remains responsible for genuine
   provider headroom; today's over-budget account must stay HOLD.
2. At fresh quota, its existing schedules/manual dispatch can run the bounded
   repair chain. Retain `repair-*.json` and the final eight-object 0204/0211
   schema receipt. Check any HOLD code; do not mark a migration applied manually.
3. Use the existing protected Hot50 0-to-100 rollout for the reviewed Worker,
   existing production bindings, CQRS producer ACK, zero-traffic smoke,
   gradual promotion and rollback. The canary hold file remains in place.
4. Publish the website from the accepted main and verify live frontend SHA.
   The client fix takes effect only after that deployment.
5. Verify actual browser category rendering and valid native-dated source to
   journal publication. Recheck short-window Query Insights after rollout;
   an old query can remain in rolling 24h metrics after its caller is removed.
6. Prove sustained account-wide rows_read AND rows_written below 140,000 per
   UTC day. Pending migrations, a green unit suite and this point-in-time public
   readback are not that proof. Geopolitics freshness still needs genuine
   named-actor/action source material. Do not manufacture a card to fill a tab.

Staged 0212, physical B2 parity, signed GRO certification, payment activation
and the full Hot50 evidence matrix are not claimed complete by this repair.
