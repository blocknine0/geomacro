import test from "node:test";
import assert from "node:assert/strict";
import {
 STEP3_0204_EXPECTED_EXISTING_INDEXES,STEP3_0212_ADDITIVE_INDEX_LINEAGE,
 admitStep30204SupportedIntegrity
} from "../lib/d1-step3-supported-integrity.mjs";

const tables=Object.keys(STEP3_0204_EXPECTED_EXISTING_INDEXES);
const fixture=(future=false)=>tables.map(table=>{
 const indexes=[...STEP3_0204_EXPECTED_EXISTING_INDEXES[table],
  ...(future?STEP3_0212_ADDITIVE_INDEX_LINEAGE[table]:[])];
 return {table,status:"PASS_D1_SUPPORTED_QUICK_FK_ALL_INDEX_LOGICAL_PROOF",
  total_existing_indexes:indexes.length,
  index_proofs:indexes.map(index=>({
   index,status:"PASS_BOUNDED_FULL_INDEX_KEY_AND_ROW_PARITY",
   rows_compared:3,unique_verified:index.startsWith("sqlite_autoindex_")
  })),
  all_indexes_including_unique_considered:true,
  real_sqlite_integrity_check_claimed:false,
  physical_file_integrity_claimed:false,
  raw_private_content_exposed:false};
});
test("real Shadow 0204 12-index proof remains unchanged and certified",()=>{
 const p=admitStep30204SupportedIntegrity(fixture());
 assert.equal(p.existing_index_count,12);
 assert.equal(p.status,"PASS_D1_SUPPORTED_0204_THREE_TABLE_TWELVE_INDEX_INTEGRITY");
 assert.equal(p.index_lineage,"0204_ONLY");
 assert.equal(p.production_release_authorized,false);
});
test("both exact reviewed 0212 additive v3 indexes keep future 0204 readback valid",()=>{
 const p=admitStep30204SupportedIntegrity(fixture(true));
 assert.equal(p.existing_index_count,14);
 assert.equal(p.status,"PASS_D1_SUPPORTED_0204_PLUS_0212_FOURTEEN_INDEX_LOGICAL_INTEGRITY");
 assert.equal(p.index_lineage,"0204_PLUS_REVIEWED_0212_ADDITIVE_PAIR");
 assert.equal(p.all_0212_v3_additive_index_memberships_verified,true);
 assert.equal(p.later_0212_ledger_verified,false);
 assert.equal(p.later_0212_native_migration_history_verified,false);
 assert.equal(p.production_release_authorized,false);
});
test("half-applied 13-index state, duplicate, tampered or unknown index FAIL CLOSED",()=>{
 const full=fixture(true);
 assert.throws(()=>admitStep30204SupportedIntegrity(full.map((p,i)=>{
  if(i!==2)return p;
  return {...p,total_existing_indexes:p.total_existing_indexes-1,
   index_proofs:p.index_proofs.slice(0,-1)};
 })),/0204_EXACT_INDEX_CARDINALITY_UNVERIFIED/);
 assert.throws(()=>admitStep30204SupportedIntegrity(full.map((p,i)=>
  i!==0?p:{...p,index_proofs:p.index_proofs.map((x,j)=>
   j===0?{...x,index:"idx_wrong_substitution"}:x)})),/0204_INDEX_REGISTRY_OR_ROW_PARITY_UNVERIFIED/);
 assert.throws(()=>admitStep30204SupportedIntegrity(full.map((p,i)=>
  i!==0?p:{...p,index_proofs:p.index_proofs.map((x,j)=>
   j===0?{...x,rows_compared:0}:x)})),/0204_INDEX_REGISTRY_OR_ROW_PARITY_UNVERIFIED/);
 assert.throws(()=>admitStep30204SupportedIntegrity(full.map((p,i)=>
  i!==1?p:{...p,index_proofs:p.index_proofs.map(x=>
   ({...x,unique_verified:false}))})),/0204_UNIQUE_INDEX_PROOF_REQUIRED/);
 assert.throws(()=>admitStep30204SupportedIntegrity(full.map((p,i)=>
  i!==0?p:{...p,real_sqlite_integrity_check_claimed:true})),/0204_TABLE_SUPPORTED_PROOF_UNVERIFIED/);
});
