/**
 * GeoMacro Phase 2H original-news retention, not a rule for PREDGE, billing,
 * historical research or unrelated provider archives.
 * Retention is measured from immutable FIRST D1 ingestion (not a replay tick).
 */
export const PHASE2H_NEWS_MAX_AGE_MS=72*60*60*1000;
export const PHASE2H_NEWS_CLEANUP_TARGET_MS=60*60*60*1000;
export const PHASE2H_NEWS_CLEANUP_LIMIT=25;
export function phase2hNewsCutoff(now=Date.now(),target=PHASE2H_NEWS_MAX_AGE_MS){
 if(!Number.isFinite(now)||!Number.isSafeInteger(target)||target<1||
    target>PHASE2H_NEWS_MAX_AGE_MS)throw Error("PHASE2H_RETENTION_CLOCK_INVALID");
 return new Date(now-target).toISOString();
}
export function phase2hRawWithinRetention(record,now=Date.now()){
 const stamp=record?.ingested_at??record?.first_ingested_at;
 if(typeof stamp!=="string"||!/^20\d\d-\d\d-\d\dT/u.test(stamp))
  return false;
 const t=Date.parse(stamp);
 return Number.isFinite(t)&&t<=now+60_000&&
  t>now-PHASE2H_NEWS_MAX_AGE_MS;
}
export function planPhase2hD1RetentionDelete(rows,{now=Date.now(),limit=PHASE2H_NEWS_CLEANUP_LIMIT}={}){
 if(!Array.isArray(rows)||rows.length>PHASE2H_NEWS_CLEANUP_LIMIT||
    !Number.isSafeInteger(limit)||limit<1||limit>PHASE2H_NEWS_CLEANUP_LIMIT)
  throw Error("PHASE2H_RETENTION_DELETE_INPUT_INVALID");
 const cutoff=phase2hNewsCutoff(now,PHASE2H_NEWS_CLEANUP_TARGET_MS);
 if(rows.length>limit)throw Error("PHASE2H_RETENTION_DELETE_LIMIT_EXCEEDED");
 for(const r of rows)
  if(!r||typeof r.record_id!=="string"||
    !/^[a-f0-9]{64}$/u.test(r.record_id)||
    typeof r.first_ingested_at!=="string"||
    r.first_ingested_at>cutoff||
    !Number.isFinite(Date.parse(r.first_ingested_at)))
   throw Error("PHASE2H_RETENTION_DELETE_UNSAFE_ROW");
 const ids=rows.map(x=>x.record_id);
 if(new Set(ids).size!==ids.length)
  throw Error("PHASE2H_RETENTION_DELETE_DUPLICATE");
 return Object.freeze({ids,cutoff,delete_count:ids.length,
  retention_limit_hours:72,proactive_cleanup_hours:60,
  b2_delete_proven:false,scope:"PHASE2H_D1_ORIGINAL_NEWS_ONLY"});
}
