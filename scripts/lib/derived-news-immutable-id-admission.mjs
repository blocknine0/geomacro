/**
 * Phase 2G: do not call a D1 UPSERT ACK an insert/update when the immutable
 * native publisher clock is already held under the same canonical ID.
 * Deterministic, source-neutral and bounded by the 600-row canonical journal.
 * Same-ID prose revisions with identical native clock remain eligible.
 */
export function partitionCanonicalDerivedCandidates(before,proposed){
 if(!Array.isArray(before)||before.length>600||
    !Array.isArray(proposed)||proposed.length>600)
   throw Error("DERIVED_NEWS_IMMUTABLE_ADMISSION_INPUT_INVALID");
 const canonical=new Map(),seen=new Set();
 for(const old of before){
   if(!old||typeof old.id!=="string"||canonical.has(old.id))
     throw Error("DERIVED_NEWS_IMMUTABLE_CANONICAL_INVALID");
   canonical.set(old.id,old);
 }
 const admit=[],archive=[],deferred=[],unchanged=[];
 for(const next of proposed){
   if(!next||typeof next.id!=="string"||seen.has(next.id))
     throw Error("DERIVED_NEWS_IMMUTABLE_PROPOSED_INVALID");
   seen.add(next.id);
   const old=canonical.get(next.id);
   if(old&&(old.category!==next.category||
      old.published_at!==next.published_at||
      old.date_precision!==next.date_precision)){
     // Retain the canonical original unchanged, never give the conflicting
     // newer candidate a fabricated date or a new/updated write receipt.
     deferred.push(next.id);archive.push(old);continue;
   }
   archive.push(next);
   if(old&&JSON.stringify(old)===JSON.stringify(next)){
     unchanged.push(next.id);continue;
   }
   admit.push(next);
 }
 return Object.freeze({
   admit,archive,
   immutable_conflicts_deferred:deferred.length,
   canonical_unchanged:unchanged.length,
   source_ids_logged:false,
   // IDs are intentionally not included in any returned diagnostic.
 });
}
