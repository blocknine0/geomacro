/** Exact, trigger-maintained D1 Phase2H archive census.
 * 0208 lifetime staged/archived counters and 0212 UTC-hour pending buckets are
 * maintained in the same SQLite transaction as each source INSERT/ACK/DELETE.
 * The ONLY dynamic COUNT(*) is now restricted to the boundary <1 hour, not
 * the entire sliding 72h window. Preflight 0212 before enabling this SQL.
 * Counters are metadata, never independent B2 readback or signed evidence.
 */
export const PHASE2H_ARCHIVE_COUNTER_CENSUS_SQL=
 "WITH boundary AS ("+
 "SELECT category,COUNT(*) AS n FROM phase2h_private_raw_news "+
 "INDEXED BY idx_phase2h_pending_recent_ingested_category "+
 "WHERE b2_object_sha256 IS NULL AND first_ingested_at>"+ 
 "strftime('%Y-%m-%dT%H:%M:%fZ','now','-72 hours') "+
 "AND first_ingested_at<strftime('%Y-%m-%dT%H:00:00.000Z','now','-71 hours') "+
 "GROUP BY category), eligible AS ("+
 "SELECT c.category,COALESCE(b.n,0)+COALESCE(("+
 "SELECT SUM(h.pending_count) FROM phase2h_pending_hourly_v1 h "+
 "WHERE h.category=c.category AND h.hour_utc>="+
 "strftime('%Y-%m-%dT%H','now','-71 hours')),0) AS n "+
 "FROM phase2h_archive_totals c LEFT JOIN boundary b ON b.category=c.category) "+
 "SELECT c.category,c.staged_count AS staged,"+
 "(c.staged_count-c.archived_count) AS pending,"+
 "c.archived_count AS archived,"+
 "COALESCE(e.n,0) AS pending_eligible_72h,"+
 "(c.staged_count-c.archived_count-COALESCE(e.n,0)) AS pending_expired_72h "+
 "FROM phase2h_archive_totals c LEFT JOIN eligible e ON e.category=c.category "+
 "ORDER BY c.category";

export const PHASE2H_ARCHIVE_HOT50_TOTALS_SQL=
 "SELECT COUNT(*) AS categories,COALESCE(SUM(staged_count),0) AS total,"+
 "COALESCE(SUM(staged_count-archived_count),0) AS unarchived "+
 "FROM phase2h_archive_totals";
