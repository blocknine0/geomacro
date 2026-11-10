/**
 * Historical index lineage for phase2h_private_raw_news.
 * The isolated Shadow has exactly seven indexes. Historical production
 * migration 0117 also installs idx_phase2h_derived_discovery_cursor:
 * 8 is valid ONLY if every name, origin, partial flag, DDL, keys and
 * later full row-membership proof matches. Unknown 8th/9th indexes HOLD.
 */
const TABLE="phase2h_private_raw_news";
const EXTRA="idx_phase2h_derived_discovery_cursor";
const EXPECTED=Object.freeze({
 idx_phase2h_native_category:0,
 idx_phase2h_pending_recent_ingested_category:1,
 idx_phase2h_retention_first_ingested:0,
 idx_phase2h_risk_country_category_clock:0,
 idx_phase2h_risk_country_unindexed_recent:1,
 idx_phase2h_unarchived:0,
 sqlite_autoindex_phase2h_private_raw_news_1:0
});
const fail=code=>{throw Error("STEP3_0212_SOURCE_"+code)};
export const sourceIndexPassStatus=count=>count===8?
 "PASS_0212_ALL_EIGHT_REVIEWED_SOURCE_INDEX_KEYS":
 "PASS_0212_ALL_SEVEN_SOURCE_FULL_AND_PARTIAL_INDEX_KEYS";
export function reviewedSourceIndexCatalog(query,read){
 const rows=read(query,'PRAGMA index_list("'+TABLE+'")',48);
 const names=rows.map(i=>i.name).sort();
 const has0117=names.includes(EXTRA);
 const expected=Object.keys(EXPECTED);
 if(has0117)expected.push(EXTRA);
 if(![7,8].includes(rows.length)||
    rows.length!==(has0117?8:7)||
    JSON.stringify(names)!==JSON.stringify(expected.sort())||
    rows.some(i=>i.partial!==(i.name===EXTRA?0:EXPECTED[i.name])||
      i.unique!==(i.name.startsWith("sqlite_autoindex_")?1:0)||
      i.origin!==(i.name.startsWith("sqlite_autoindex_")?"pk":"c"))||
    new Set(names).size!==rows.length)
  fail("REVIEWED_SEVEN_OR_EIGHT_INDEX_REGISTRY_DRIFT");
 if(has0117){
  const ddl=read(query,"SELECT name,type,sql FROM sqlite_schema WHERE "+
   "name='"+EXTRA+"' AND type='index' LIMIT 2",2);
  const pattern=/^CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["'\x60]?idx_phase2h_derived_discovery_cursor["'\x60]?\s+ON\s+["'\x60]?phase2h_private_raw_news["'\x60]?\s*\(\s*["'\x60]?first_ingested_at["'\x60]?\s*,\s*["'\x60]?record_id["'\x60]?\s*\)\s*;?\s*$/iu;
  if(ddl.length!==1||ddl[0]?.name!==EXTRA||ddl[0]?.type!=="index"||
     typeof ddl[0]?.sql!=="string"||
     !pattern.test(ddl[0].sql.replace(/\s+/gu," ").trim()))
   fail("REVIEWED_0117_SOURCE_DDL_DRIFT");
  const xinfo=read(query,'PRAGMA index_xinfo("'+EXTRA+'")',32);
  const keys=xinfo.filter(i=>i.key===1).sort((a,b)=>a.seqno-b.seqno);
  if(keys.length!==2||keys.some((k,i)=>k.seqno!==i||
      k.name!==["first_ingested_at","record_id"][i]||
      k.coll!=="BINARY"||k.desc!==0))
   fail("REVIEWED_0117_SOURCE_INDEX_KEYS_DRIFT");
 }
 return rows;
}
