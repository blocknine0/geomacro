import {ORIGINAL_VERIFICATION_WINDOW_MS,ORIGINAL_VERIFICATION_WINDOW_HOURS,ORIGINAL_VERIFICATION_EXPIRED} from "../../src/lib/original-verification-policy.ts";
import {registeredOriginalPublisherOrganization} from "./independent-same-event-qualification.mjs";
import {verifyDerivedOriginalReferencePage} from "./geomacro-original-page-readback.mjs";
import {pinnedDerivedOriginalReference} from "./derived-original-reference-pins.mjs";
import {pinnedGovUkContentApiUrl} from "./govuk-original-content-clock.mjs";
import {createBundledOriginalReadbackBudget,bundleRoundRobinNews} from "./bundled-original-source-quota.mjs";
import {sourceRightsFollowupStatus} from "./commercial-rights-remediation.mjs";

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
 * This auditor never persists or publishes private source references. Trusted
 * producers may preserve them separately in the protected D1 handoff.
 */
const DOMAINS=["geopolitics","macro","rare_earth"];
const STATUSES=Object.freeze({
 VERIFIED:"ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED",
 NO_REFERENCE:"PRIVATE_ORIGINAL_REFERENCE_NOT_AVAILABLE",
 DATE_ONLY:"ORIGINAL_DAY_PRECISION_ONLY",
 STALE:ORIGINAL_VERIFICATION_EXPIRED,
 NO_PIN:"ORIGINAL_ISSUER_NOT_REGISTERED_FOR_BYTE_RECHECK",
 QUOTA:"ORIGINAL_PAGE_READBACK_DEFERRED_QUOTA",
 REJECTED:"ORIGINAL_BYTES_OR_NATIVE_CLOCK_UNVERIFIED",
});
// Deliberately coarse, fixed classes: no source URL, hostname, byte hash,
 // private exception text or issuer identity enters operator receipts.
const REJECTION_CLASS=Object.freeze({
 TRANSPORT_OR_REDIRECT_DENIED:"TRANSPORT_OR_HTTP",
 ORIGINAL_HTTP_NOT_OK:"TRANSPORT_OR_HTTP",
 ORIGINAL_MIME_UNVERIFIED:"RESPONSE_BODY",
 ORIGINAL_BYTES_OVERSIZE:"RESPONSE_BODY",
 ORIGINAL_BODY_MISSING:"RESPONSE_BODY",
 ORIGINAL_BODY_READ_ERROR:"RESPONSE_BODY",
 ORIGINAL_ENCODING_INVALID:"RESPONSE_BODY",
 ORIGINAL_NATIVE_CLOCK_NOT_PROVEN:"NATIVE_CLOCK",
 ORIGINAL_CLOCK_CONFLICT:"NATIVE_CLOCK",
 ORIGINAL_HTML_HASH_CHANGED:"HASH_MISMATCH",
});
// Two safe, distinct first-party clock failures. No issuer identity,
// article content, title, feed timestamp or source URL is serialized.
const CLOCK_DETAIL=Object.freeze({
 ORIGINAL_NATIVE_CLOCK_NOT_PROVEN:"ORIGINAL_METADATA_NOT_PROVEN",
 ORIGINAL_CLOCK_CONFLICT:"FEED_PAGE_CLOCK_CONFLICT",
});
const CURRENT_MS=ORIGINAL_VERIFICATION_WINDOW_MS;
const MAX_SIGNALS=600;
const SAFE_ID=/^(?:geopolitics|macro|rare_earth)-[a-f0-9]{8}$/u;
const FIELDS=["id","category","published_at","date_precision","status"];
const error=()=>{throw Error("ALL_NEWS_EVIDENCE_INPUT_INVALID")};

export async function auditEveryDerivedNewsOriginal({
 signals,originalRefs,now=new Date(),verify=verifyDerivedOriginalReferencePage,
 maxReadbacks=6,maxPerCategory=4,priorityById,fetchImpl=fetch,
}={}){
 if(!Array.isArray(signals)||signals.length>MAX_SIGNALS||
   !(originalRefs instanceof Map)||!(now instanceof Date)||
   !Number.isFinite(now.getTime())||typeof verify!=="function"||
   !Number.isSafeInteger(maxReadbacks)||maxReadbacks<0||maxReadbacks>6||
   !Number.isSafeInteger(maxPerCategory)||maxPerCategory<0||maxPerCategory>6||
   typeof fetchImpl!=="function"||priorityById!==undefined&&
    (!(priorityById instanceof Map)||priorityById.size>MAX_SIGNALS||
     [...priorityById].some(([id,p])=>!SAFE_ID.test(id)||!Number.isFinite(p)||p<0||p>now.getTime())))
  error();
 const seen=new Set(),rows=[],rereadByCategory=new Map(DOMAINS.map(x=>[x,0]));
 // Physical GETs are bundled, not partitioned into wasteful 2/2/2 lanes.
 // Keep two of the six maximum readback slots unused as free-tier headroom.
 // Developer tests can request a smaller explicit cap without reserving two
 // of those already-reduced test slots.
 const bundle=createBundledOriginalReadbackBudget({
   hardCeiling:maxReadbacks,reserved:maxReadbacks===6?2:0,perHostMax:1,
 });
 const proofCache=new Map();
 // Prioritize only real, original-dated, pinned <=60m publisher references;
 // then drain older queued reviews in their existing fair order.
 const ordered=bundleRoundRobinNews(signals,{priorityById,
   nowMs:now.getTime(),originalRefs});
 let rereads=0;
 for(const signal of ordered){
  if(!signal||typeof signal!=="object"||Array.isArray(signal)||
     !SAFE_ID.test(signal.id??"")||!DOMAINS.includes(signal.category)||
     signal.id.split("-").slice(0,-1).join("-")!==signal.category||
     seen.has(signal.id) ||
     !["exact","day"].includes(signal.date_precision)||
     !["official_release_observed_unscored","official_feed_candidate_unscored","osint_feed_observed_unverified"].includes(signal.status))
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
  // OSINT-feed observations are explicitly not original publisher articles.
  // They remain visible as derived observations, but cannot be promoted into
  // original-page byte evidence even if an unrelated private reference shares
  // the journal ID. Avoid failing the entire reviewer batch on this valid,
  // non-authorizing status.
  if(signal.status==="osint_feed_observed_unverified"){
   row.original_page_evidence_status=STATUSES.NO_REFERENCE;
  }else if(!reference){
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
    url=pinnedDerivedOriginalReference(reference);
    if(url)
     organization=registeredOriginalPublisherOrganization(url.hostname);
   }catch{/* untrusted reference is never fetched */}
   if(!url||
      reference.category!==signal.category||
      reference.publishedAt!==signal.published_at ||
      typeof reference.articleUrl!=="string"){
    row.original_page_evidence_status=STATUSES.NO_PIN;
   }else{
    const key=JSON.stringify([signal.category,url.href,signal.published_at]);
    const cached=proofCache.get(key);
    // Exactly the SAME issuer/original/category/native publication time may
    // be reused for multiple derived views within this run. Never reuse a
    // cross-issuer or cross-date proof, including a prior run's stale proof.
    if(cached){
      row.original_page_evidence_status=cached.status;
      row.exact_original_page_html_readback=cached.verified;
      // A rejected proof may be shared by more than one distinct derived ID.
      // Preserve its *bounded, redacted* rejection category in every row;
      // otherwise the separate protected reviewer rejects the entire audit.
      if(cached.status===STATUSES.REJECTED){
       row.original_readback_failure_class=cached.failureClass;
       if(cached.clockDetail)
        row.original_readback_clock_detail=cached.clockDetail;
      }
    }else if(rereadByCategory.get(signal.category)>=maxPerCategory||
       !bundle.admit(url.hostname)){
      row.original_page_evidence_status=STATUSES.QUOTA;
    }else{
      rereads++;
      rereadByCategory.set(signal.category,rereadByCategory.get(signal.category)+1);
      let proof=null;
      let firstRequest=true,supplementaryDeferred=false;
      const api=pinnedGovUkContentApiUrl(reference.articleUrl);
      const boundedFetch=async(input,init={})=>{
       const target=String(input instanceof Request?input.url:input);
       if((init.method??(input instanceof Request?input.method:"GET")).toUpperCase()!=="GET"||
          (firstRequest?target!==reference.articleUrl:!api||target!==api))
        throw Error("ORIGINAL_AUDIT_TRANSPORT_NOT_PINNED");
       if(!firstRequest&&!bundle.admitSupplementary(url.hostname)){
        supplementaryDeferred=true;throw Error("ORIGINAL_AUDIT_REQUEST_BUDGET_DEFERRED");
       }
       firstRequest=false;
       return fetchImpl(input,{...init,method:"GET",redirect:"error"});
      };
      try{
       proof=await verify({reference,fetchImpl:boundedFetch,original:{
        category:signal.category,
        originating_reporting_organization_id:organization,
        original_article_url:reference.articleUrl,
        original_published_at:signal.published_at,
       },now});
      }catch{/* denied, rate-limited or mismatch: fail closed; no retry */}
      const verified=proof?.schema==="geomacro.private-unclaimed-original-pre-review.v1"&&
        proof.accepted===true&&
        proof.status==="ORIGINAL_BYTES_AND_CLOCK_VERIFIED_REVIEW_PENDING"&&
        /^[0-9a-f]{64}$/u.test(proof.original_article_sha256??"")&&
        Date.parse(proof.original_native_published_at)===at&&
        proof.source_article_rights_verified===false&&
        proof.facts_signature_verified===false&&
        proof.rights_signature_verified===false&&
        proof.signed_gro_created===false&&proof.payment_authorized===false;
      row.original_page_evidence_status=verified?STATUSES.VERIFIED:
        supplementaryDeferred?STATUSES.QUOTA:STATUSES.REJECTED;
      if(!verified&&!supplementaryDeferred){
       const code=typeof proof?.status==="string"?proof.status:"";
       row.original_readback_failure_class=
        REJECTION_CLASS[code]??"UNKNOWN_OR_UNTRUSTED_PROOF";
       if(CLOCK_DETAIL[code])
        row.original_readback_clock_detail=CLOCK_DETAIL[code];
      }
      row.exact_original_page_html_readback=verified;
      proofCache.set(key,{status:row.original_page_evidence_status,verified,
       failureClass:row.original_readback_failure_class??null,
       clockDetail:row.original_readback_clock_detail??null});
    }
   }
  }
  // Source-contract hint ONLY. The original HTML bytes must have passed
  // the independently bounded readback before legal-scope review is queued.
  // This is not a Rights signature or automatic commercial authorization.
  row.source_rights_next_action=row.exact_original_page_html_readback
   ?sourceRightsFollowupStatus(reference?.sourceId,signal.category)
   :"ORIGINAL_PAGE_READBACK_REQUIRED";
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
  original_verification_window_hours:ORIGINAL_VERIFICATION_WINDOW_HOURS,
  ingested_news_examined:rows.length,
  exact_page_byte_rereads_attempted:rereads,
  exact_page_byte_rereads_limit:maxReadbacks,
  bundled_source_quota:bundle.snapshot(),
  verified_original_page_bytes_and_native_time:verified,
  pending_or_unverified_news_count:rows.length-verified,
  categories:counts,rows,
  rights_remediation_actions:Object.fromEntries(
   [...new Set(rows.map(x=>x.source_rights_next_action))].sort()
    .map(state=>[state,rows.filter(x=>x.source_rights_next_action===state).length])
  ),
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
