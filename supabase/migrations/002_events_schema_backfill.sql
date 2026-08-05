-- =============================================================================
-- Migration: events table schema backfill
--
-- Documents columns that were added directly in the Supabase SQL editor over
-- several sessions and never captured as migration files, so the live schema
-- and this migrations folder had drifted. Written idempotently (IF NOT EXISTS
-- everywhere) — safe to run even though every column below already exists in
-- production; this file exists so a fresh database can reach the same state.
--
-- 001_ai_jury_dispute_system.sql already covers `disputed_at` — not repeated
-- here. Order follows ordinal_position in the live `events` table.
-- =============================================================================

-- Market lifecycle
ALTER TABLE events ADD COLUMN IF NOT EXISTS market_created         boolean not null default false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS market_threshold       integer;
ALTER TABLE events ADD COLUMN IF NOT EXISTS resolution_at          timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS market_resolved        boolean not null default false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS market_address         text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS market_created_tx_hash text;

-- Early ingestion fields (predate the narrative/summary/stage naming used above)
ALTER TABLE events ADD COLUMN IF NOT EXISTS url                    text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS title                  text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS description            text;

-- AI resolution (resolve-markets.js)
ALTER TABLE events ADD COLUMN IF NOT EXISTS ai_processed           boolean not null default false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ai_tentative_winner    text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ai_resolved_at         timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ai_reasoning           text;

-- Lifecycle sync + dispute window (sync-lifecycle.js)
ALTER TABLE events ADD COLUMN IF NOT EXISTS lifecycle_stage        text not null default 'active';
ALTER TABLE events ADD COLUMN IF NOT EXISTS disputer_address       text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS dispute_window_ends_at timestamptz;

-- Hawk/Dove briefings (generate-briefings.js) + market_question
ALTER TABLE events ADD COLUMN IF NOT EXISTS hawk_reasoning         text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS dove_reasoning         text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS hawk_conviction        smallint;
ALTER TABLE events ADD COLUMN IF NOT EXISTS dove_conviction        smallint;
ALTER TABLE events ADD COLUMN IF NOT EXISTS briefing_generated_at  timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS market_question        text;
