-- Narrow, read-only daily coverage audits. These indexes keep scheduled
-- telemetry queries bounded without changing any public route or adding D1
-- reads to request handling.
CREATE INDEX IF NOT EXISTS idx_risk_stream_signed_gro_created_category_country
 ON risk_stream_signed_gro(created_at,category,country_iso3);

CREATE INDEX IF NOT EXISTS idx_risk_stream_predge_pull_created_category_country
 ON risk_stream_predge_pull_licenses(created_at,category,country_iso3);

CREATE INDEX IF NOT EXISTS idx_predge_paid_usage_created_tier_delivery
 ON predge_paid_risk_gate_usage_ledger(created_at,tier,entry_status,billable);
