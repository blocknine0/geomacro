-- Daily, append-only observational accounting for Predge Risk Gate responses.
-- This ledger never participates in a delivery decision.
CREATE TABLE IF NOT EXISTS predge_risk_gate_delivery_ledger (
 delivery_event_id TEXT PRIMARY KEY NOT NULL CHECK(length(delivery_event_id)=64),
 endpoint_version TEXT NOT NULL CHECK(endpoint_version IN ('v1','v2')),
 request_id TEXT NOT NULL,
 gro_id TEXT,
 receipt_sha256 TEXT NOT NULL CHECK(length(receipt_sha256)=64),
 day_utc TEXT NOT NULL CHECK(length(day_utc)=10),
 country_iso3 TEXT NOT NULL CHECK(length(country_iso3)=3),
 category TEXT NOT NULL CHECK(category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')),
 tier TEXT NOT NULL CHECK(tier IN ('BASIC','STANDARD','COMPLEX')),
 customer_price_usd REAL NOT NULL CHECK(customer_price_usd IN (0.15,0.20,0.30)),
 geomacro_net_usd REAL NOT NULL CHECK(geomacro_net_usd IN (0.10,0.15,0.25)),
 predge_fee_usd REAL NOT NULL CHECK(predge_fee_usd=0.05),
 delivery_status TEXT NOT NULL CHECK(delivery_status IN ('SENT','DELIVERED','FAILED')),
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_predge_delivery_daily
 ON predge_risk_gate_delivery_ledger(day_utc,delivery_status,tier,country_iso3,category);
