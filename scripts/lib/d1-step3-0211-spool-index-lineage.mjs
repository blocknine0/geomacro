/**
 * Production spool D1 source lineage, reviewed against migrations:
 * 0114/0116: seven indexes, source_id+state lookup;
 * 0206: delete redundant candidate_sha256 index; UNIQUE autoindex remains;
 * 0210: replace state-mutated source lookup with immutable source_id lookup.
 *
 * Three named, exact supported states: original Shadow 7; 0206-only 6;
 * 0206+0210 production 6. No unknown/missing keys, DDL or fake uniqueness.
 */
const TABLE="ingestion_spool_queue";
const fail=x=>{throw Error("STEP3_0211_SPOOL_"+x)};
const NAMED=Object.freeze([
 "idx_p0b_bundle_items","idx_spool_candidate_sha",
 "idx_spool_committed_day","idx_spool_source_id",
 "idx_spool_state_locked"
]);
const EXPECTED=Object.freeze({
 idx_p0b_bundle_items:
  "createindexidx_p0b_bundle_itemsoningestion_spool_queue(b2_spool_uri,bundle_offset)",
 idx_spool_candidate_sha:
  "createindexidx_spool_candidate_shaoningestion_spool_queue(candidate_sha256)",
 idx_spool_committed_day:
  "createindexidx_spool_committed_dayoningestion_spool_queue(d1_committed_at)",
 idx_spool_source_id_legacy:
  "createindexidx_spool_source_idoningestion_spool_queue(source_id,state)",
 idx_spool_source_id_optimized:
  "createindexidx_spool_source_idoningestion_spool_queue(source_id)",
 idx_spool_state_locked:
  "createindexidx_spool_state_lockedoningestion_spool_queue(state,locked_until,spooled_atasc)"
});
const normalize=sql=>typeof sql==="string"?
 sql.toLowerCase().replace(/"/gu,"").replace(/\s+/gu,"")
  .replace("ifnotexists","").replace(/;$/u,""):null;
function read(q,sql,max){
 const rows=q(sql,max);
 if(!Array.isArray(rows)||rows.length>max)fail("PROVIDER_INDEX_PROOF_INVALID");
 return rows;
}
function checkAutoUnique(q,index,key){
 const xinfo=read(q,'PRAGMA index_xinfo("'+index+'")',12);
 const keys=xinfo.filter(x=>x?.key===1);
 if(keys.length!==1||keys[0].name!==key||keys[0].seqno!==0||
    !Number.isSafeInteger(keys[0].cid)||keys[0].cid<0||
    keys[0].coll!=="BINARY"||keys[0].desc!==0)
  fail("CANDIDATE_AND_PK_AUTO_UNIQUE_KEYS_UNVERIFIED");
}
export function auditStep30211ReviewedSpoolIndexLineage(query,rows,legacyIndexes){
 if(typeof query!=="function"||!Array.isArray(rows)||
    !Array.isArray(legacyIndexes)||legacyIndexes.length!==7)
  fail("UNVERIFIED_INDEX_PROOF_INPUTS");
 const candidate=rows.some(x=>x?.name==="idx_spool_candidate_sha");
 const expected=candidate?legacyIndexes:
  legacyIndexes.filter(x=>x!=="idx_spool_candidate_sha");
 if(rows.length!==expected.length||
    new Set(rows.map(x=>x?.name)).size!==rows.length||
    expected.some(x=>!rows.some(r=>r.name===x))||
    rows.some(x=>x?.partial!==0||
     !["c","pk","u"].includes(x.origin)||
     x.unique!==(x.name.startsWith("sqlite_autoindex_")?1:0)))
  fail("REVIEWED_INDEX_REGISTRY_DRIFT");
 const namedExpected=NAMED.filter(x=>expected.includes(x));
 const sql="SELECT name,type,tbl_name,sql FROM sqlite_schema WHERE "+
  "type='index' AND tbl_name='"+TABLE+"' AND name IN ("+
  NAMED.map(x=>"'"+x+"'").join(",")+") ORDER BY name LIMIT 8";
 const definitions=read(query,sql,8);
 if(definitions.length!==namedExpected.length||
    JSON.stringify(definitions.map(x=>x?.name))!==
     JSON.stringify([...namedExpected].sort()))
  fail("REVIEWED_NAMED_INDEX_DDL_REGISTRY_DRIFT");
 let sourceMode=null;
 for(const d of definitions){
  if(!d||Object.keys(d).sort().join(",")!=="name,sql,tbl_name,type"||
     d.type!=="index"||d.tbl_name!==TABLE)
   fail("REVIEWED_NAMED_INDEX_DDL_UNVERIFIED");
  const ddl=normalize(d.sql);
  if(d.name==="idx_spool_source_id"){
   if(ddl===EXPECTED.idx_spool_source_id_legacy)
    sourceMode="SOURCE_ID_STATE";
   else if(ddl===EXPECTED.idx_spool_source_id_optimized)
    sourceMode="IMMUTABLE_SOURCE_ID";
   else fail("SOURCE_FK_INDEX_DDL_UNVERIFIED");
  }else if(ddl!==EXPECTED[d.name])
   fail("REVIEWED_NAMED_INDEX_DDL_UNVERIFIED");
 }
 if(sourceMode===null||
    (candidate&&sourceMode!=="SOURCE_ID_STATE"))
  fail("SOURCE_FK_NATIVE_INDEX_LINEAGE_UNVERIFIED");
 // Candidate identity must remain guaranteed by the original 0114 UNIQUE
 // autoindex whether or not its redundant 0206 covering index was dropped.
 checkAutoUnique(query,"sqlite_autoindex_ingestion_spool_queue_1","id");
 checkAutoUnique(query,"sqlite_autoindex_ingestion_spool_queue_2","candidate_sha256");
 return Object.freeze({
  status:"PASS_EXACT_REVIEWED_SPOOL_INDEX_DDL_PK_AND_CANDIDATE_UNIQUE",
  expected_indexes:expected,
  index_count:expected.length,
  profile:candidate?"0114_0116_SEVEN_INDEX_LEGACY":
   sourceMode==="SOURCE_ID_STATE"?
    "0206_SIX_INDEX_LEGACY_SOURCE":
    "0206_0210_SIX_INDEX_IMMUTABLE_SOURCE",
  source_index_columns:sourceMode==="SOURCE_ID_STATE"?
   ["source_id","state"]:["source_id"],
  redundant_candidate_index_present:candidate,
  candidate_unique_autoindex_verified:true,
  native_migration_ledger_verified_by_this_proof:false,
  data_membership_verified_by_this_proof:false,
  production_migration_authorized:false,canary_promoted:false
 });
}
