import {preflightReviewedCurrentGlobalRisk} from "./supabase-free-gri-v12-current.mjs";
import {qualifyIndependentSameEvent} from "./independent-same-event-qualification.mjs";

const MAX_INTELLIGENCE_AGE_MS=6*60*60*1000;
const ALL_DOMAINS=["geopolitics","macro","rare_earth"];
const deny=reason=>Object.freeze({ready:false,reason,rows:null,eventPackages:null,
  source_originals_still_verified:false,original_source_count_claimed:0,
  b2_requests:0,d1_writes:0,supabase_requests:0,payment_attempts:0});

/**
 * Exact signed reviewed-GRI batch -> a possible independent, recent,
 * unscored-input-to-existing-SCORED-Intelligence publisher handoff.
 *
 * This does NOT score, self-authorize rights, mint publisher signatures,
 * create missing events or accept a 72-hour retained GRI event as fresh
 * Intelligence. The existing Intelligence publisher must independently
 * redo multi-original qualification before any B2 or D1 write.
 */
export function selectFreshIntelligenceFromReviewedGri(signed,now=new Date()){
  if(!signed||!Array.isArray(signed.customerRows)||
     !Array.isArray(signed.eventPackages)||
     signed.customerRows.length!==signed.eventPackages.length||
     !Number.isFinite(now.getTime()))
    throw Error("GRI_INTELLIGENCE_BRIDGE_REVIEWED_BATCH_INVALID");
  const rows=[],eventPackages=[],seenIds=new Set();
  for(let i=0;i<signed.customerRows.length;i++){
    const row=signed.customerRows[i],pkg=signed.eventPackages[i];
    const published=Date.parse(row?.published_at??"");
    const created=Date.parse(row?.created_at??"");
    // Old 72h events are legitimate in a REVIEWED GRI portfolio but NEVER
    // silently become a current Intelligence public article.
    if(!Number.isFinite(published)||!Number.isFinite(created)||
       published>now.getTime()||created>now.getTime()||
       now.getTime()-published>MAX_INTELLIGENCE_AGE_MS||
       now.getTime()-created>MAX_INTELLIGENCE_AGE_MS)
      continue;
    if(!ALL_DOMAINS.includes(row.category)||pkg?.category!==row.category||
       !row.id||seenIds.has(row.id))
      throw Error("GRI_INTELLIGENCE_BRIDGE_CATEGORY_IDENTITY_INVALID");
    seenIds.add(row.id);
    rows.push(row);eventPackages.push(pkg);
  }
  if(!ALL_DOMAINS.every(category=>rows.some(r=>r.category===category)))
    return deny("CURRENT_SIX_HOUR_THREE_DOMAIN_ORIGINALS_MISSING");
  return {ready:true,reason:"FRESH_THREE_DOMAIN_CANDIDATE",rows,eventPackages,
    source_originals_still_verified:false,original_source_count_claimed:0,
    b2_requests:0,d1_writes:0,supabase_requests:0,payment_attempts:0};
}

export function qualifySignedGriForCurrentIntelligence({
  reviewed,now=new Date(),trustedReviewerPublicKeyPem,
}={}){
  // Verify GRI envelope signature, independent originals/rights, canonical
  // score inputs and exact historical B2 PIN BEFORE reducing the bundle.
  preflightReviewedCurrentGlobalRisk({reviewed,now,trustedReviewerPublicKeyPem});
  const selected=selectFreshIntelligenceFromReviewedGri(reviewed.signed_input,now);
  if(!selected.ready)return selected;
  const verified=qualifyIndependentSameEvent({
    rows:selected.rows,eventPackages:selected.eventPackages,now,
    trustedReviewerPublicKeyPem,
  });
  if(verified.receipt.commercial_event_admission!==true||
     verified.receipt.qualified_event_count!==selected.rows.length||
     !ALL_DOMAINS.every(c=>verified.receipt.per_domain[c]>0))
    throw Error("GRI_INTELLIGENCE_BRIDGE_INDEPENDENT_RIGHTS_INVALID");
  return {...selected,reason:"CURRENT_INDEPENDENT_REVIEW_CONFIRMED",
    source_originals_still_verified:true,
    original_source_count_claimed:verified.receipt.qualified_event_count,
    qualifying_receipt_sha256:verified.receipt_sha256};
}


/**
 * Fail-closed B2 overwrite guard. A later reviewed GRI portfolio can have
 * older native events than already-public Intelligence. Do not overwrite its
 * latest.json.gz pointer before D1 can reject a backwards source clock.
 * D1 serves 503/404 only when current signed Intelligence is unavailable.
 */
export async function mayPromoteNewerReviewedIntelligence({
  rows,fetchImpl=fetch,
}={}){
  if(!Array.isArray(rows)||rows.length<3)
    throw Error("GRI_INTELLIGENCE_EXISTING_HOT_GUARD_INPUT_INVALID");
  const incoming=Math.max(...rows.map(r=>Date.parse(r?.published_at??"")));
  if(!Number.isFinite(incoming))
    throw Error("GRI_INTELLIGENCE_EXISTING_HOT_GUARD_CLOCK_INVALID");
  const endpoint="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/hot-snapshot/intelligence";
  let response;
  try{
    response=await fetchImpl(endpoint,{
      headers:{"Accept":"application/json","Cache-Control":"no-cache"},
      signal:AbortSignal.timeout(12000),
    });
  }catch{
    throw Error("GRI_INTELLIGENCE_EXISTING_HOT_GUARD_READ_UNAVAILABLE");
  }
  if([404,503].includes(response.status))
    return Object.freeze({canPublish:true,reason:"NO_CURRENT_VERIFIED_INTELLIGENCE"});
  if(response.status!==200||response.ok!==true)
    throw Error("GRI_INTELLIGENCE_EXISTING_HOT_GUARD_HTTP_INVALID");
  let existing;
  try{existing=await response.json()}
  catch{throw Error("GRI_INTELLIGENCE_EXISTING_HOT_GUARD_INVALID_JSON")}
  const source=Date.parse(existing?.source_as_of??"");
  if(existing?.ok!==true||existing?.product!=="intelligence"||
     !Number.isFinite(source)||source>Date.now()+5*60_000||
     existing.full_b2_readback_verified!==true||
     existing.exact_gzip_restore_verified!==true)
    throw Error("GRI_INTELLIGENCE_EXISTING_HOT_GUARD_PROOF_INVALID");
  return Object.freeze({
    canPublish:incoming>source,
    reason:incoming>source?"NEWER_REVIEWED_ORIGINAL":
      "CURRENT_INTELLIGENCE_HAS_EQUAL_OR_NEWER_ORIGINAL",
  });
}
