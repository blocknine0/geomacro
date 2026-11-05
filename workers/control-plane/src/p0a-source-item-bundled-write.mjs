/**
 * P0-A normalized source-item D1 microbundle.
 * One SQL statement carries up to 25 items through json_each(?) instead of
 * 25 individual INSERT statements. D1 charges physical rows, NOT statements:
 * conflicts update at most once per six hours; identical re-polls write 0.
 * Source-native clock and immutable first-seen metadata never change.
 */
export const P0A_ITEM_BUNDLE_SIZE=25;
export const P0A_DUPLICATE_REFRESH_MS=6*60*60*1000;
const COLUMNS=["item_id","source_id","intended_category","country_iso3",
 "rights_tier","title","original_url","source_record_id","native_published_at",
 "first_seen_at","last_seen_at","observed_at","clock_provenance","content_sha256"];
const SELECT=COLUMNS.map((_,i)=>"json_extract(value,'$["+i+"]')").join(",");
export const P0A_SOURCE_ITEM_BUNDLE_SQL=
 "INSERT INTO p0a_normalized_source_items ("+COLUMNS.join(",")+") "+
 "SELECT "+SELECT+" FROM json_each(?) WHERE 1 "+
 "ON CONFLICT(item_id) DO UPDATE SET last_seen_at=excluded.last_seen_at "+
 "WHERE p0a_normalized_source_items.last_seen_at<=?";

export function p0aBuildBundledItemStatements(db,rows,now){
 if(!db?.prepare||!Array.isArray(rows)||rows.length<1||rows.length>100||
    rows.some(r=>!Array.isArray(r)||r.length!==COLUMNS.length)||
    !Number.isSafeInteger(now)||now<0)
  throw Error("P0A_ITEM_BUNDLE_INVALID");
 const cutoff=new Date(now-P0A_DUPLICATE_REFRESH_MS).toISOString();
 const result=[];
 for(let offset=0;offset<rows.length;offset+=P0A_ITEM_BUNDLE_SIZE){
  const part=rows.slice(offset,offset+P0A_ITEM_BUNDLE_SIZE);
  // One bind for all 25 records keeps the D1 parameter and SQL-length budgets
  // bounded. Payloads must originate from the existing strict feed normalizer.
  const packed=JSON.stringify(part);
  if(new TextEncoder().encode(packed).byteLength>256_000)
   throw Error("P0A_ITEM_BUNDLE_BYTES_EXCEEDED");
  result.push(db.prepare(P0A_SOURCE_ITEM_BUNDLE_SQL).bind(packed,cutoff));
 }
 return result;
}
