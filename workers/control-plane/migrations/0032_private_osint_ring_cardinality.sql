-- One-time bounded backfill; exact transactional O(1) count thereafter.
-- Never retain publisher originals, bypass D1 quota, or alter existing rows.
CREATE TABLE IF NOT EXISTS private_osint_ring_cardinality_v1(
 single INTEGER PRIMARY KEY CHECK(single=1),
 item_count INTEGER NOT NULL CHECK(item_count >= 0)
);
INSERT OR REPLACE INTO private_osint_ring_cardinality_v1(single,item_count)
 SELECT 1,COUNT(*) FROM private_osint_news_25h;
CREATE TRIGGER IF NOT EXISTS private_osint_ring_insert_v1
AFTER INSERT ON private_osint_news_25h BEGIN
 UPDATE private_osint_ring_cardinality_v1 SET item_count=item_count+1 WHERE single=1;
END;
CREATE TRIGGER IF NOT EXISTS private_osint_ring_delete_v1
AFTER DELETE ON private_osint_news_25h BEGIN
 UPDATE private_osint_ring_cardinality_v1 SET item_count=item_count-1 WHERE single=1;
END;
