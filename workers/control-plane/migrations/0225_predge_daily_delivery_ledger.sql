-- Append-only observational accounting for Predge v1 and v2 responses.
-- This ledger does not authorize, hold, or otherwise gate GRO creation or delivery.
CREATE TABLE IF NOT EXISTS risk_stream_predge_daily_delivery_ledger (
 delivery_id TEXT PRIMARY KEY NOT NULL CHECK(length(delivery_id)=64),
 api_version TEXT NOT NULL CHECK(api_version IN ('v1','v2')),
 request_id TEXT,
 gro_id TEXT,
 receipt_sha256 TEXT NOT NULL CHECK(length(receipt_sha256)=64),
 day_utc TEXT NOT NULL CHECK(length(day_utc)=10 AND day_utc GLOB '????-??-??'),
 country_iso3 TEXT CHECK(country_iso3 IS NULL OR country_iso3 GLOB '[A-Z][A-Z][A-Z]'),
 category TEXT CHECK(category IS NULL OR category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')),
 tier TEXT NOT NULL CHECK(tier IN ('BASIC','STANDARD','COMPLEX')),
 customer_price_usd TEXT NOT NULL CHECK(customer_price_usd IN ('0.15','0.20','0.30')),
 geomacro_net_usd TEXT NOT NULL CHECK(geomacro_net_usd IN ('0.10','0.15','0.25')),
 predge_fee_usd TEXT NOT NULL DEFAULT '0.05' CHECK(predge_fee_usd='0.05'),
 delivery_status TEXT NOT NULL CHECK(delivery_status IN ('SENT','DELIVERED','FAILED')),
 http_status INTEGER NOT NULL CHECK(http_status BETWEEN 100 AND 599),
 observed_at TEXT NOT NULL,
 CHECK((tier='BASIC' AND customer_price_usd='0.15' AND geomacro_net_usd='0.10') OR
       (tier='STANDARD' AND customer_price_usd='0.20' AND geomacro_net_usd='0.15') OR
       (tier='COMPLEX' AND customer_price_usd='0.30' AND geomacro_net_usd='0.25'))
);
CREATE INDEX IF NOT EXISTS idx_predge_daily_delivery_day_tier_status
 ON risk_stream_predge_daily_delivery_ledger(day_utc,tier,delivery_status);
CREATE INDEX IF NOT EXISTS idx_predge_daily_delivery_gro_receipt
 ON risk_stream_predge_daily_delivery_ledger(gro_id,receipt_sha256);
