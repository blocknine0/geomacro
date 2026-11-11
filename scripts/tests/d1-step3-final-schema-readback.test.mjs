import {test} from "node:test";
import assert from "node:assert/strict";
import {
 STEP3_FINAL_TABLES,verifyStep3FinalTableColumns,
 verifyStep3FinalProductionReadback
} from "../lib/d1-step3-final-schema-readback.mjs";
import {
 step3SqlManifests,step3NativeHistorySQL,step3SchemaSQL
} from "../lib/d1-step3-migration-contract.mjs";
import {readStep3LedgerSQL} from "../lib/d1-step3-migration-ledger.mjs";

const manifests=step3SqlManifests();
const now="2026-11-11T12:00:00.000Z";
const native=manifests.map((m,i)=>({
 id:i+1,name:m.filename,applied_at:now
}));
const ledger=manifests.map(m=>({
 migration_id:m.id,sql_sha256:m.sql_sha256,status:"VERIFIED",
 started_at:now,finished_at:now,duration_ms:1
}));
const schema=new Map(manifests.map(m=>[
 step3SchemaSQL(m.objects),
 Object.entries(m.objects).map(([name,type])=>({
  name,type,sql:"CREATE "+type.toUpperCase()+" "+name+" CHECK (1=1)"
 }))
]));
function reader(tamper=()=>{}){
 const queries=[];
 const query=(sql,{maxRows})=>{
  queries.push(sql);
  let rows;
  if(sql===step3NativeHistorySQL())rows=native.map(x=>({...x}));
  else if(sql===readStep3LedgerSQL())rows=ledger.map(x=>({...x}));
  else if(schema.has(sql))rows=schema.get(sql).map(x=>({...x}));
  else {
   const found=/^PRAGMA table_info\('([a-z0-9_]+)'\)$/u.exec(sql);
   const expected=Object.values(STEP3_FINAL_TABLES)
    .find(x=>x.table===found?.[1]);
   if(!expected)throw Error("unreviewed query: "+sql);
   rows=expected.columns.map((c,cid)=>({cid,...c}));
  }
  rows=tamper(sql,rows.map(x=>({...x})));
  assert.ok(rows.length<=maxRows,"query violated per-call row ceiling");
  return {rows,readRows:rows.length};
 };
 return {query,queries};
}
test("physical final readback makes ten fresh calls for all four migrations",()=>{
 const r=reader();
 const result=verifyStep3FinalProductionReadback({manifests,query:r.query});
 assert.equal(result.status,
  "PASS_REAL_PRODUCTION_FOUR_MIGRATIONS_DIRECT_SCHEMA_READBACK");
 assert.deepEqual(result.migration_ids,["0204","0211","0212","0213"]);
 assert.equal(result.tables.length,4);
 assert.equal(result.tables[3].columns_verified,15);
 assert.equal(result.readback_queries,10);
 assert.equal(r.queries.length,10);
});
test("native history and ledger are separately required and SHA-pinned",()=>{
 const variants=[
  (sql,rows)=>sql===step3NativeHistorySQL()?rows.slice(0,3):rows,
  (sql,rows)=>sql===readStep3LedgerSQL()?rows.slice(0,3):rows,
  (sql,rows)=>sql===readStep3LedgerSQL()?
   rows.map(x=>x.migration_id==="0213"?{...x,sql_sha256:"0".repeat(64)}:x):rows,
  (sql,rows)=>sql===readStep3LedgerSQL()?
   rows.map(x=>x.migration_id==="0212"?{...x,status:"APPLIED"}:x):rows
 ];
 for(const tamper of variants){
  const r=reader(tamper);
  assert.throws(()=>verifyStep3FinalProductionReadback({
   manifests,query:r.query
  }),/STEP3_/u);
 }
});
test("missing 0213 column, changed 0212 primary key or object causes HOLD",()=>{
 const variants=[
  (sql,rows)=>sql==="PRAGMA table_info('phase2h_raw_object_refs_v1')"?
   rows.slice(0,-1):rows,
  (sql,rows)=>sql==="PRAGMA table_info('phase2h_pending_hourly_v1')"?
   rows.map(x=>x.name==="hour_utc"?{...x,pk:0}:x):rows,
  (sql,rows)=>sql===step3SchemaSQL(manifests[0].objects)?
   rows.slice(0,-1):rows,
  (sql,rows)=>sql==="PRAGMA table_info('materialized_cache')"?
   rows.map(x=>x.name==="key"?{...x,type:"INTEGER"}:x):rows
 ];
 for(const tamper of variants){
  const r=reader(tamper);
  assert.throws(()=>verifyStep3FinalProductionReadback({
   manifests,query:r.query
  }),/STEP3_/u);
 }
});
test("missing direct provider metering or an unexpected column is a HOLD",()=>{
 const r=reader();
 assert.throws(()=>verifyStep3FinalProductionReadback({
  manifests,query:(sql,options)=>({...r.query(sql,options),readRows:null})
 }),/STEP3_FINAL_READBACK_DIRECT_PROVIDER_READBACK_INVALID/u);
 const expected=STEP3_FINAL_TABLES["0213"];
 const good=expected.columns.map((c,cid)=>({cid,...c}));
 assert.throws(()=>verifyStep3FinalTableColumns(expected,[
  ...good,{cid:15,name:"unexpected",type:"TEXT",notnull:0,pk:0}
 ]),/COLUMN_COUNT/u);
});
