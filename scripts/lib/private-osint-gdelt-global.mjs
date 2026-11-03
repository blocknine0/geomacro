/**
 * Free 15-minute GDELT static GKG archive discovery, not the DOC API.
 * GDELT batch time is an index clock, NOT an issuer publication time.
 * Strict MD5 + compressed archive integrity are checked by the existing
 * shared GDELT bulk reader. No article URL, text or source is persisted.
 */
import {probeGdeltGkgBulk} from "./gdelt-gkg-bulk-discovery.mjs";

const CATEGORIES=Object.freeze(["geopolitics","macro","rare_earth"]);
export async function privateGdeltGlobalDiscovery({
 now=new Date(),fetchImpl=fetch,resolveCountry,
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    typeof fetchImpl!=="function"||typeof resolveCountry!=="function")
  throw Error("OSINT_GDELT_CONFIG_INVALID");
 // One manifest + one MD5-verified ZIP. No three back-to-back DOC searches,
 // query-specific 504 retries, invented original dates or paid conversion.
 const result=await probeGdeltGkgBulk({now,fetchImpl,reviewFirstParty:false});
 const verified=result.state==="CURRENT_GKG_BATCH_SCANNED_PRIVATE_DISCOVERY_ONLY"&&
   result.archive_integrity_verified===true;
 const domainCount=new Map(verified?result.domains.map(row=>[
  row.category,row.theme_matched_article_count
 ]):[]);
 const checks=CATEGORIES.map(category=>({
  category,state:verified?"OBSERVED_STATIC_ARCHIVE":"UNAVAILABLE",
  index_metadata_hints:verified&&Number.isSafeInteger(domainCount.get(category))?
    domainCount.get(category):0,
 }));
 return Object.freeze({
  schema:"geomacro.private-gdelt-discovery-hints.v1",
  checks,global_article_index_hints:checks.reduce((sum,x)=>sum+x.index_metadata_hints,0),
  mapped_country_count:0,unmapped_or_ambiguous_hints:checks.reduce((sum,x)=>sum+x.index_metadata_hints,0),
  gdelt_static_archive_md5_verified:verified,
  gdelt_archive_batch_at:verified?result.upstream_batch_at:null,
  gdelt_archive_source:"gdelt_v2_gkg_static_15m_archive",
  canonical_195_country_router:true,source_publisher_clock_verified:false,
  gdelt_index_time_is_not_publication_time:true,
  source_original_pages_verified:false,commercial_rights_verified:false,
  attribution_and_scope_pending:true,
  original_article_urls_or_titles_emitted:false,
  headline_body_stored:false,raw_content_downloaded:false,
  private_only:true,public_published:false,paid_products_authorized:false,
  index_refresh_guaranteed_within_15m:false,
 });
}
