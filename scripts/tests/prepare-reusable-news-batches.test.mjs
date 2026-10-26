import test from "node:test";
import assert from "node:assert/strict";
import {prepareReusableNewsBatches,REUSABLE_BATCH_LIMITS} from "../lib/prepare-reusable-news-batches.mjs";

const schema="geomacro.reusable-source-news-batch.v1";
const sized={schema,items:Array.from({length:95},(_,i)=>({id:"news-"+i.toString(16).padStart(64,"0"),text:"x".repeat(1000)})),
  checks:Array.from({length:123},(_,i)=>({source_ref:i.toString(16).padStart(64,"0"),category:"macro",state:"OBSERVED"}))};
test("maximal bounded D1 packet fills 40/48, never drops",()=>{
 const plan=prepareReusableNewsBatches(sized);
 assert.equal(plan.sent_items,95);
 assert.equal(plan.sent_checks,123);
 assert.equal(plan.dropped_items,0);
 assert.equal(plan.dropped_checks,0);
 assert.ok(plan.batches[0].items.length===40);
 assert.ok(plan.batches[0].checks.length===48);
 assert.ok(plan.batches.length<=4);
 for(const batch of plan.batches){
   assert.ok(batch.items.length<=40);
   assert.ok(batch.checks.length<=48);
   assert.ok(new TextEncoder().encode(JSON.stringify(batch)).byteLength<=REUSABLE_BATCH_LIMITS.bytes);
 }
 assert.deepEqual(plan.batches.flatMap(x=>x.items),sized.items);
 assert.deepEqual(plan.batches.flatMap(x=>x.checks),sized.checks);
});
test("near-Worker-maximum 2400-byte news records split by UTF-8 limit",()=>{
 const rows=Array.from({length:40},(_,i)=>({id:i,excerpt:"🚨".repeat(550)}));
 const data=prepareReusableNewsBatches({schema,items:rows,checks:[]});
 assert.ok(data.batches.length>1);
 assert.equal(data.sent_items,40);
 assert.deepEqual(data.batches.flatMap(g=>g.items),rows);
});
test("oversized single item or malformed empty request cannot silently disappear",()=>{
 assert.throws(()=>prepareReusableNewsBatches({schema,items:[],checks:[]}),/INPUT_INVALID/);
 assert.throws(()=>prepareReusableNewsBatches({schema,items:[{payload:"x".repeat(65000)}],checks:[]}),/SINGLE_RECORD_OVERSIZE/);
 assert.throws(()=>prepareReusableNewsBatches({schema:"other",items:[1],checks:[]}),/INPUT_INVALID/);
});
