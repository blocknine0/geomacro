-- Read-only verification views. No mutation of source, reviewer, risk or budget.
-- DO NOT equate D1 logical consistency to physical S3 GET/list verification.
DROP VIEW IF EXISTS v_p0b_unhandled_activation;
CREATE VIEW v_p0b_unhandled_activation AS
SELECT
 (SELECT COUNT(*) FROM p0b_archive_outbox WHERE state NOT IN ('ARCHIVED')) AS outbox_pending,
 (SELECT COUNT(*) FROM ingestion_spool_queue WHERE state NOT IN ('ACKNOWLEDGED','D1_COMMITTED')) AS queue_unhandled,
 (SELECT COUNT(*) FROM ingestion_spool_bundles WHERE state NOT IN ('D1_COMMITTED')) AS bundles_unhandled,
 (SELECT COUNT(*) FROM p0b_private_r2_fallback WHERE state NOT IN ('B2_VERIFIED')) AS r2_pending,
 (SELECT COUNT(*) FROM phase2h_private_raw_news WHERE b2_object_sha256 IS NULL) AS historical_unarchived,
 (SELECT COUNT(*) FROM p0b_archive_outbox o WHERE o.state='ARCHIVED'
  AND NOT EXISTS (SELECT 1 FROM ingestion_spool_bundles b
   WHERE b.b2_spool_uri=o.b2_uri AND b.bundle_sha256=o.b2_object_sha256
    AND b.item_count=o.item_count AND b.state='D1_COMMITTED' AND b.acked_at IS NOT NULL)) AS outbox_bundle_mismatch,
 (SELECT COUNT(*) FROM p0b_archive_outbox o WHERE o.state='ARCHIVED'
  AND (SELECT COUNT(*) FROM ingestion_spool_queue q WHERE q.b2_spool_uri=o.b2_uri)<>o.item_count) AS outbox_item_mismatch;
-- This view's ZERO is necessary but not sufficient; provider Queue metric,
-- full independent physical B2 listing and SHA256 GET are separate acceptance gates.

DROP VIEW IF EXISTS v_hot50_three_category_evidence;
CREATE VIEW v_hot50_three_category_evidence AS
WITH hot(iso3) AS (VALUES ('USA'),('CHN'),('IND'),('RUS'),('GBR'),('DEU'),('FRA'),('JPN'),('KOR'),('BEL'),('CAN'),('AUS'),('BRA'),('MEX'),('ITA'),('ESP'),('NLD'),('CHE'),('NOR'),('SWE'),('POL'),('UKR'),('TUR'),('SAU'),('ARE'),('IRN'),('ISR'),('EGY'),('QAT'),('OMN'),('IRQ'),('ZAF'),('NGA'),('COD'),('ZMB'),('CHL'),('PER'),('ARG'),('BOL'),('IDN'),('VNM'),('THA'),('MYS'),('SGP'),('PHL'),('PAK'),('BGD'),('KAZ'),('MNG'),('MMR')),
cats(category) AS (VALUES ('geopolitics'),('macro'),('rare_earth')),
events AS (
 SELECT country_iso3,category,event_fingerprint,
  COUNT(DISTINCT CASE WHEN clock_basis='ORIGINAL_PUBLICATION' THEN publisher_domain END)
   AS original_publishers,
  MAX(event_clock) AS latest_original_or_index_clock
 FROM progressive_risk_gate_facts
 WHERE event_clock>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-72 hours')
 AND event_clock<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 GROUP BY country_iso3,category,event_fingerprint
),agg AS (
 SELECT country_iso3,category,COUNT(*) observed_events,
 SUM(CASE WHEN original_publishers>=1 THEN 1 ELSE 0 END) AS original_events,
 SUM(CASE WHEN original_publishers>=2 THEN 1 ELSE 0 END) AS corroborated_events,
 MAX(original_publishers) AS max_publishers
 FROM events GROUP BY country_iso3,category
)
SELECT hot.iso3 country_iso3,cats.category,
 COALESCE(agg.observed_events,0) AS observed_events,
 COALESCE(agg.original_events,0) AS original_dated_events,
 COALESCE(agg.corroborated_events,0) AS same_event_independent_pair,
 COALESCE(agg.max_publishers,0) AS independent_publishers,
 CASE WHEN COALESCE(agg.corroborated_events,0)>0 THEN 'METADATA_CORROBORATED'
      WHEN COALESCE(agg.original_events,0)>0 THEN 'NATIVE_DATED_METADATA'
      WHEN COALESCE(agg.observed_events,0)>0 THEN 'INDEX_ONLY'
      ELSE 'EMPTY' END evidence_state
FROM hot CROSS JOIN cats LEFT JOIN agg
 ON agg.country_iso3=hot.iso3 AND agg.category=cats.category;
-- These metadata cells NEVER constitute reviewer certification.
