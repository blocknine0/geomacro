-- Add a machine-readable freshness check for intraday high-confidence signed GRO overrides.
-- Uses existing immutable daily snapshot and current verified GRO timestamps; no event is inferred.
CREATE INDEX IF NOT EXISTS idx_unified_risk_snapshots_identity_day_generated
 ON unified_risk_snapshots(entity_type,entity_id,day_utc,generated_at);
