/**
 * Hourly recovery of cross-publisher canonical D1 cards into the SAME existing
 * immutable static website archive. Pure, bounded, privacy-preserving logic.
 *
 * The caller owns one authenticated complete D1 readback that also serves the
 * existing original-reference and per-ID audit. No second D1 query or source
 * scrape. Never repairs/rewrites original dates or grants source/paid rights.
 */
const DOMAINS=new Set(["geopolitics","macro","rare_earth"]);
export function reconcileCanonicalWebsiteArchiveCandidates({
 sourceCandidates,canonicalRows,now=Date.now(),isArchiveEligible,isConcrete
}={}){
 if(!Array.isArray(sourceCandidates)||sourceCandidates.length>1200||
  !Array.isArray(canonicalRows)||canonicalRows.length>600||
  typeof isArchiveEligible!=="function"||typeof isConcrete!=="function"||
  !Number.isFinite(now))
  throw Error("WEBSITE_CANONICAL_STATIC_CATCHUP_ARGUMENTS_INVALID");
 const merged=new Map();
 for(const s of sourceCandidates){
  if(!s||typeof s.id!=="string"||!DOMAINS.has(s.category))
   throw Error("WEBSITE_CANONICAL_STATIC_SOURCE_CANDIDATE_INVALID");
  merged.set(s.id,s);
 }
 const accepted={geopolitics:0,macro:0,rare_earth:0},added={...accepted};
 let skipped=0;
 const seen=new Set();
 for(const s of canonicalRows){
  if(!s||typeof s.id!=="string"||!DOMAINS.has(s.category)||
    seen.has(s.id))
   throw Error("WEBSITE_CANONICAL_STATIC_D1_ID_INVALID");
  seen.add(s.id);
  if(!isArchiveEligible(s,now,{allowHistorical:false})||!isConcrete(s)){
   skipped++;continue;
  }
  // Canonical native timestamps and immutable identity win against a
  // contradictory unpublished candidate. The archive itself never overwrites
  // a previously published ID.
  if(!merged.has(s.id))added[s.category]++;
  merged.set(s.id,s);
  accepted[s.category]++;
 }
 if(merged.size>1500)
  throw Error("WEBSITE_CANONICAL_STATIC_ARCHIVE_CANDIDATE_LIMIT");
 return Object.freeze({
  schema:"geomacro.canonical-d1-to-static-catchup.v1",
  candidates:[...merged.values()],
  canonical_qualified:accepted,
  new_canonical_ids_added:added,
  skipped_not_display_eligible:skipped,
  native_original_dates_modified:false,private_source_bytes:false,
  extra_d1_reads:0,predge_modified:false,payments:0
 });
}
