import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
const migration=readFileSync(new URL("../../workers/control-plane/migrations/0032_private_osint_ring_cardinality.sql",import.meta.url),"utf8");
const worker=readFileSync(new URL("../../workers/control-plane/src/private-osint-15m.mjs",import.meta.url),"utf8");
const compact="DELETE FROM private_osint_news_25h WHERE item_id IN (SELECT item_id FROM private_osint_news_25h ORDER BY native_feed_published_at ASC,item_id ASC LIMIT MAX(0,(SELECT item_count FROM private_osint_ring_cardinality_v1 WHERE single=1)-4000))";
function dbWithRing(initial=0){
 const db=new DatabaseSync(":memory:");
 db.exec("CREATE TABLE private_osint_news_25h(item_id TEXT PRIMARY KEY,native_feed_published_at TEXT NOT NULL,first_seen_at TEXT NOT NULL); CREATE INDEX idx_private_osint_news_clock ON private_osint_news_25h(native_feed_published_at DESC,item_id DESC);");
 const stmt=db.prepare("INSERT INTO private_osint_news_25h VALUES (?,?,?)");
 for(let i=0;i<initial;i++)stmt.run(String(i).padStart(6,"0"),new Date(1_700_000_000_000+i*1000).toISOString(),"FIRST");
 db.exec(migration);
 return db;
}
test("0032 exact one-time backfill and transactional triggers preserve cardinality",()=>{
 const db=dbWithRing(4000);
 const count=()=>db.prepare("SELECT item_count FROM private_osint_ring_cardinality_v1 WHERE single=1").get().item_count;
 assert.equal(count(),4000);
 db.prepare("UPDATE private_osint_news_25h SET first_seen_at=? WHERE item_id=?").run("UNCHANGED","000001");
 assert.equal(count(),4000);
 db.prepare("INSERT INTO private_osint_news_25h VALUES (?,?,?)").run("NEW","2026-10-27T00:00:00Z","FIRST");
 assert.equal(count(),4001);
 db.prepare("DELETE FROM private_osint_news_25h WHERE item_id=?").run("NEW");
 assert.equal(count(),4000);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM private_osint_news_25h").get().n,count());
 db.close();
});
test("indexed hard cap retains newest 4000 and immutable first_seen",()=>{
 const db=dbWithRing(4008);
 assert.ok(worker.includes("(SELECT item_count FROM private_osint_ring_cardinality_v1 WHERE single=1)-"+4000));
 assert.ok(!worker.includes("SELECT COUNT(*) FROM private_osint_news_25h"));
 const queryPlan=db.prepare("EXPLAIN QUERY PLAN "+compact).all().map(x=>x.detail).join("|");
 assert.match(queryPlan,/idx_private_osint_news_clock/);
 db.exec(compact);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM private_osint_news_25h").get().n,4000);
 assert.equal(db.prepare("SELECT item_count FROM private_osint_ring_cardinality_v1").get().item_count,4000);
 assert.equal(db.prepare("SELECT first_seen_at FROM private_osint_news_25h WHERE item_id=?").get("004007").first_seen_at,"FIRST");
 db.exec(compact);
 assert.equal(db.prepare("SELECT item_count FROM private_osint_ring_cardinality_v1").get().item_count,4000);
 db.close();
});
test("rollback never leaves lying cardinality or an uncommitted private record",()=>{
 const db=dbWithRing(5);db.exec("BEGIN");
 db.prepare("INSERT INTO private_osint_news_25h VALUES (?,?,?)").run("NEW","2026-10-27T00:00:00Z","FIRST");
 assert.equal(db.prepare("SELECT item_count FROM private_osint_ring_cardinality_v1").get().item_count,6);
 db.exec("ROLLBACK");
 assert.equal(db.prepare("SELECT item_count FROM private_osint_ring_cardinality_v1").get().item_count,5);
 assert.equal(db.prepare("SELECT 1 FROM private_osint_news_25h WHERE item_id='NEW'").get(),undefined);
 db.close();
});
