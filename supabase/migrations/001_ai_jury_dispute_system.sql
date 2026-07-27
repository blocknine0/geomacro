-- =============================================================================
-- Migration: AI-jury dispute system
-- Run this in the Supabase SQL editor (or via CLI) before deploying
-- AgentArenaV2 + resolve-disputes.js + the dispute-council frontend page.
--
-- Written idempotently (IF NOT EXISTS everywhere) so it's safe to run even
-- if market_disputes / events.disputed_at already partially exist from
-- earlier work — nothing here will error out or duplicate on a re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. events.disputed_at — already referenced by sync-lifecycle.js (line 249),
--    added here in case it was never actually migrated.
-- -----------------------------------------------------------------------------
ALTER TABLE events ADD COLUMN IF NOT EXISTS disputed_at timestamptz;

-- -----------------------------------------------------------------------------
-- 2. market_disputes — already referenced by sync-lifecycle.js (line 255) with
--    columns event_id, market_id, disputer_address. Extending it here with the
--    columns AgentArenaV2's dispute flow needs (bond amount, jury tally,
--    final outcome) rather than introducing a second, differently-named table.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_disputes (
    id                  bigint generated always as identity primary key,
    event_id            bigint references events(id),
    market_id           text not null,
    disputer_address    text not null,
    created_at          timestamptz not null default now()
);

ALTER TABLE market_disputes ADD COLUMN IF NOT EXISTS bond_amount           numeric;
ALTER TABLE market_disputes ADD COLUMN IF NOT EXISTS overturn_votes        smallint not null default 0;
ALTER TABLE market_disputes ADD COLUMN IF NOT EXISTS uphold_votes          smallint not null default 0;
ALTER TABLE market_disputes ADD COLUMN IF NOT EXISTS resolved              boolean not null default false;
-- 'OVERTURNED' | 'UPHELD' | 'INCONCLUSIVE' (jury never reached 4-of-5 within
-- the 48h window, AgentArenaV2's finalizeMarket fallback upheld by default)
ALTER TABLE market_disputes ADD COLUMN IF NOT EXISTS final_verdict         text;
ALTER TABLE market_disputes ADD COLUMN IF NOT EXISTS resolved_at           timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS market_disputes_market_id_idx ON market_disputes(market_id);
CREATE INDEX IF NOT EXISTS market_disputes_resolved_idx ON market_disputes(resolved);

-- -----------------------------------------------------------------------------
-- 3. jury_votes — new. One row per juror per dispute, written by
--    resolve-disputes.js right after each on-chain submitJuryVote() tx
--    confirms. This is a transparency mirror for the dispute-council
--    frontend page — the on-chain vote is always the source of truth;
--    losing this table doesn't lose any funds or verdicts.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jury_votes (
    id              bigint generated always as identity primary key,
    market_id       text not null,
    juror_role      text not null,   -- 'fact_checker' | 'hawk_rearguer' | 'dove_rearguer' | 'evidence_skeptic' | 'domain_specialist'
    juror_wallet    text not null,
    verdict         text not null,   -- 'OVERTURN' | 'UPHOLD'
    reasoning       text,
    tx_hash         text not null,
    voted_at        timestamptz not null default now(),
    unique (market_id, juror_wallet)  -- a juror can only vote once per market on-chain too; mirrors that constraint here
);

CREATE INDEX IF NOT EXISTS jury_votes_market_id_idx ON jury_votes(market_id);

-- -----------------------------------------------------------------------------
-- 4. RLS — public read-only, same pattern as the existing public read-only
--    policy on positions (used by geomacro-analytics). Only the service-role
--    key (used server-side by resolve-disputes.js / sync-lifecycle.js) can
--    write; anonymous/anon-key clients (the frontend) can only read.
-- -----------------------------------------------------------------------------
ALTER TABLE market_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE jury_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON market_disputes;
CREATE POLICY "Public read access" ON market_disputes
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Public read access" ON jury_votes;
CREATE POLICY "Public read access" ON jury_votes
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- No insert/update/delete policy for anon/authenticated on either table —
-- writes only happen server-side via the service-role key, which bypasses
-- RLS entirely, so no explicit write policy is needed (or wanted).
