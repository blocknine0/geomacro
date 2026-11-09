/**
 * Provider-supported structural proof for the initially EMPTY opt-in 0213
 * reference table. Empty index membership is VACUOUS, never signed evidence.
 * Stage1 remains blocked until real original R2 HMAC/B2 byte readback,
 * dual Shadow Worker acceptance and all signed independent gates pass.
 */
const TABLE="phase2h_raw_object_refs_v1";
const PK="sqlite_autoindex_phase2h_raw_object_refs_v1_1";
const EXPECTED=Object.freeze({
 [PK]:Object.freeze(["record_id"]),
 idx_phase2h_ref_object_key_v1:Object.freeze(["object_key","bundle_index"]),
 idx_phase2h_ref_country_category_clock_v1:Object.freeze([
  "risk_country_iso3","category","original_published_at","record_id"]),
 idx_phase2h_ref_ingest_clock_v1:Object.freeze(["first_ingested_at","record_id"])
});
const fail=x=>{throw Error("STEP3_0213_EMPTY_"+x)};
const id=x=>'"'+x+'"';
function rows(query,sql,max){
 const result=query(sql,max);
 if(!Array.isArray(result)||result.length>max)fail("READ_ONLY_PROVIDER_ROWS_UNVERIFIED");
 return result;
}
const names=Object.keys(EXPECTED);
const exactOK=v=>v.length===1&&Object.keys(v[0]??{}).length===1&&
 Object.values(v[0])[0]==="ok";
export function auditStep30213EmptyRefStructure(query){
 if(typeof query!=="function")fail("PROVIDER_READER_MISSING");
 const schema=rows(query,"SELECT name,type,sql FROM sqlite_schema WHERE name IN ("+
  [TABLE,...names.filter(x=>x!==PK)].map(x=>"'"+x+"'").join(",")+
  ") ORDER BY name LIMIT 5",5);
 if(schema.length!==4||
    schema.filter(x=>x.name===TABLE&&x.type==="table"&&
     typeof x.sql==="string"&&x.sql.includes("record_id")&&
     x.sql.includes("pointer_hmac_sha256")&&
     x.sql.includes("storage_backend")).length!==1||
    names.filter(x=>x!==PK).some(n=>!schema.some(x=>
     x.name===n&&x.type==="index"&&typeof x.sql==="string"&&
     x.sql.includes("CREATE INDEX"))))
  fail("REVIEWED_EMPTY_SCHEMA_OBJECTS_UNVERIFIED");
 const cols=rows(query,"PRAGMA table_info("+id(TABLE)+")",20);
 if(cols.length!==15||cols[0]?.name!=="record_id"||
    cols[0]?.pk!==1||cols[0]?.notnull!==1||
    cols.some(x=>typeof x.name!=="string")||
    !["raw_sha256","object_sha256","record_sha256","pointer_hmac_sha256"].every(
     col=>cols.some(x=>x.name===col))||
    !cols.some(x=>x.name==="storage_backend"&&x.notnull===1))
  fail("SIGNED_POINTER_COLUMN_SCHEMA_DRIFT");
 const catalog=rows(query,"PRAGMA index_list("+id(TABLE)+")",8);
 if(catalog.length!==names.length||
    new Set(catalog.map(x=>x.name)).size!==names.length||
    names.some(n=>!catalog.some(x=>x.name===n))||
    catalog.some(x=>x.partial!==0||
     x.unique!==(x.name===PK?1:0)||
     x.origin!==(x.name===PK?"pk":"c")))
  fail("REFERENCE_INDEX_REGISTRY_DRIFT");
 if(!exactOK(rows(query,"PRAGMA quick_check("+id(TABLE)+")",2)))
  fail("D1_QUICK_CHECK_NOT_OK");
 if(rows(query,"PRAGMA foreign_key_check("+id(TABLE)+")",1).length!==0)
  fail("D1_FOREIGN_KEY_VIOLATION");
 const present=rows(query,"SELECT EXISTS(SELECT 1 FROM "+id(TABLE)+
  " LIMIT 1) AS has_any",1);
 if(present.length!==1||present[0]?.has_any!==0)
  fail("NONEMPTY_REFERENCE_REQUIRES_REAL_HMAC_PROOF");
 for(const name of names){
  const xinfo=rows(query,"PRAGMA index_xinfo("+id(name)+")",12);
  const keys=xinfo.filter(x=>x.key===1).sort((a,b)=>a.seqno-b.seqno);
  const expected=EXPECTED[name];
  if(keys.length!==expected.length||
     keys.some((x,i)=>x.seqno!==i||x.name!==expected[i]||
      !Number.isSafeInteger(x.cid)||x.cid<0||
      x.coll!=="BINARY"||![0,1].includes(x.desc))||
     (name==="idx_phase2h_ref_country_category_clock_v1"&&
      (keys[2].desc!==1||keys[3].desc!==1))||
     (name!=="idx_phase2h_ref_country_category_clock_v1"&&
      keys.some(x=>x.desc!==0)))
   fail("REFERENCE_INDEX_KEY_OR_ORDER_DRIFT");
  const sql="SELECT record_id FROM "+id(TABLE)+" INDEXED BY "+id(name)+
   " LIMIT 1";
  const plan=rows(query,"EXPLAIN QUERY PLAN "+sql,15);
  if(!plan.some(x=>typeof x?.detail==="string"&&
     x.detail.includes(name)))fail("FORCED_REFERENCE_INDEX_PLAN_UNVERIFIED");
  if(rows(query,sql,1).length!==0)
   fail("REFERENCE_TABLE_CONCURRENT_POPULATION");
 }
 // Empty table + index schema can never prove record HMAC, B2 or R2 bytes.
 return Object.freeze({
  schema:"geomacro.step3.0213-empty-ref-only-structure.v1",
  status:"OBSERVED_EMPTY_REFERENCE_STRUCTURAL_ONLY",
  index_schema_count:names.length,
  observed_rows:0,nonvacuous_original_bytes_verified:false,
  source_pointer_hmac_verified:false,b2_original_readback_verified:false,
  encrypted_r2_checkpoint_verified:false,
  shadow_legacy_worker_compatibility_verified:false,
  shadow_new_worker_compatibility_verified:false,
  production_release_authorized:false,stage2_authorized:false,
  canary_promoted:false,paid_delivery_authorized:false,
  sqlite_full_integrity_check_claimed:false,
  provider_reader_provenance:"REQUIRES_FRESH_SAME_TARGET_D1_CALLER",
  private_source_rows_emitted:false
 });
}
