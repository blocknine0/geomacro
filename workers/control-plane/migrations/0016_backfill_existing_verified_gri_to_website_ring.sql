-- One-time, readback-free seed of a previously admitted ORIGINAL verified GRI
-- artifact into the website-only >=60-minute D1 history ring.
--
-- D1's existing public_b2_hot_snapshot row was admitted only AFTER its
-- current producer proved full B2 GET/readback and original SHA/gzip restore.
-- Recovery overlays ("independent-gri-proof-over-b2-baseline") are strictly
-- excluded, as they do not constitute a new direct B2 snapshot.
-- Do not modify, backdate, reconstruct or sign snapshot content.
--
-- The endpoint rehashes payload_json bytes before returning any projection,
-- rejects invalid/missing proof fields, strips raw/source details and
-- independently enforces the publication cutoff. No B2 request, Supabase
-- request, external paid invocation, cron or new data provider.
INSERT OR IGNORE INTO website_verified_gri_snapshot_history
 (source_as_of,payload_sha256,b2_sha256,original_generated_at,
  original_verified_at,proof_schema,payload_json,created_at)
SELECT source_as_of,payload_sha256,b2_sha256,generated_at,
       verified_at,proof_schema,payload_json,
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM public_b2_hot_snapshot
WHERE product='global-risk'
  AND schema_name='geomacro.public-global-risk-live.v1'
  AND proof_schema='geomacro.public-global-risk-live-proof.v1'
  AND length(payload_sha256)=64
  AND length(b2_sha256)=64
  AND length(payload_json) BETWEEN 2 AND 786432
  AND julianday(source_as_of) IS NOT NULL
  AND julianday(source_as_of)<=julianday('now','-1 hour')
  AND julianday(source_as_of)>=julianday('now','-30 days')
  AND julianday(verified_at) IS NOT NULL
  AND julianday(verified_at)<=julianday('now','+5 minutes')
ORDER BY source_as_of DESC
LIMIT 1;

-- Retention is always bounded, even if the seeded row is already superseded.
DELETE FROM website_verified_gri_snapshot_history
WHERE source_as_of < strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')
 OR rowid NOT IN (
  SELECT rowid FROM website_verified_gri_snapshot_history
  ORDER BY source_as_of DESC LIMIT 12
 );
