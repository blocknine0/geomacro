# P1 D1 physical-row write relief — bundled source dispatch

## Observed production failure (5 Nov 2026)
Cloudflare account-level D1 Free metrics reached **114,606 rows written**
with a 100,000/day cap. Protected worker deployment and private research
rate-governor access returned provider code 7500 / HTTP 503. Existing
UTC-reset automation does not alone solve the daily write budget.

The 1,077-source registry dispatch previously changed 1 physical
`source_registry` lease row for every due source, in addition to the
per-source atomic poll claim and persisted health/cursor checkpoint.
For a one-hour configured cadence, dispatch lease updates alone can
represent 1,077 × 24 = 25,848 base-table updates/day before index effects.

## Permanent code path

- When protected P0B queue fanout is enabled, migration
  `0127_p1_bundled_source_dispatch.sql` creates an indexed, short-lived
  private JSON batch lease and one atomic minute gate.
- Every one-minute dispatcher selects <=108 due IDs, takes exactly one
  mutex lease, rechecks eligible IDs against *active* bundle leases,
  and durably writes one JSON batch lease for all IDs.
- The 10 queue shards transport only source IDs, UUID lease IDs and
  schedule clocks. No publisher article bytes or URLs enter the queue.
- Consumer V2 verifies the exact batch token/source membership in one
  bounded D1 SELECT. The source-level `next_poll_at` compare-and-swap
  is **retained** because Cloudflare Queues are at-least-once; duplicate
  deliveries cannot intentionally refetch a source before due time.
- Consumer accepts old V1 messages for the previous 120-second lease
  window while workers roll out.
- A failed queue send is never marked delivered. Its bundle lease
  expires in two minutes and the unchanged source becomes due again.
- Exact readback failure retries instead of falsely acknowledging
  durable source processing. Noncommercial source/candidate receipts
  never become paid event evidence.
- Expired batch records are pruned periodically. Index overhead is
  measured via real provider quota counters, **not** inferred from the
  two SQLite base-table row updates.

## Safety + deployment gate

New V2 config only activates in the protected Worker deployment when
the existing P0B Queue is provisioned. Wrangler applies committed D1
migrations before a separate remote readback requires both tables
and the singleton dispatch gate. Old V1 remains otherwise usable.
No change to the shared B2 account quota governor, payment, signing
or commercial Risk Gate rights.

## Acceptance procedure

1. PR P0-A SQLite CI: 1,077 sources fully sharded, 108 sources per
   durable bundle, two base-table changes for a dispatch, no duplicate
   dispatch in the same minute.
2. Test queue-send failure, expired/forged token and replay, D1 readback
   unavailable, and per-source due-time CAS on re-delivery.
3. Confirm protected `Deploy D1 Control Plane` workflow reached remote
   migration readback, completed full main-SHA deployment and runtime
   `GEOMACRO_P1_BUNDLED_LEASES_ENABLED=1` when P0B is enabled.
4. After UTC quota reset, obtain a real account-wide day-of-provider
   write census from Cloudflare Analytics and observe at least 24h of
   source-processing receipts with no D1 7500. Do not infer production
   health from offline green CI or deployment skip.
5. Check registered cadence. The pinned registry seed currently sets
   3,600 seconds per source. A 20-minute request across all 1,077
   sources requires a separate capacity plan: per-source claims and
   actual item writes still count against D1.
6. During exhausted D1 Free quota, canonical D1-backed protected
   publication/auth/quotas remain fail-closed. The existing isolated
   Supabase research-only 20-minute cron monitors eight official feeds,
   **not** all 1,077; it must not be misrepresented as full fallback.
   Full lossless zero-D1 source buffering still needs separately
   authenticated, tested, independently governed durable store-and-replay
   before it can be declared active.

**Guarantee boundary:** SQL query batching reduces call count; this
change reduces actual dispatcher base-table rows. It does not eliminate
Cloudflare account-wide 100k/day Free physical row quota, B2 usage caps
or network/API availability constraints.
