import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";

const migration=readFileSync(new URL(
 "../../workers/control-plane/migrations/0211_p0b_daily_committed_count.sql",import.meta.url),"utf8");
const runtime=readFileSync(new URL(
 "../../src/workers/backlog-drain-cron.ts",import.meta.url),"utf8");

const DAY1="2026-11-07",DAY2="2026-11-08";
const at=(day,h="04")=>day+"T"+h+":15:00.000Z";
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec("CREATE TABLE ingestion_spool_queue(id TEXT PRIMARY KEY,d1_committed_at TEXT);");
 return db;
}
function assertExact(db){
 const expected=db.prepare("SELECT substr(d1_committed_at,1,10) day_utc,COUNT(*) n "+
  "FROM ingestion_spool_queue WHERE d1_committed_at IS NOT NULL "+
  "GROUP BY substr(d1_committed_at,1,10) ORDER BY day_utc").all();
 const actual=db.prepare("SELECT day_utc,committed_count n FROM p0b_committed_day_totals "+
  "WHERE committed_count>0 ORDER BY day_utc").all();
 assert.deepEqual(actual,expected);
}
test("P0B daily count is backfilled once and maintained exactly by D1 triggers",()=>{
 const db=fixture();
 try{
  const put=db.prepare("INSERT INTO ingestion_spool_queue(id,d1_committed_at) VALUES(?,?)");
  put.run("old1",at(DAY1));put.run("old2",at(DAY1,"05"));
  put.run("old3",at(DAY2));put.run("pending",null);
  db.exec(migration);
  assertExact(db);
  assert.equal(db.prepare("SELECT committed_count FROM p0b_committed_day_totals WHERE day_utc=?")
   .get(DAY1).committed_count,2);
  db.prepare("UPDATE ingestion_spool_queue SET d1_committed_at=? WHERE id='pending'")
   .run(at(DAY1,"06"));
  assertExact(db);
  db.prepare("UPDATE ingestion_spool_queue SET d1_committed_at=? WHERE id='old1'")
   .run(at(DAY2));
  assertExact(db);
  db.prepare("UPDATE ingestion_spool_queue SET d1_committed_at=NULL WHERE id='old2'").run();
  assertExact(db);
  db.prepare("DELETE FROM ingestion_spool_queue WHERE id='old3'").run();
  assertExact(db);
  put.run("new",at(DAY2,"08"));
  db.prepare("UPDATE ingestion_spool_queue SET d1_committed_at=? WHERE id='new'")
   .run(at(DAY2,"09"));
  assertExact(db);
  db.exec(migration);
  assertExact(db);
 }finally{db.close()}
});
test("invalid committed day rolls back candidate insert rather than corrupting the counter",()=>{
 const db=fixture();
 try{
  db.exec(migration);
  assert.throws(()=>db.prepare("INSERT INTO ingestion_spool_queue VALUES (?,?)")
   .run("invalid","not-an-iso-clock"),/CHECK constraint/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM ingestion_spool_queue").get().n,0);
  assertExact(db);
 }finally{db.close()}
});
test("live backlog gate never repeats legacy committed COUNT and fails closed when counter absent",()=>{
 assert.ok(runtime.includes("SELECT committed_count AS committed_today FROM p0b_committed_day_totals WHERE day_utc=?"));
 assert.ok(!runtime.includes("SELECT COUNT(*) AS committed_today FROM ingestion_spool_queue"));
 assert.ok(runtime.includes("D1_QUOTA_STATUS_UNAVAILABLE"));
 assert.ok(runtime.includes("count.committed_today>=90000"));
 assert.ok(migration.includes("CREATE TRIGGER IF NOT EXISTS trg_p0b_day_committed_clock_change"));
 assert.ok(!migration.includes("DROP TABLE ingestion_spool_queue"));
});
