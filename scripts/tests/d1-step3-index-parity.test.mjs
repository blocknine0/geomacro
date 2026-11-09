import {test} from "node:test";
import assert from "node:assert/strict";
import {STEP3_INDEX_PARITY_ROW_CAP,STEP3_INDEX_PARITY_SPECS,
 step3IndexParityQueries,parseStep3IndexD1ReadOnly,verifyStep3IndexParity}
 from "../lib/d1-step3-index-parity.mjs";
const index="idx_website_derived_hot_order_v2";
const make=(rid,published,id,first)=>({__rid:rid,published_at:published,id,first_seen_at:first});
const before=[make(2,"2026-11-08",2,"2026-11-08"),make(1,"2026-11-07",1,"2026-11-07")];
const baselinePlan=[{detail:"SCAN website_derived_intelligence"}];
const indexedPlan=[{detail:"SCAN website_derived_intelligence USING COVERING INDEX "+index}];
const valid={index,baselineBefore:before,indexRows:[...before].reverse(),baselineAfter:before,
 baselinePlan,indexPlan:indexedPlan};
test("only eight reviewed indexes, bounded fixed read-only SQL",()=>{
 assert.equal(Object.keys(STEP3_INDEX_PARITY_SPECS).length,8);
 for(const i of Object.keys(STEP3_INDEX_PARITY_SPECS)){
  const q=step3IndexParityQueries(i);
  assert.equal(q.cap,STEP3_INDEX_PARITY_ROW_CAP);
  assert.match(q.baselineSQL,/ NOT INDEXED LIMIT 3001$/u);
  assert.match(q.indexedSQL,/ INDEXED BY idx_[a-z0-9_]+ LIMIT 3001$/u);
  assert.match(q.indexedPlanSQL,/^EXPLAIN QUERY PLAN SELECT/u);
  assert.doesNotMatch(q.baselineSQL+q.indexedSQL,/\b(?:INSERT|UPDATE|DROP|DELETE|PRAGMA)\b/iu);
 }
 assert.throws(()=>step3IndexParityQueries("idx_unapproved"),/UNREVIEWED_INDEX/u);
 assert.throws(()=>step3IndexParityQueries(index,3001),/UNREVIEWED_INDEX/u);
});
test("parse provider result only with strict zero-write native metadata",()=>{
 const ok=JSON.stringify([{success:true,results:before,meta:{rows_read:12,rows_written:0}}]);
 assert.equal(parseStep3IndexD1ReadOnly(ok).rows.length,2);
 for(const bad of [ok.replace('"rows_written":0','"rows_written":1'),
  "[]","invalid",JSON.stringify([{success:false,results:[],meta:{rows_read:1,rows_written:0}}])])
  assert.throws(()=>parseStep3IndexD1ReadOnly(bad),/STEP3_INDEX_PARITY_/u);
});
test("independent covering-index traversal equals full table row/keys",()=>{
 const v=verifyStep3IndexParity(valid);
 assert.equal(v.status,"PASS_BOUNDED_FULL_LOGICAL_INDEX_KEY_PARITY");
 assert.equal(v.rows_compared,2);
 assert.equal(v.sqlite_full_integrity_check_claimed,false);
});
test("reject index row/key drift and partial rowsets",()=>{
 assert.throws(()=>verifyStep3IndexParity({...valid,indexRows:[before[0],{...before[1],published_at:"wrong"}]}),/KEY_MISMATCH/u);
 assert.throws(()=>verifyStep3IndexParity({...valid,indexRows:[before[0]]}),/CARDINALITY/u);
});
test("detect concurrent writes and noncovering or not-table scans",()=>{
 assert.throws(()=>verifyStep3IndexParity({...valid,baselineAfter:[{...before[0],id:999},before[1]]}),/CONCURRENT_SOURCE_CHANGE/u);
 assert.throws(()=>verifyStep3IndexParity({...valid,indexPlan:[{detail:"SCAN table USING INDEX "+index}]}),/PHYSICAL_EXPLAIN/u);
 assert.throws(()=>verifyStep3IndexParity({...valid,baselinePlan:[{detail:"SCAN table USING INDEX foo"}]}),/PHYSICAL_EXPLAIN/u);
});
test("fail closed for duplicate/unsafe rowid, invalid columns and over-cap data",()=>{
 assert.throws(()=>verifyStep3IndexParity({...valid,indexRows:[before[0],before[0]]}),/DUPLICATE/u);
 assert.throws(()=>verifyStep3IndexParity({...valid,indexRows:[before[0],{...before[1],__rid:null}]}),/ROWID_INVALID/u);
 assert.throws(()=>verifyStep3IndexParity({...valid,indexRows:[before[0],{...before[1],first_seen_at:undefined}]}),/PROJECTION_VALUE_INVALID/u);
 assert.throws(()=>verifyStep3IndexParity({...valid,baselineBefore:Array(3001).fill(before[0]),indexRows:Array(3001).fill(before[0]),baselineAfter:Array(3001).fill(before[0])}),/BOUNDED_ROW_CAP/u);
});
test("an empty table proves empty row parity but never claims SQLite full integrity",()=>{
 const v=verifyStep3IndexParity({...valid,baselineBefore:[],indexRows:[],baselineAfter:[]});
 assert.equal(v.rows_compared,0);
 assert.equal(v.sqlite_full_integrity_check_claimed,false);
});
