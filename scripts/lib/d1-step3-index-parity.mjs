/**
 * Strict, bounded, read-only D1 table-vs-forced-covering-index comparison.
 * Logical row/key parity is NOT PRAGMA integrity_check and does not attest
 * unrelated existing indexes, freshness or the truth of OSINT originals.
 * Raw/private rows and their hashes must never appear in provider receipts.
 */
import {createHash} from "node:crypto";
export const STEP3_INDEX_PARITY_ROW_CAP=3000;
export const STEP3_INDEX_PARITY_SPECS=Object.freeze({
 idx_private_osint_country_category_clock_v2:{table:"private_osint_news_25h",columns:["country_iso3","category","native_feed_published_at","item_id"]},
 idx_private_osint_check_category_status_v2:{table:"private_osint_source_checks_24h",columns:["category","checked_at","source_ref","state"]},
 idx_website_derived_hot_order_v2:{table:"website_derived_intelligence",columns:["published_at","id","first_seen_at"]},
 idx_private_osint_country_clock_v3:{table:"private_osint_news_25h",columns:["country_iso3","native_feed_published_at","item_id"]},
 idx_website_derived_category_clock_v3:{table:"website_derived_intelligence",columns:["category","published_at","id"]},
 idx_phase2h_ref_object_key_v1:{table:"phase2h_raw_object_refs_v1",columns:["object_key","bundle_index"]},
 idx_phase2h_ref_country_category_clock_v1:{table:"phase2h_raw_object_refs_v1",columns:["risk_country_iso3","category","original_published_at","record_id"]},
 idx_phase2h_ref_ingest_clock_v1:{table:"phase2h_raw_object_refs_v1",columns:["first_ingested_at","record_id"]}
});
const fail=code=>{throw Error("STEP3_INDEX_PARITY_"+code);};
const safe=x=>typeof x==="string"&&/^[a-z][a-z0-9_]{1,75}$/u.test(x);
for(const [name,{table,columns}] of Object.entries(STEP3_INDEX_PARITY_SPECS)){
 if(!safe(name)||!safe(table)||!Array.isArray(columns)||columns.length===0||
    columns.some(x=>!safe(x)))fail("STATIC_CONTRACT_INVALID");
}
export function step3IndexParityQueries(index,cap=STEP3_INDEX_PARITY_ROW_CAP){
 const spec=STEP3_INDEX_PARITY_SPECS[index];
 if(!spec||cap!==STEP3_INDEX_PARITY_ROW_CAP)fail("UNREVIEWED_INDEX_OR_CAP");
 const projection=["rowid AS __rid",...spec.columns].join(",");
 const base="SELECT "+projection+" FROM "+spec.table+" NOT INDEXED LIMIT "+(cap+1);
 const indexed="SELECT "+projection+" FROM "+spec.table+
  " INDEXED BY "+index+" LIMIT "+(cap+1);
 return Object.freeze({index,table:spec.table,columns:spec.columns,
  baselineSQL:base,indexedSQL:indexed,
  baselinePlanSQL:"EXPLAIN QUERY PLAN "+base,
  indexedPlanSQL:"EXPLAIN QUERY PLAN "+indexed,cap});
}
export function parseStep3IndexD1ReadOnly(raw,maxRows=STEP3_INDEX_PARITY_ROW_CAP+1){
 let data;try{data=JSON.parse(raw)}catch{fail("PROVIDER_JSON_INVALID")}
 if(!Array.isArray(data)||data.length!==1||data[0]?.success!==true||
    !Array.isArray(data[0]?.results)||data[0].results.length>maxRows||
    !Number.isSafeInteger(data[0]?.meta?.rows_read)||data[0].meta.rows_read<0||
    data[0].meta.rows_written!==0)fail("PROVIDER_READ_META_UNVERIFIED");
 return {rows:data[0].results,rowsRead:data[0].meta.rows_read};
}
function canonicalRows(rows,columns,cap){
 if(!Array.isArray(rows)||rows.length>cap)fail("BOUNDED_ROW_CAP_EXCEEDED");
 const seen=new Set();
 const normalized=rows.map(x=>{
  if(!x||typeof x!=="object"||Array.isArray(x)||
     !Number.isSafeInteger(x.__rid)||seen.has(x.__rid))fail("ROWID_INVALID_OR_DUPLICATE");
  seen.add(x.__rid);const out=[x.__rid];
  for(const col of columns){
   if(!Object.prototype.hasOwnProperty.call(x,col))fail("PROJECTION_INCOMPLETE");
   const val=x[col];
   if(val!==null&&typeof val!=="string"&&
      (typeof val!=="number"||!Number.isFinite(val)))fail("PROJECTION_VALUE_INVALID");
   out.push(val);
  }
  return out;
 });
 normalized.sort((a,b)=>a[0]-b[0]);
 return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
export function verifyStep3IndexParity({index,baselineBefore,indexRows,baselineAfter,
 baselinePlan,indexPlan,cap=STEP3_INDEX_PARITY_ROW_CAP}={}){
 const queries=step3IndexParityQueries(index,cap);
 if(!Array.isArray(baselinePlan)||!Array.isArray(indexPlan)||
    !baselinePlan.some(r=>typeof r?.detail==="string"&&
       /\bSCAN\b/iu.test(r.detail)&&!r.detail.includes("INDEX"))||
    !indexPlan.some(r=>typeof r?.detail==="string"&&
       r.detail.includes("USING COVERING INDEX "+index)))
  fail("PHYSICAL_EXPLAIN_PROOF_MISSING");
 if(!Array.isArray(baselineBefore)||!Array.isArray(indexRows)||
    !Array.isArray(baselineAfter)||
    baselineBefore.length!==indexRows.length||
    baselineBefore.length!==baselineAfter.length)fail("ROWSET_CARDINALITY_MISMATCH");
 const before=canonicalRows(baselineBefore,queries.columns,cap),
  indexed=canonicalRows(indexRows,queries.columns,cap),
  after=canonicalRows(baselineAfter,queries.columns,cap);
 if(before!==after)fail("CONCURRENT_SOURCE_CHANGE_DETECTED");
 if(before!==indexed)fail("FORCED_COVERING_INDEX_ROW_KEY_MISMATCH");
 return Object.freeze({index,table:queries.table,
  status:"PASS_BOUNDED_FULL_LOGICAL_INDEX_KEY_PARITY",
  complete_bounded_rowset_verified:true,
  original_table_scan_verified:true,forced_covering_index_scan_verified:true,
  double_read_stable:true,rows_compared:baselineBefore.length,cap,
  no_private_row_content_logged:true,sqlite_full_integrity_check_claimed:false,
  all_other_existing_indexes_verified:false});
}
