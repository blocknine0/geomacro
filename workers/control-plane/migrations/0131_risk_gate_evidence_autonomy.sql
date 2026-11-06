-- Event-driven, bounded metadata-only evidence/score loop; no article text,
-- payment, issuer private key, or fake source-rights approval stored here.
CREATE TABLE IF NOT EXISTS risk_gate_progressive_event_outbox(
 event_key TEXT PRIMARY KEY CHECK(length(event_key)=64),
 observation_id TEXT NOT NULL CHECK(length(observation_id)=64),
 event_id TEXT NOT NULL CHECK(length(event_id)=64),
 subject_type TEXT NOT NULL CHECK(subject_type IN ('COUNTRY','CORRIDOR')),
 subject_id TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')),
 first_seen_at TEXT NOT NULL,
 last_seen_at TEXT NOT NULL,
 event_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','PROCESSING','WAITING_EVIDENCE','CORROBORATED','EXPIRED')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rg_progressive_events_due
 ON risk_gate_progressive_event_outbox(state,next_attempt_at,subject_type,subject_id);
CREATE INDEX IF NOT EXISTS idx_rg_progressive_events_subject
 ON risk_gate_progressive_event_outbox(subject_type,subject_id,category,event_at DESC);
CREATE TABLE IF NOT EXISTS risk_gate_progressive_cell_state(
 subject_type TEXT NOT NULL CHECK(subject_type IN ('COUNTRY','CORRIDOR')),
 subject_id TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')),
 observed_count INTEGER NOT NULL DEFAULT 0 CHECK(observed_count>=0 AND observed_count<=40),
 independently_verified_sources INTEGER NOT NULL DEFAULT 0 CHECK(independently_verified_sources>=0 AND independently_verified_sources<=40),
 corroborated_events INTEGER NOT NULL DEFAULT 0 CHECK(corroborated_events>=0 AND corroborated_events<=40),
 derived_impact_0_100 REAL CHECK(derived_impact_0_100 BETWEEN 0 AND 100),
 evidence_status TEXT NOT NULL CHECK(evidence_status IN ('OBSERVED_UNVERIFIED','CORROBORATED_ORIGINAL_EVIDENCE','INSUFFICIENT_EVIDENCE')),
 latest_event_id TEXT CHECK(latest_event_id IS NULL OR length(latest_event_id)=64),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(subject_type,subject_id,category)
);

-- Each index target can be kept in a durable next-search priority ledger.
-- No headline, publisher article or upstream provider secret is stored.
CREATE TABLE IF NOT EXISTS risk_gate_priority_feed_queue(
 subject_type TEXT NOT NULL CHECK(subject_type IN ('COUNTRY','CORRIDOR')),
 subject_id TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')),
 priority TEXT NOT NULL CHECK(priority IN ('MISSING','STALE')),
 priority_at TEXT NOT NULL,
 last_search_at TEXT,
 due_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(subject_type,subject_id,category)
);
CREATE INDEX IF NOT EXISTS idx_risk_gate_priority_due
 ON risk_gate_priority_feed_queue(due_at,priority,priority_at);
