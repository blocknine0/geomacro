/**
 * Bounded 72-hour journal cap maintenance for GeoMacro's own free-news writer.
 *
 * The former unconditional status-ranked DELETE sorted the entire canonical
 * journal at every quiet/empty sweep, including when it contained <=600 rows.
 * SQLite's unfiltered COUNT(*) uses its btree count path rather than scanning
 * and parsing every JSON story. Spend that cheap read first and ONLY run the
 * original priority-preserving trim when the canonical table is over cap.
 *
 * This never serves protected reads, extends TTL, changes PREDGE, weakens
 * source proof or bypasses Cloudflare account-wide D1 quota limits.
 */
export const WEBSITE_DERIVED_HARD_CAP=600;
const ROW_COUNT_SQL=
  "SELECT COUNT(*) AS journal_rows FROM website_derived_intelligence";
const PRIORITY_TRIM_SQL=
  "DELETE FROM website_derived_intelligence WHERE id IN ("+
  "SELECT id FROM website_derived_intelligence ORDER BY "+
  "CASE "+
  "WHEN json_extract(story_json, '$.status') = 'official_release_observed_unscored' THEN 2 "+
  "WHEN json_extract(story_json, '$.status') = 'osint_feed_observed_unverified' "+
  "AND json_extract(story_json, '$.what_changed') LIKE 'A monitored source feed reports:%' "+
  "AND json_extract(story_json, '$.topic') NOT IN ('geopolitical publisher candidate','macro publisher candidate','minerals publisher candidate') THEN 1 "+
  "ELSE 0 END DESC, published_at DESC, id DESC LIMIT -1 OFFSET 600)";

async function exactCount(db){
  const record=await db.prepare(ROW_COUNT_SQL).first();
  if(!Number.isSafeInteger(record?.journal_rows)||
     record.journal_rows<0)
    throw Error("DERIVED_NEWS_CAP_COUNT_UNVERIFIED");
  return record.journal_rows;
}
export async function compactDerivedJournalIfOverCap(env){
  if(!env?.DB||typeof env.DB.prepare!=="function")
    throw Error("DERIVED_NEWS_CAP_DB_UNAVAILABLE");
  const before=await exactCount(env.DB);
  // 0-600 includes healthy quiet feeds. Never pay for JSON extraction,
  // sorting or a DELETE when there are no excess rows to delete.
  if(before<=WEBSITE_DERIVED_HARD_CAP)
    return Object.freeze({state:"WITHIN_CAP",over_cap:false,trim_executed:false});
  const deleted=await env.DB.prepare(PRIORITY_TRIM_SQL).run();
  if(deleted?.success===false)
    throw Error("DERIVED_NEWS_CAP_TRIM_UNAVAILABLE");
  // Verify the actual canonical cap after pruning; a concurrent writer must
  // not be counted as successful maintenance.
  const after=await exactCount(env.DB);
  if(after>WEBSITE_DERIVED_HARD_CAP)
    throw Error("DERIVED_NEWS_CAP_CONCURRENT_OVERFLOW");
  return Object.freeze({state:"TRIMMED",over_cap:true,trim_executed:true});
}
