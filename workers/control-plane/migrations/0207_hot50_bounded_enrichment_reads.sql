-- Hot50 only: bounded recurring evidence-presence reads.
-- Do not alter the general 195-country research/corridor indexes or source truth.
-- The runtime query includes the literal entity_type='COUNTRY' predicate,
-- so SQLite can select these partial covering indexes.
CREATE INDEX IF NOT EXISTS idx_unverified_hot50_country_discovered
 ON unverified_observations(entity_id,discovered_at DESC,category)
 WHERE entity_type='COUNTRY';
CREATE INDEX IF NOT EXISTS idx_risk_obs_hot50_country_created
 ON risk_observations(entity_id,created_at DESC,category)
 WHERE entity_type='COUNTRY' AND evidence_status IN ('VERIFIED_SIGNED_GRO','OBSERVED_UNVERIFIED');
