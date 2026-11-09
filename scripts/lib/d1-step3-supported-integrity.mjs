/**
 * D1-supported, bounded, fail-closed logical audit of EVERY index on a table.
 *
 * Does not claim PRAGMA integrity_check or SQLite file/page validation.
 * This is a separate proof from PRAGMA quick_check, and never substitutes a
 * missing index, an unsupported partial/expression index, or an empty fixture.
 * Provider rows/private values remain in process memory; receipt is metadata.
 */
import {createHash} from "node:crypto";

export const STEP3_ALL_INDEX_MAX_ROWS=3000;
export const STEP3_ALL_INDEX_MAX_PER_TABLE=48;
const ID=/^[A-Za-z_][A-Za-z0-9_]{0,95}$/u;
const fail=s=>{throw Error("STEP3_ALL_INDEX_"+s)};
const ident=s=>{if(typeof s!=="string"||!ID.test(s))fail("IDENTIFIER_UNVERIFIED");return '"'+s+'"';};
const normalize=(rows,cols)=>{
 if(!Array.isArray(rows)||rows.length===0)fail("NONEMPTY_REPRESENTATIVE_ROWS_REQUIRED");
 if(rows.length>STEP3_ALL_INDEX_MAX_ROWS)fail("ROW_CAP_EXCEEDED");
 const seen=new Set();
 const clean=rows.map(r=>{
  const id=r?.__audit_rowid;
  if(!Number.isSafeInteger(id)||seen.has(id))fail("ROWID_INVALID_OR_DUPLICATE");
  seen.add(id);
  return [id,...cols.map((_,i)=>{
   const key="__audit_key_"+i;
   if(!Object.hasOwn(r,key))fail("PROJECTION_INCOMPLETE");
   const v=r[key];
   if(v!==null&&typeof v!=="string"&&
       (typeof v!=="number"||!Number.isFinite(v)))fail("UNSUPPORTED_VALUE");
   return v;
  })];
 });
 clean.sort((a,b)=>a[0]-b[0]);
 return createHash("sha256").update(JSON.stringify(clean)).digest("hex");
};
function strictRows(query,sql,maxRows){
 const received=query(sql,maxRows);
 if(!Array.isArray(received)||received.length>maxRows)fail("PROVIDER_READ_UNVERIFIED");
 return received;
}
export function step3AllIndexDescriptor(table,index,metadata){
 ident(table);ident(index?.name);
 if(index.partial!==0||![0,1].includes(index.unique)||
   !["c","u","pk"].includes(index.origin))
  fail("PARTIAL_OR_INDEX_METADATA_UNSUPPORTED");
 if(!Array.isArray(metadata)||metadata.length<2||metadata.length>32)
  fail("XINFO_UNVERIFIED");
 const keys=metadata.filter(x=>x.key===1).sort((a,b)=>a.seqno-b.seqno);
 if(!keys.length||keys.length>16||
    keys.some((x,i)=>x.seqno!==i||!Number.isSafeInteger(x.cid)||
     x.cid<0||!ID.test(x.name??"")||
     !["BINARY","NOCASE","RTRIM"].includes(x.coll)||
     ![0,1].includes(x.desc)))
  fail("EXPRESSION_COLLATION_OR_KEY_UNSUPPORTED");
 const columns=keys.map(x=>x.name);
 const projection=keys.map((x,i)=>ident(x.name)+" AS __audit_key_"+i);
 const base="SELECT rowid AS __audit_rowid,"+projection.join(",")+
  " FROM "+ident(table);
 const tableQuery=base+" NOT INDEXED LIMIT "+(STEP3_ALL_INDEX_MAX_ROWS+1);
 const indexQuery=base+" INDEXED BY "+ident(index.name)+
  " LIMIT "+(STEP3_ALL_INDEX_MAX_ROWS+1);
 const predicates=keys.map(x=>ident(x.name)+" IS NOT NULL").join(" AND ");
 const group=keys.map(x=>ident(x.name)+" COLLATE "+x.coll).join(",");
 const uniqueSQL=index.unique===1?
  "SELECT 1 AS duplicate FROM "+ident(table)+" WHERE "+predicates+
   " GROUP BY "+group+" HAVING COUNT(*)>1 LIMIT 1":null;
 return Object.freeze({table,index:index.name,unique:index.unique===1,
  columns,tableQuery,indexQuery,
  baselinePlan:"EXPLAIN QUERY PLAN "+tableQuery,
  indexedPlan:"EXPLAIN QUERY PLAN "+indexQuery,uniqueSQL});
}
export function verifyStep3AllIndex({
 descriptor,tableBefore,indexRows,tableAfter,tablePlan,indexPlan,uniqueViolations
}){
 const index=descriptor.index;
 if(!Array.isArray(tablePlan)||!tablePlan.some(x=>typeof x?.detail==="string"&&
     x.detail.includes("SCAN "+descriptor.table)&&!x.detail.includes("USING INDEX")&&
     !x.detail.includes("USING COVERING INDEX")))
  fail("BASELINE_EXPLAIN_UNVERIFIED");
 if(!Array.isArray(indexPlan)||!indexPlan.some(x=>typeof x?.detail==="string"&&
     x.detail.includes("USING COVERING INDEX "+index)))
  fail("COVERING_EXPLAIN_UNVERIFIED");
 if(tableBefore?.length!==tableAfter?.length||
    tableBefore?.length!==indexRows?.length)fail("ROWSET_LENGTH_MISMATCH");
 const before=normalize(tableBefore,descriptor.columns),
  indexed=normalize(indexRows,descriptor.columns),
  after=normalize(tableAfter,descriptor.columns);
 if(before!==after)fail("CONCURRENT_TABLE_CHANGE");
 if(before!==indexed)fail("INDEX_KEY_ROW_PARITY_MISMATCH");
 if(descriptor.unique&&(!Array.isArray(uniqueViolations)||
    uniqueViolations.length!==0))fail("UNIQUE_CONSTRAINT_UNVERIFIED");
 return Object.freeze({
  index,rows_compared:tableBefore.length,unique_verified:descriptor.unique,
  status:"PASS_BOUNDED_FULL_INDEX_KEY_AND_ROW_PARITY"});
}
/**
 * query(sql,maxRows): returns strict D1 [{...}] results with provider
 * success=true, rows_written=0 and nonnegative rows_read already verified.
 * Keep confidential results in process memory ONLY.
 */
export function auditStep3AllIndexes(table,query){
 ident(table);
 if(typeof query!=="function")fail("PROVIDER_QUERY_MISSING");
 const quick=strictRows(query,"PRAGMA quick_check("+ident(table)+")",2);
 if(quick.length!==1||Object.values(quick[0]).length!==1||
    Object.values(quick[0])[0]!=="ok")fail("TABLE_QUICK_CHECK_NOT_OK");
 const fk=strictRows(query,"PRAGMA foreign_key_check("+ident(table)+")",1);
 if(fk.length!==0)fail("FOREIGN_KEY_VIOLATION");
 const indexes=strictRows(query,"PRAGMA index_list("+ident(table)+")",
  STEP3_ALL_INDEX_MAX_PER_TABLE+1);
 if(indexes.length>STEP3_ALL_INDEX_MAX_PER_TABLE||
    new Set(indexes.map(x=>x.name)).size!==indexes.length)
  fail("INDEX_REGISTRY_TRUNCATED_OR_DUPLICATE");
 const proofs=[];
 for(const index of indexes){
  const xinfo=strictRows(query,"PRAGMA index_xinfo("+ident(index.name)+")",32);
  const d=step3AllIndexDescriptor(table,index,xinfo);
  const tablePlan=strictRows(query,d.baselinePlan,20);
  const indexPlan=strictRows(query,d.indexedPlan,20);
  const tableBefore=strictRows(query,d.tableQuery,STEP3_ALL_INDEX_MAX_ROWS+1);
  const indexRows=strictRows(query,d.indexQuery,STEP3_ALL_INDEX_MAX_ROWS+1);
  const tableAfter=strictRows(query,d.tableQuery,STEP3_ALL_INDEX_MAX_ROWS+1);
  const uniqueViolations=d.uniqueSQL?strictRows(query,d.uniqueSQL,1):[];
  proofs.push(verifyStep3AllIndex({descriptor:d,tableBefore,indexRows,
   tableAfter,tablePlan,indexPlan,uniqueViolations}));
 }
 const recheck=strictRows(query,"PRAGMA index_list("+ident(table)+")",
  STEP3_ALL_INDEX_MAX_PER_TABLE+1);
 if(JSON.stringify(indexes)!==JSON.stringify(recheck))
  fail("CONCURRENT_SCHEMA_CHANGE");
 return Object.freeze({
  table,status:"PASS_D1_SUPPORTED_QUICK_FK_ALL_INDEX_LOGICAL_PROOF",
  total_existing_indexes:indexes.length,index_proofs:proofs,
  all_indexes_including_unique_considered:true,
  real_sqlite_integrity_check_claimed:false,
  physical_file_integrity_claimed:false,
  raw_private_content_exposed:false
 });
}


/**
 * Exact index registry proven in the real Shadow D1 provider receipt from
 * workflow run #42639677098 on 2026-11-09. This registry must not shrink,
 * silently expand, or be silently trusted from an artifact supplied by CI.
 * The protected runner obtains fresh rows for EVERY index from the target D1.
 */
export const STEP3_0204_EXPECTED_EXISTING_INDEXES=Object.freeze({
 private_osint_news_25h:Object.freeze([
  "idx_private_osint_category_clock",
  "idx_private_osint_country_category_clock_v2",
  "idx_private_osint_first_seen",
  "idx_private_osint_news_clock",
  "sqlite_autoindex_private_osint_news_25h_1"
 ]),
 private_osint_source_checks_24h:Object.freeze([
  "idx_private_osint_check_category_status_v2",
  "idx_private_osint_check_time",
  "sqlite_autoindex_private_osint_source_checks_24h_1"
 ]),
 website_derived_intelligence:Object.freeze([
  "idx_website_derived_hot_order_v2",
  "idx_website_derived_intelligence_first_seen",
  "idx_website_derived_intelligence_latest",
  "sqlite_autoindex_website_derived_intelligence_1"
 ])
});
export function admitStep30204SupportedIntegrity(proofs){
 const tables=Object.keys(STEP3_0204_EXPECTED_EXISTING_INDEXES);
 if(!Array.isArray(proofs)||proofs.length!==tables.length)
  fail("0204_THREE_TABLES_REQUIRED");
 let count=0;
 for(let i=0;i<tables.length;i++){
  const table=tables[i],p=proofs[i];
  const expected=STEP3_0204_EXPECTED_EXISTING_INDEXES[table];
  if(p?.table!==table||
     p.status!=="PASS_D1_SUPPORTED_QUICK_FK_ALL_INDEX_LOGICAL_PROOF"||
     p.total_existing_indexes!==expected.length||
     !Array.isArray(p.index_proofs)||
     p.index_proofs.length!==expected.length||
     p.all_indexes_including_unique_considered!==true||
     p.real_sqlite_integrity_check_claimed!==false||
     p.physical_file_integrity_claimed!==false||
     p.raw_private_content_exposed!==false)
   fail("0204_TABLE_SUPPORTED_PROOF_UNVERIFIED");
  const received=p.index_proofs.map(x=>x.index).sort();
  if(JSON.stringify(received)!==JSON.stringify([...expected].sort())||
     p.index_proofs.some(x=>
      x.status!=="PASS_BOUNDED_FULL_INDEX_KEY_AND_ROW_PARITY"||
      !Number.isSafeInteger(x.rows_compared)||
      x.rows_compared<1||x.rows_compared>STEP3_ALL_INDEX_MAX_ROWS||
      typeof x.unique_verified!=="boolean"))
   fail("0204_INDEX_REGISTRY_OR_ROW_PARITY_UNVERIFIED");
  if(!p.index_proofs.some(x=>x.unique_verified===true))
   fail("0204_UNIQUE_INDEX_PROOF_REQUIRED");
  count+=expected.length;
 }
 if(count!==12)fail("0204_EXACT_INDEX_CARDINALITY_UNVERIFIED");
 return Object.freeze({
  status:"PASS_D1_SUPPORTED_0204_THREE_TABLE_TWELVE_INDEX_INTEGRITY",
  provider_query_proofs_required:true,
  quick_check_fk_all_indexes_and_unique_verified:true,
  existing_index_count:12,table_count:3,
  sqlite_integrity_check_claimed:false,
  production_release_authorized:false
 });
}
