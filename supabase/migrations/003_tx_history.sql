-- =============================================================================
-- Migration: tx_history table
--
-- Documents a table that was created directly in the Supabase SQL editor and
-- never captured as a migration file, so the live schema and this migrations
-- folder had drifted. Written idempotently (IF NOT EXISTS everywhere) — safe
-- to run even though this table already exists in production; this file
-- exists so a fresh database can reach the same state.
--
-- Populated by tx-history.functions.ts (recordTxHistory / getMyTxHistory),
-- called from bridge-section.tsx and swap-section.tsx after a bridge or
-- same-chain swap confirms.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tx_history (
    id             bigint generated always as identity primary key,
    wallet_address text not null,
    type           text not null,   -- 'bridge' | 'swap'
    tx_hash        text not null,
    token_in       text not null,
    token_out      text not null,
    amount_in      text not null,
    amount_out     text,
    fee_tx_hash    text,
    fee_usdc       text,
    explorer_url   text not null,
    created_at     timestamptz not null default now()
);

-- recordTxHistory() upserts on (wallet_address, tx_hash) so a retried call
-- doesn't create a duplicate row.
CREATE UNIQUE INDEX IF NOT EXISTS tx_history_wallet_tx_idx ON tx_history(wallet_address, tx_hash);

-- getMyTxHistory() filters by wallet_address, ordered by created_at desc.
CREATE INDEX IF NOT EXISTS tx_history_wallet_created_idx ON tx_history(wallet_address, created_at DESC);

-- -----------------------------------------------------------------------------
-- RLS — unlike market_disputes/jury_votes in 001, this table is NOT meant to
-- be publicly readable: tx-history.functions.ts always reads/writes via the
-- service-role key (server-side only, bypasses RLS), and nothing in the
-- frontend queries this table directly with the anon key. Enabling RLS with
-- no SELECT policy denies anon/authenticated by default, so the anon key
-- (which ships in the frontend bundle) can't be used to read other wallets'
-- transaction history directly against Supabase.
-- -----------------------------------------------------------------------------
ALTER TABLE tx_history ENABLE ROW LEVEL SECURITY;
