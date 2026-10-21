import {registeredOriginalPublisherOrganization} from "./independent-same-event-qualification.mjs";
import {verifyGeomacroUnclaimedOriginalPage} from "./geomacro-original-page-readback.mjs";

/**
 * Aggregate-only, fail-closed audit of EVERY incoming free D1 news signal.
 *
 * Only the one actual registered original-page HTML reread can result in
 * ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED. RSS/Atom feed titles, URL
 * fingerprints, country mentions, successful GETs, and native feed pubDates
 * alone NEVER earn that state.
 *
 * This is NOT semantic same-event confirmation, source rights, licensing,
 * issuer signatures, signed GRO, GRI or payable customer intelligence.
 * Full private source references stay ephemeral in the producer's memory.
 */
const DOMAINS=["geopolitics","macro","rare_earth"];
const STATUSES=Object.freeze({
 VERIFIED:"ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED",
 NO_REFERENCE:"PRIVATE_ORIGINAL_REFERENCE_NOT_AVAILABLE",
 DATE_ONLY:"ORIGINAL_DAY_PRECISION_ONLY",
 STALE:"OUTSIDE_SIX_HOUR_CURRENT_PROOF_WINDOW",
 NO_PIN:"ORIGINAL_ISSUER_NOT_REGISTERED_FOR_BYTE_RECHECK",
 QUOTA:"ORIGINAL_PAGE_READBACK_DEFERRED_QUOTA",
 REJECTED:"ORIGINAL_BYTES_OR_NATIVE_CLOCK_UNVERIFIED",
});
const CURRENT_MS=6*60*60_000;
const MAX_SIGNALS=600;
const SAFE_ID=/^(?:geopolitics|macro|rare_earth)-[a-f0-9]{8}$/u;
const FIELDS=["id","category","published_at","date_precision","status"];
const error=()=>{throw Error("ALL_NEWS_EVIDENCE_INPUT_INVALID")};

export async function auditEveryDerivedNewsOriginal({
 signals,originalRefs,now=new Date(),verify=verifyGeomacroUnclaimedOriginalPage,
 maxReadbacks=6,maxPerCategory=2,
}={}){
 if(!Array.isArray(signals)||signals.length>MAX_SIGNALS||
   !(originalRefs instanceof Map)||!(now instanceof Date)||
   !Number.isFinite(now.getTime())||typeof verify!=="function"||
   !Number.isSafeInteger(maxReadbacks)||maxReadbacks<0||maxReadbacks>6||
   !Number.isSafeInteger(maxPerCategory)||maxPerCategory<0||maxPerCategory>2)
  error();
 const seen=new Set(),rows=[],rereadByCategory=new Map(DOMAINS.map(x=>[x,0]));
 const ordered=[...signals].sort((a,b)=>
   String(b?.published_at??"").localeCompare(String(a?.published_at??"")) ||
   String(a?.id??"").localeCompare(String(b?.id??"")));
 let rereads=0;
 for(const signal of ordered){
  if(!signal||typeof signal!=="object"||Array.isArray(signal)||
     !SAFE_ID.test(signal.id??"")||!DOMAINS.includes(signal.category)||
     signal.id.split("-").slice(0,-1).join("-")!==signal.category||
     seen.has(signal.id) ||
     !["exact","day"].includes(signal.date_precision)||
     !["official_release_observed_unscored","official_feed_candidate_unscored"].includes(signal.status))
   error();
  seen.add(signal.id);
  const row={id:signal.id,category:signal.category,
   original_page_evidence_status:null,
   exact_original_page_html_readback:false,
   source_rights_verified:false,facts_signatures_verified:false,
   rights_signatures_verified:false,signed_commercial_input:false,
   verified_same_event_corroboration:false,payment_authorized:false};
  const at=Date.parse(signal.published_at);
  const reference=originalRefs.get(signal.id);
  if(!reference){
   row.original_page_evidence_status=STATUSES.NO_REFERENCE;
  }else if(signal.date_precision!=="exact"||
     !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(signal.published_at)){
   row.original_page_evidence_status=STATUSES.DATE_ONLY;
  }else if(!Number.isFinite(at)||at>now.getTime()||
     now.getTime()-at>CURRENT_MS){
   row.original_page_evidence_status=STATUSES.STALE;
  }else{
   let organization=null,url=null;
   try{
    url=new URL(reference.articleUrl);
    if(url.protocol==="https:"&&!url.username&&!url.password&&!url.port&&
       !url.search&&!url.hash)
     organization=registeredOriginalPublisherOrganization(url.hostname);
   }catch{/* untrusted reference is never fetched */}
   if(!organization||
      (url.hostname==="www.gov.uk"&&reference.sourceId!=="uk_fcdo")||
      reference.category!==signal.category||
      reference.publishedAt!==signal.published_at ||
      typeof reference.articleUrl!=="string"){
    row.original_page_evidence_status=STATUSES.NO_PIN;
   }else if(rereads>=maxReadbacks||
      rereadByCategory.get(signal.category)>=maxPerCategory){
    row.original_page_evidence_status=STATUSES.QUOTA;
   }else{
    rereads++;
    rereadByCategory.set(signal.category,rereadByCategory.get(signal.category)+1);
    let proof=null;
    try{
     proof=await verify({original:{
      category:signal.category,
      originating_reporting_organization_id:organization,
      original_article_url:reference.articleUrl,
      original_published_at:signal.published_at,
     },now});
    }catch{/* denied, mismatched or network issue is NOT evidence */}
    if(proof?.schema==="geomacro.private-unclaimed-original-pre-review.v1"&&
       proof.accepted===true&&
       proof.status==="ORIGINAL_BYTES_AND_CLOCK_VERIFIED_REVIEW_PENDING"&&
       /^[0-9a-f]{64}$/u.test(proof.original_article_sha256??"")&&
       Date.parse(proof.original_native_published_at)===at&&
       proof.source_article_rights_verified===false&&
       proof.facts_signature_verified===false&&
       proof.rights_signature_verified===false&&
       proof.signed_gro_created===false&&proof.payment_authorized===false){
     row.original_page_evidence_status=STATUSES.VERIFIED;
     row.exact_original_page_html_readback=true;
    }else row.original_page_evidence_status=STATUSES.REJECTED;
   }
  }
  rows.push(row);
 }
 const counts=Object.fromEntries(DOMAINS.map(domain=>[
  domain,Object.freeze({
   total:rows.filter(x=>x.category===domain).length,
   original_bytes_verified:rows.filter(x=>x.category===domain&&
     x.original_page_evidence_status===STATUSES.VERIFIED).length,
   pending_or_unverified:rows.filter(x=>x.category===domain&&
     x.original_page_evidence_status!==STATUSES.VERIFIED).length,
  }),
 ]));
 const verified=rows.filter(x=>x.original_page_evidence_status===STATUSES.VERIFIED).length;
 return Object.freeze({
  schema:"geomacro.all-derived-news-original-page-evidence-audit.v1",
  checked_at:now.toISOString(),
  ingested_news_examined:rows.length,
  exact_page_byte_rereads_attempted:rereads,
  exact_page_byte_rereads_limit:maxReadbacks,
  verified_original_page_bytes_and_native_time:verified,
  pending_or_unverified_news_count:rows.length-verified,
  categories:counts,rows,
  // Original HTML proof != independent event/facts and legally reusable data.
  independent_same_event_verified:false,
  per_article_commercial_rights_verified:false,
  facts_signatures_verified:false,rights_signatures_verified:false,
  signed_commercial_intelligence_created:false,
  b2_requests:0,d1_writes:0,supabase_requests:0,x402_charges:0,
  raw_source_urls_titles_html_logged:false,
  private_original_html_hashes_exposed:false,
  full_195_country_news_coverage_claimed:false,
 });
}
