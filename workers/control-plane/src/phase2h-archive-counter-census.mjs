/** Exact, D1-transactional Phase2H metadata census.
 * Only recent *unarchived* rows need an indexed bounded age count; full
 * historical counts are maintained atomically by migration 0208 triggers.
 * This does NOT verify B2 object existence/hash or grant evidence rights.
 */
export const PHASE2H_ARCHIVE_COUNTER_CENSUS_SQL=
 "WITH eligible AS ("+
 "SELECT category,COUNT(*) AS n FROM phase2h_private_raw_news "+
 "INDEXED BY idx_phase2h_pending_recent_ingested_category "+
 "WHERE b2_object_sha256 IS NULL AND first_ingested_at>"+
 "strftime('%Y-%m-%dT%H:%M:%fZ','now','-72 hours') GROUP BY category) "+
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
