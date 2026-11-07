# P0-B and P1 shared Cloudflare Queues monthly admission — 2026-11-07

## Problem
The existing `cloudflare_source_poll_queue_budget` D1 ledger accounted for
SOURCE_POLL_QUEUE only. The P0-B INGEST_QUEUE producer and ten-minute redriver
sent messages without taking any monthly Queues budget ticket; the source
ledger could remain green while combined Queue operations exceeded the owner's
conservative 800,000/month target.

## Permanent code remediation (no quota increase)
- Reuse the existing **same D1 row per UTC month** and the existing 800,000
  operation target. No new ledger or schema/index migration is needed.
- `reserveP0BIngestQueueMessage` uses one atomic SQLite UPSERT ... RETURNING
  to reserve **five conservative operations** per real message, covering
  write/read/retry/delete/DLQ envelope. It increments *operations_reserved*
  without corrupting the SOURCE_POLL-only *source_messages_reserved* metric.
- All three `processFetchedBatch` Queue sends and both ten-minute
  `drainBacklog` re-dispatches call `sendBudgetedP0BMessage` first.
  Unknown D1, missing table, cap exhaustion or malformed ticket means **no
  physical Queue send**; already sealed evidence remains in B2/D1 outbox/R2
  fallback for bounded redrive. Ambiguous Queue sends never refund tickets.
- Existing `0128_cloudflare_queue_monthly_source_budget.sql` must be
  physically present on the target D1. Source/ingest budget reservation is an
  internal **monthly operations** safety envelope, not a measured Cloudflare
  bill or true account-wide hard provider cap.
- P0-B redrives remain queue-based, while synchronous Hot50 Risk Gate checks
  remain **queue-less**. No charge, payment or signing permission change.

## Required production acceptance
1. Exact-head P1 and P0-B node tests pass, including one write per newly
   admitted message, quota denial before network, P1/P0B interleaving and
   ambiguous-send no-refund behavior.
2. Verify actual remote 0128 D1 table/schema and Queue bindings; preserve the
   existing protected D1 0204–0211 canary hold and owner 140k UTC-day
   read/write target. The shared queue ledger itself has D1 read/write cost.
3. Observe real ingestion backlog and per-Queue Cloudflare monthly operations,
   retries and DLQ receipts; compare billing-cycle usage, not merely UTC month.
   Other Cloudflare Queues and ungoverned clients require migration separately.
4. No source cursor or verified B2 ACK is advanced on denied or ambiguous
   Queue send. No additional quota reserve or funds authorization.

**This PR is source+ingest Queue code enforcement, NOT 100% account-wide
provider billing certification or Hot50 live Risk Gate activation.**
