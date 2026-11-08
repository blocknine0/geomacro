import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {PHASE2H_ARCHIVE_COUNTER_CENSUS_SQL,PHASE2H_ARCHIVE_HOT50_TOTALS_SQL}
 from "../../workers/control-plane/src/phase2h-archive-counter-census.mjs";

const fixture=()=>{
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync(new URL(
  "../../workers/control-plane/migrations/0035_phase2h_private_raw_news.sql",
  import.meta.url),"utf8"));
 const add=(n,category,ageHours=2,archived=false)=>{
  const date=new Date(Date.now()-ageHours*3600000).toISOString();
  const id=n.toString(16).padStart(64,"0");
  db.prepare("INSERT INTO phase2h_private_raw_news "+
   "(record_id,category,original_published_at,first_ingested_at,"+
   "raw_sha256,raw_json,b2_object_sha256,b2_archived_at) "+
   "VALUES(?,?,?,?,?,?,?,?)").run(id,category,date,date,
    (n+100).toString(16).padStart(64,"0"),"X".repeat(350),
    archived?"a".repeat(64):null,archived?date:null);
  return id;
 };
 return {db,add};
};
const counters=db=>db.prepare(
 "SELECT category,staged_count,archived_count FROM phase2h_archive_totals ORDER BY category").all().map(x=>({...x}));

test("0208 seeds existing immutable D1 raw originals and tracks insert/archive/delete atomically",()=>{
 const {db,add}=fixture();
 try{
  const a=add(1,"geopolitics",3);
  const b=add(2,"macro",97,true);
  db.exec(readFileSync(new URL(
   "../../workers/control-plane/migrations/0208_phase2h_atomic_archive_census.sql",
   import.meta.url),"utf8"));
  assert.deepEqual(counters(db),[
   {category:"geopolitics",staged_count:1,archived_count:0},
   {category:"macro",staged_count:1,archived_count:1},
   {category:"rare_earth",staged_count:0,archived_count:0},
  ]);
  const c=add(3,"rare_earth",1);
  db.prepare("UPDATE phase2h_private_raw_news SET b2_object_sha256=? "+
   "WHERE record_id=?").run("c".repeat(64),a);
  db.prepare("UPDATE phase2h_private_raw_news SET b2_object_sha256=NULL "+
   "WHERE record_id=?").run(b); // Detect even privileged unexpected ACK reversal.
  db.prepare("DELETE FROM phase2h_private_raw_news WHERE record_id=?").run(c);
  assert.deepEqual(counters(db),[
   {category:"geopolitics",staged_count:1,archived_count:1},
   {category:"macro",staged_count:1,archived_count:0},
   {category:"rare_earth",staged_count:0,archived_count:0},
  ]);
  assert.throws(()=>db.prepare("UPDATE phase2h_private_raw_news SET category='macro' "+
   "WHERE record_id=?").run(a),/PHASE2H_IMMUTABLE_CATEGORY/);
  db.prepare("DELETE FROM phase2h_private_raw_news WHERE record_id=?").run(a);
  assert.equal(counters(db)[0].staged_count,0);
  assert.equal(counters(db)[0].archived_count,0);
 }finally{db.close()}
});

test("0208 counter census equals full original category truth, with indexed only-recent pending",()=>{
 const {db,add}=fixture();
 try{
  add(1,"geopolitics",3,false);
  add(2,"geopolitics",96,false);
  add(3,"macro",120,true);
  add(4,"rare_earth",7,false);
  db.exec(readFileSync(new URL(
   "../../workers/control-plane/migrations/0208_phase2h_atomic_archive_census.sql",
   import.meta.url),"utf8"));
  db.exec(readFileSync(new URL(
   "../../workers/control-plane/migrations/0212_d1_keyset_hourly_pending_census.sql",
   import.meta.url),"utf8"));
  const all=db.prepare(PHASE2H_ARCHIVE_COUNTER_CENSUS_SQL).all();
  assert.equal(all.length,3);
  const raw=db.prepare("SELECT category,COUNT(*) AS staged,"+
   "SUM(CASE WHEN b2_object_sha256 IS NOT NULL THEN 1 ELSE 0 END) archived "+
   "FROM phase2h_private_raw_news GROUP BY category").all();
  for(const row of raw){
   const x=all.find(v=>v.category===row.category);
   assert.equal(x.staged,row.staged);
   assert.equal(x.archived,row.archived);
   assert.equal(x.pending,row.staged-row.archived);
  }
  assert.equal(all.find(x=>x.category==="geopolitics").pending_eligible_72h,1);
  assert.equal(all.find(x=>x.category==="geopolitics").pending_expired_72h,1);
  // Hour bucket + an indexed boundary-hour probe equals the original exact
  // 72h filter without scanning all eligible pending records each tick.
  const cutoff=db.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now','-72 hours') AS t").get().t;
  const canonical=db.prepare("SELECT category,COUNT(*) AS n "+
    "FROM phase2h_private_raw_news WHERE b2_object_sha256 IS NULL "+
    "AND first_ingested_at>? GROUP BY category").all(cutoff);
  for(const row of canonical)
   assert.equal(all.find(x=>x.category===row.category).pending_eligible_72h,row.n);
  const summary=db.prepare(PHASE2H_ARCHIVE_HOT50_TOTALS_SQL).get();
  assert.deepEqual({...summary},{categories:3,total:4,unarchived:3});
  const explain=db.prepare("EXPLAIN QUERY PLAN "+PHASE2H_ARCHIVE_COUNTER_CENSUS_SQL).all();
  assert.ok(explain.some(x=>
    /idx_phase2h_pending_recent_ingested_category/u.test(x.detail)),
   JSON.stringify(explain));
  // Re-applying a migration must never double count preexisting rows.
  db.exec(readFileSync(new URL(
   "../../workers/control-plane/migrations/0208_phase2h_atomic_archive_census.sql",
   import.meta.url),"utf8"));
  db.exec(readFileSync(new URL(
   "../../workers/control-plane/migrations/0212_d1_keyset_hourly_pending_census.sql",
   import.meta.url),"utf8"));
  assert.deepEqual(db.prepare(PHASE2H_ARCHIVE_HOT50_TOTALS_SQL).get(),summary);
  db.prepare("DELETE FROM phase2h_archive_totals WHERE category='rare_earth'").run();
  assert.equal(db.prepare(PHASE2H_ARCHIVE_HOT50_TOTALS_SQL).get().categories,2);
 }finally{db.close()}
});

test("0212 exact pending hour counters track inserts, B2 ACK/reversal and deletions",()=>{
 const {db,add}=fixture();
 try{
  db.exec(readFileSync(new URL(
   "../../workers/control-plane/migrations/0208_phase2h_atomic_archive_census.sql",
   import.meta.url),"utf8"));
  db.exec(readFileSync(new URL(
   "../../workers/control-plane/migrations/0212_d1_keyset_hourly_pending_census.sql",
   import.meta.url),"utf8"));
  const id=add(211,"macro",0.4,false);
  const hour=db.prepare("SELECT substr(first_ingested_at,1,13) AS h FROM phase2h_private_raw_news WHERE record_id=?").get(id).h;
  const pending=()=>db.prepare("SELECT pending_count FROM phase2h_pending_hourly_v1 WHERE category='macro' AND hour_utc=?").get(hour).pending_count;
  assert.equal(pending(),1);
  db.prepare("UPDATE phase2h_private_raw_news SET b2_object_sha256=? WHERE record_id=?").run("c".repeat(64),id);
  assert.equal(pending(),0);
  db.prepare("UPDATE phase2h_private_raw_news SET b2_object_sha256=NULL WHERE record_id=?").run(id);
  assert.equal(pending(),1);
  assert.throws(()=>db.prepare("UPDATE phase2h_private_raw_news SET first_ingested_at=? WHERE record_id=?").run("2026-09-01T00:00:00.000Z",id),/PHASE2H_IMMUTABLE_FIRST_INGESTION/);
  db.prepare("DELETE FROM phase2h_private_raw_news WHERE record_id=?").run(id);
  assert.equal(pending(),0);
 }finally{db.close()}
});
