-- Additive cursor: source D1 stays canonical; supplementary Supabase is optional.
-- No historical Supabase, PREDGE or customer/funding table changes.
CREATE TABLE IF NOT EXISTS supplementary_7d_cursors(
 channel TEXT PRIMARY KEY CHECK(channel='corridor_derived'),
 last_created_at TEXT NOT NULL,
 last_research_id TEXT NOT NULL,
 last_verified_sync_at TEXT NOT NULL
);
