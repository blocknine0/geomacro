-- Conservative UTC-month atomic accounting for P1 Cloudflare Queues source-poll.
-- This is an INTERNAL reservation ledger, not a Cloudflare account bill.
-- It cannot track other producers or account-specific billing-cycle boundaries.
CREATE TABLE IF NOT EXISTS cloudflare_source_poll_queue_budget (
  month_utc TEXT NOT NULL PRIMARY KEY
    CHECK(length(month_utc)=7 AND month_utc GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  queue_name TEXT NOT NULL DEFAULT 'geomacro-source-poll'
    CHECK(queue_name='geomacro-source-poll'),
  operations_reserved INTEGER NOT NULL DEFAULT 0
    CHECK(operations_reserved>=0 AND operations_reserved<=800000),
  source_messages_reserved INTEGER NOT NULL DEFAULT 0
    CHECK(source_messages_reserved>=0),
  updated_at TEXT NOT NULL
);
