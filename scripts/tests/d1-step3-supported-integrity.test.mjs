import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditStep3AllIndexes,step3AllIndexDescriptor,verifyStep3AllIndex,
 STEP3_ALL_INDEX_MAX_ROWS} from "../lib/d1-step3-supported-integrity.mjs";
const index={seq:0,name:"idx_sample_unique",unique:1,origin:"c",partial:0};
const xinfo=[
 {seqno:0,cid:1,name:"category",desc:0,coll:"NOCASE",key:1},
 {seqno:1,cid:-1,name:null,desc:0,coll:"BINARY",key:0}
];
const rows=[
 {__audit_rowid:1,__audit_key_0:"macro"},
 {__audit_rowid:2,__audit_key_0:"geopolitics"}
];
const descriptor=step3AllIndexDescriptor("sample",index,xinfo);
const good={
 descriptor,tableBefore:rows,indexRows:[...rows].reverse(),
 tableAfter:rows,tablePlan:[{detail:"SCAN sample"}],
 indexPlan:[{detail:"SCAN sample USING COVERING INDEX idx_sample_unique"}],
 uniqueViolations:[]
};
function mock(overrides={}){
 return (sql,maxRows)=>{
  assert.ok(Number.isInteger(maxRows)&&maxRows>0);
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|ATTACH|VACUUM|REINDEX)\b/iu);
  let data;
  if(sql.startsWith("PRAGMA quick_check("))data=[{quick_check:"ok"}];
  else if(sql.startsWith("PRAGMA foreign_key_check("))data=[];
  else if(sql.startsWith("PRAGMA index_list("))data=[index];
  else if(sql.startsWith("PRAGMA index_xinfo("))data=xinfo;
  else if(sql.startsWith("EXPLAIN QUERY PLAN SELECT")&&sql.includes("INDEXED BY"))
   data=[{detail:"SCAN sample USING COVERING INDEX idx_sample_unique"}];
  else if(sql.startsWith("EXPLAIN QUERY PLAN SELECT"))
   data=[{detail:"SCAN sample"}];
  else if(sql.includes("GROUP BY"))data=[];
  else if(sql.startsWith("SELECT rowid AS __audit_rowid"))data=rows;
  else throw Error("UNEXPECTED_SQL");
  const match=Object.keys(overrides).find(x=>sql.startsWith(x));
  return match?overrides[match]:data;
 };
}
test("D1-supported all-index proof includes strict every-index registry and UNIQUE/FK validation",()=>{
 const out=auditStep3AllIndexes("sample",mock());
 assert.equal(out.status,"PASS_D1_SUPPORTED_QUICK_FK_ALL_INDEX_LOGICAL_PROOF");
 assert.equal(out.total_existing_indexes,1);
 assert.equal(out.index_proofs[0].unique_verified,true);
 assert.equal(out.index_proofs[0].rows_compared,2);
 assert.equal(out.real_sqlite_integrity_check_claimed,false);
 assert.equal(out.physical_file_integrity_claimed,false);
 assert.equal(out.raw_private_content_exposed,false);
 assert.match(descriptor.uniqueSQL,/COLLATE NOCASE/);
 assert.match(descriptor.uniqueSQL,/IS NOT NULL/);
 assert.match(descriptor.indexQuery,/INDEXED BY "idx_sample_unique" LIMIT 3001$/);
 assert.equal(STEP3_ALL_INDEX_MAX_ROWS,3000);
});
test("fail closed on missing/unsupported index metadata and SQL injection",()=>{
 assert.throws(()=>step3AllIndexDescriptor("table; DROP TABLE x",index,xinfo),/IDENTIFIER_UNVERIFIED/);
 assert.throws(()=>step3AllIndexDescriptor("sample",{...index,partial:1},xinfo),/PARTIAL_OR_INDEX_METADATA_UNSUPPORTED/);
 assert.throws(()=>step3AllIndexDescriptor("sample",index,
  [{...xinfo[0],cid:-2},xinfo[1]]),/EXPRESSION_COLLATION_OR_KEY_UNSUPPORTED/);
 assert.throws(()=>step3AllIndexDescriptor("sample",index,
  [{...xinfo[0],coll:"UNREVIEWED"},xinfo[1]]),/EXPRESSION_COLLATION_OR_KEY_UNSUPPORTED/);
 assert.throws(()=>step3AllIndexDescriptor("sample",index,[]),/XINFO_UNVERIFIED/);
});
test("corrupt index, duplicate UNIQUE keys and concurrent writes are never accepted",()=>{
 assert.throws(()=>verifyStep3AllIndex({...good,
  indexRows:[{...rows[0],__audit_key_0:"wrong"},rows[1]]}),/INDEX_KEY_ROW_PARITY_MISMATCH/);
 assert.throws(()=>verifyStep3AllIndex({...good,
  tableAfter:[{...rows[0],__audit_key_0:"changed"},rows[1]]}),/CONCURRENT_TABLE_CHANGE/);
 assert.throws(()=>verifyStep3AllIndex({...good,uniqueViolations:[{duplicate:1}]}),/UNIQUE_CONSTRAINT_UNVERIFIED/);
 assert.throws(()=>verifyStep3AllIndex({...good,indexPlan:[{detail:"SCAN sample USING INDEX idx_sample_unique"}]}),/COVERING_EXPLAIN_UNVERIFIED/);
 assert.throws(()=>verifyStep3AllIndex({...good,tableBefore:[],indexRows:[],tableAfter:[]}),/NONEMPTY_REPRESENTATIVE_ROWS_REQUIRED/);
 assert.throws(()=>verifyStep3AllIndex({...good,tableBefore:Array(3001).fill(rows[0]),
  indexRows:Array(3001).fill(rows[0]),tableAfter:Array(3001).fill(rows[0])}),/ROW_CAP_EXCEEDED/);
});
test("audit refuses failed quick_check, foreign key violations and drifting index registry",()=>{
 assert.throws(()=>auditStep3AllIndexes("sample",mock({"PRAGMA quick_check(":[{quick_check:"broken"}]})),/TABLE_QUICK_CHECK_NOT_OK/);
 assert.throws(()=>auditStep3AllIndexes("sample",mock({"PRAGMA foreign_key_check(":[{table:"sample",rowid:1}]})),/FOREIGN_KEY_VIOLATION/);
 assert.throws(()=>auditStep3AllIndexes("sample",mock({"PRAGMA index_xinfo(":[{seqno:0,cid:-2,name:null,key:1}]})),/XINFO_UNVERIFIED/);
});
test("Shadow workflow retains immutable main, Paid headroom, no SQL writes and observational receipt",()=>{
 const run=readFileSync("scripts/ops/step3-shadow-0204-readonly-diagnostic.mjs","utf8");
 const flow=readFileSync(".github/workflows/step3-shadow-0204-readonly-diagnostic.yml","utf8");
 assert.match(run,/auditStep3AllIndexes/u);
 assert.match(run,/d1_supported_all_existing_indexes_PASS/u);
 assert.match(run,/sqlite_full_integrity_check_claimed=false/u);
 assert.match(run,/index_parity_bounded_0204_PASS/u);
 assert.match(run,/production_sql_mutated:false/u);
 assert.match(flow,/git ls-remote https:\/\/github.com\/blocknine0\/geomacro.git refs\/heads\/main/u);
 assert.match(flow,/node scripts\/ops\/check-d1-paid-monthly-headroom.mjs --check/u);
 assert.doesNotMatch(run+flow,/run-step3-protected-d1-migrations\.mjs --apply/u);
});
