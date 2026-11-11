/**
 * Fresh, same-target Cloudflare D1 production readback. This is deliberately
 * independent of earlier per-step receipts and cannot infer columns from
 * native migration history or from a signed JSON status.
 */
import {
 step3NativeHistorySQL,classifyStep3NativeHistory,
 step3SchemaSQL,verifyStep3Schema
} from "./d1-step3-migration-contract.mjs";
import {readStep3LedgerSQL,verifyStep3LedgerRows}
 from "./d1-step3-migration-ledger.mjs";

const IDS=Object.freeze(["0204","0211","0212","0213"]);
const fail=code=>{throw Error("STEP3_FINAL_READBACK_"+code)};
const fields=(table,columns)=>Object.freeze({
 table,columns:Object.freeze(columns.map(([name,type,notnull,pk])=>
  Object.freeze({name,type,notnull,pk})))
});
export const STEP3_FINAL_TABLES=Object.freeze({
 "0204":fields("materialized_cache",[
  ["key","TEXT",1,1],["payload","TEXT",1,0],["updated_at","INTEGER",1,0]
 ]),
 "0211":fields("p0b_committed_day_totals",[
  ["day_utc","TEXT",1,1],["committed_count","INTEGER",1,0]
 ]),
 "0212":fields("phase2h_pending_hourly_v1",[
  ["category","TEXT",1,1],["hour_utc","TEXT",1,2],
  ["pending_count","INTEGER",1,0]
 ]),
 "0213":fields("phase2h_raw_object_refs_v1",[
  ["record_id","TEXT",1,1],["category","TEXT",1,0],
  ["original_published_at","TEXT",1,0],["first_ingested_at","TEXT",1,0],
  ["raw_sha256","TEXT",1,0],["object_sha256","TEXT",1,0],
  ["object_key","TEXT",1,0],["bundle_bytes","INTEGER",1,0],
  ["record_sha256","TEXT",1,0],["record_bytes","INTEGER",1,0],
  ["bundle_index","INTEGER",1,0],["signed_at","TEXT",1,0],
  ["pointer_hmac_sha256","TEXT",1,0],["risk_country_iso3","TEXT",0,0],
  ["storage_backend","TEXT",1,0]
 ])
});
export function verifyStep3FinalTableColumns(expected,rows){
 if(!expected||!Array.isArray(rows)||
    rows.length!==expected.columns.length)
  fail("COLUMN_COUNT_OR_TABLE_MISMATCH");
 for(let i=0;i<rows.length;i++){
  const actual=rows[i],want=expected.columns[i];
  if(actual?.cid!==i||actual.name!==want.name||
     actual.type?.toUpperCase()!==want.type||
     actual.notnull!==want.notnull||actual.pk!==want.pk)
   fail("COLUMN_DEFINITION_OR_PRIMARY_KEY_DRIFT");
 }
 return Object.freeze({table:expected.table,columns_verified:rows.length});
}

/**
 * query(sql,{maxRows}) MUST issue a fresh --remote D1 query against the
 * already authenticated production binding; no local DB/mock is accepted by
 * the production caller. Tests inject a deterministic query implementation.
 */
export function verifyStep3FinalProductionReadback({manifests,query}={}){
 if(!Array.isArray(manifests)||
    manifests.map(m=>m.id).join(",")!==IDS.join(",")||
    typeof query!=="function")fail("INPUT_INVALID");
 let calls=0,providerRowsRead=0;
 const read=(sql,maxRows)=>{
  const result=query(sql,{maxRows});
  if(!result||!Array.isArray(result.rows)||
     !Number.isSafeInteger(result.readRows)||result.readRows<0||
     result.rows.length>maxRows)fail("DIRECT_PROVIDER_READBACK_INVALID");
  calls++;providerRowsRead+=result.readRows;
  if(!Number.isSafeInteger(providerRowsRead))fail("READBACK_METER_OVERFLOW");
  return result.rows;
 };
 const native=classifyStep3NativeHistory(manifests,
  read(step3NativeHistorySQL(),4));
 if(native.native_applied_ids.join(",")!==IDS.join(",")||
    native.pending_ids.length!==0)fail("NATIVE_HISTORY_FOUR_NOT_APPLIED");
 const ledger=verifyStep3LedgerRows(read(readStep3LedgerSQL(),4),manifests);
 if(ledger.size!==4)fail("LEDGER_FOUR_ROWS_MISSING");
 const tableReadbacks=[];
 for(const manifest of manifests){
  const row=ledger.get(manifest.id);
  if(row?.status!=="VERIFIED"||
     row.sql_sha256!==manifest.sql_sha256)
   fail("LEDGER_NOT_VERIFIED_OR_CHECKSUM_CHANGED");
  // Re-query ALL reviewed per-migration objects (including indices/triggers)
  // on D1 after the last migration, not from earlier cached receipts.
  verifyStep3Schema(manifest.objects,
   read(step3SchemaSQL(manifest.objects),30));
  const expected=STEP3_FINAL_TABLES[manifest.id];
  if(manifest.objects[expected.table]!=="table")
   fail("REVIEWED_MANIFEST_TABLE_DRIFT");
  const columns=read("PRAGMA table_info('"+expected.table+"')",
   expected.columns.length);
  tableReadbacks.push(verifyStep3FinalTableColumns(expected,columns));
 }
 if(tableReadbacks.length!==4||calls!==10)
  fail("FOUR_MIGRATION_READBACK_INCOMPLETE");
 return Object.freeze({
  status:"PASS_REAL_PRODUCTION_FOUR_MIGRATIONS_DIRECT_SCHEMA_READBACK",
  migration_ids:Object.freeze([...IDS]),
  tables:Object.freeze(tableReadbacks),
  native_history_directly_observed:true,
  ledger_four_checksums_and_verified_statuses:true,
  production_schema_and_columns_directly_observed:true,
  readback_queries:calls,provider_rows_read:providerRowsRead
 });
}
