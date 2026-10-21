import {createHash} from "node:crypto";
import {
  approvedFirstPartyOriginalArticleUrl,
  verifiedPublisherPageDate,
} from "./official-original-article-date.mjs";
import {registeredOriginalPublisherOrganization} from
  "./independent-same-event-qualification.mjs";

// #2044: private, read-only source-authenticity continuation. This does NOT
// derive claims, source rights, GRO status or independent reviewer approval.
// This checker intentionally never trusts an article-identity hash as the hash
// of the actual HTML bytes: older ingestion records hash the article URL.
const MAX_ORIGINALS=4;
const MAX_HTML_BYTES=384*1024;
const TIMEOUT_MS=4000;
const MAX_FEED_PAGE_CLOCK_DRIFT_MS=10*60*1000;
const HEX=/^[a-f0-9]{64}$/;
const TIME=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const fail=()=>{throw Error("GEOMACRO_PRIVATE_PAGE_READBACK_INPUT_INVALID")};
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
function pinnedOriginalPage(url,category){
  let parsed;
  try{parsed=new URL(url)}catch{return null}
  if(parsed.protocol!=="https:"||parsed.username||parsed.password||
    parsed.port||parsed.search||parsed.hash||parsed.href.length>350)
    return null;
  // Existing first-party page-date validator has the conservative GOV.UK,
  // Fed, ECB, USGS, Canada and StatCan allowlisted original article routes.
  const existing=approvedFirstPartyOriginalArticleUrl(url,category);
  if(existing && existing===url)return parsed;
  // UN News is a registered original issuer but is not in the GOV/central
  // bank article-date route verifier. Admit only its original story route.
  if(category==="geopolitics" && parsed.hostname==="news.un.org" &&
     /^\/en\/story\/20\d\d\/(?:0?[1-9]|1[0-2])\/(?:\d{5,12}|[a-z0-9][a-z0-9-]{2,160})\/?$/.test(parsed.pathname))
    return parsed;
  return null;
}
function checkedInputs(originals, now,{minOriginals=2,maxAgeMs=24*60*60*1000}={}){
  if(!Array.isArray(originals)||originals.length<minOriginals||
     originals.length>MAX_ORIGINALS ||!(now instanceof Date)||
     !Number.isFinite(now.getTime()))fail();
  const seenOrgs=new Set(), seenUrls=new Set();
  let category,claim;
  const checked=[];
  for(const row of originals){
    if(!row||typeof row!=="object"||Array.isArray(row)||
       !CATEGORIES.has(row.category)||
       typeof row.original_article_url!=="string"||
       // Legacy original_article_sha256 in raw discovery is a URL hash,
       // never an independently reread HTML-body digest.
       Object.hasOwn(row,"original_article_sha256")||
       typeof row.original_published_at!=="string"||
       !TIME.test(row.original_published_at)||
       typeof row.same_event_claim_sha256!=="string"||
       !HEX.test(row.same_event_claim_sha256)||
       typeof row.originating_reporting_organization_id!=="string"||
       !["confirms","disputes","retracts"].includes(row.reporting_position)||
       !["string","undefined"].includes(typeof row.expected_html_sha256)||
       (row.expected_html_sha256!==undefined &&
        !HEX.test(row.expected_html_sha256)))fail();
    const uri=pinnedOriginalPage(row.original_article_url,row.category);
    const org=uri&&registeredOriginalPublisherOrganization(uri.hostname);
    const time=Date.parse(row.original_published_at);
    if(!uri||org!==row.originating_reporting_organization_id||
       !Number.isFinite(time)||time>now.getTime()||
       now.getTime()-time>maxAgeMs ||
       seenUrls.has(uri.href)||seenOrgs.has(org))fail();
    if(category && category!==row.category)fail();
    if(claim && claim!==row.same_event_claim_sha256)fail();
    category=row.category;claim=row.same_event_claim_sha256;
    seenOrgs.add(org);seenUrls.add(uri.href);
    checked.push({url:uri.href,expected_at:time,
      expected_sha:row.expected_html_sha256??null});
  }
  return {checked,category,claim};
}
async function exactReadback(row,now,fetchImpl){
  const bad=(reason)=>({status:"REJECTED",reason,
    article_sha256:null,original_published_at:null});
  let response;
  try{
    response=await fetchImpl(row.url,{
      method:"GET",redirect:"error",
      headers:{accept:"text/html",
        "user-agent":"Geomacro-Private-Original-Readback/1.0"},
      signal:AbortSignal.timeout(TIMEOUT_MS),
    });
  }catch{return bad("TRANSPORT_OR_REDIRECT_DENIED")}
  if(!response||response.status!==200 ||response.ok!==true)
    return bad("ORIGINAL_HTTP_NOT_OK");
  if(response.redirected===true ||
     (response.url && response.url!==row.url))
    return bad("TRANSPORT_OR_REDIRECT_DENIED");
  if(!/^text\/html(?:;|$)/i.test(response.headers?.get("content-type")??""))
    return bad("ORIGINAL_MIME_UNVERIFIED");
  const length=response.headers?.get("content-length");
  if(length!==null&&length!==undefined&&
     (!/^\d{1,7}$/.test(length)||Number(length)>MAX_HTML_BYTES))
    return bad("ORIGINAL_BYTES_OVERSIZE");
  if(!response.body)return bad("ORIGINAL_BODY_MISSING");
  const reader=response.body.getReader();
  const chunks=[];let size=0;
  try{
    while(true){
      const r=await reader.read();
      if(r.done)break;
      size+=r.value.byteLength;
      if(size>MAX_HTML_BYTES){
        await reader.cancel();
        return bad("ORIGINAL_BYTES_OVERSIZE");
      }
      chunks.push(Buffer.from(r.value));
    }
  }catch{return bad("ORIGINAL_BODY_READ_ERROR")}
  finally{reader.releaseLock()}
  if(size<32)return bad("ORIGINAL_BODY_MISSING");
  const bytes=Buffer.concat(chunks);
  let html;
  try{html=new TextDecoder("utf-8",{fatal:true}).decode(bytes)}
  catch{return bad("ORIGINAL_ENCODING_INVALID")}
  const originalAt=verifiedPublisherPageDate(html,now);
  if(originalAt===null)return bad("ORIGINAL_NATIVE_CLOCK_NOT_PROVEN");
  const native=Date.parse(originalAt);
  if(Math.abs(native-row.expected_at)>MAX_FEED_PAGE_CLOCK_DRIFT_MS)
    return bad("ORIGINAL_CLOCK_CONFLICT");
  const digest=sha(bytes);
  if(row.expected_sha!==null && digest!==row.expected_sha)
    return bad("ORIGINAL_HTML_HASH_CHANGED");
  return {status:"PAGE_BYTES_AND_NATIVE_CLOCK_VERIFIED",
    reason:null,article_sha256:digest,original_published_at:originalAt};
}

/**
 * Accepts PRIVATE records from the bounded trusted publisher intake,
 * never user input or paid API request. All outgoing data is a private
 * hash/clock receipt; raw source bytes and URLs never leave this function.
 * Upstream flags alone cannot prove original content authenticity.
 */
export async function verifyGeomacroOriginalPages({
  originals,now=new Date(),fetchImpl=fetch,
}={}){
  return verifyOriginalPageSet({originals,now,fetchImpl,minOriginals:2,
    schema:"geomacro.private-two-original-page-readback.v1"});
}

async function verifyOriginalPageSet({originals,now,fetchImpl,minOriginals,schema}){
  const {checked,category,claim}=checkedInputs(originals,now,{
    minOriginals,maxAgeMs:minOriginals===1?6*60*60*1000:24*60*60*1000,
  });
  // One HTTPS GET per distinct original organization. No retries, redirects,
  // concurrent bursts, D1/B2/DB calls, customer traffic or hidden payments.
  const results=[];
  for(const row of checked)results.push(await exactReadback(row,now,fetchImpl));
  const valid=results.every(x=>
    x.status==="PAGE_BYTES_AND_NATIVE_CLOCK_VERIFIED");
  return {
    schema,
    checked_at:now.toISOString(),category,
    same_event_claim_sha256:claim,
    verified_original_count:results.filter(x=>
      x.status==="PAGE_BYTES_AND_NATIVE_CLOCK_VERIFIED").length,
    checked_original_count:checked.length,
    original_pages_authenticity_and_clock_verified:valid,
    source_content_match_claim_semantically_verified:false,
    licensed_commercial_use_verified:false,
    external_independent_reviewer_attested:false,
    signed_gro_verified:false,commercial_eligible:false,
    payment_authorized:false,public_published:false,
    raw_source_exposed:false,b2_requests:0,d1_writes:0,
    supabase_requests:0,payments:0,results,
  };
}

/** Deliberately distinct single-original first-party proof. It NEVER implies
 * independent corroboration, approval of article-specific rights, scoring,
 * GRO signing or public-hot publication. Legacy multi-origin readers still
 * require at least TWO independent original publishers.
 */
export async function verifyGeomacroSingleOriginalPage({
  original,now=new Date(),fetchImpl=fetch,
}={}){
  if(!original||Array.isArray(original))
    throw Error("GEOMACRO_PRIVATE_SINGLE_ORIGINAL_INPUT_INVALID");
  const result=await verifyOriginalPageSet({
    originals:[original],now,fetchImpl,minOriginals:1,
    schema:"geomacro.private-single-original-page-readback.v1",
  });
  return Object.freeze({
    ...result,
    independent_same_event_sources_verified:false,
    original_source_count:1,
    commercial_rights_verified:false,
    signed_commercial_gro:false,
  });
}

/**
 * PRE-REVIEW ONLY: no semantic event identity has been approved yet.
 * The existing strict HTTPS publisher pin, bounded exact HTML bytes reader,
 * original publisher clock and six-hour time gate are reused without
 * manufacturing a same-event claim SHA to satisfy the signed risk profile.
 *
 * This profile returns an actual HTML-byte digest for a private review lead.
 * It cannot be submitted as a signed source or a commercial GRO.
 */
export async function verifyGeomacroUnclaimedOriginalPage({
  original,now=new Date(),fetchImpl=fetch,
}={}){
  if(!original||typeof original!=="object"||Array.isArray(original)||
     !(now instanceof Date)||!Number.isFinite(now.getTime())||
     typeof fetchImpl!=="function"||
     !CATEGORIES.has(original.category)||
     typeof original.original_article_url!=="string"||
     typeof original.original_published_at!=="string"||
     !TIME.test(original.original_published_at)||
     typeof original.originating_reporting_organization_id!=="string"||
     Object.hasOwn(original,"original_article_sha256"))
    fail();
  const uri=pinnedOriginalPage(original.original_article_url,original.category);
  const publisher=uri&&registeredOriginalPublisherOrganization(uri.hostname);
  const publication=Date.parse(original.original_published_at);
  if(!uri||publisher!==original.originating_reporting_organization_id||
     !Number.isFinite(publication)||publication>now.getTime()||
     now.getTime()-publication>6*60*60*1000)
    fail();
  const readback=await exactReadback({
    url:uri.href,expected_at:publication,expected_sha:null,
  },now,fetchImpl);
  const accepted=readback.status==="PAGE_BYTES_AND_NATIVE_CLOCK_VERIFIED";
  return Object.freeze({
    schema:"geomacro.private-unclaimed-original-pre-review.v1",
    status:accepted?"ORIGINAL_BYTES_AND_CLOCK_VERIFIED_REVIEW_PENDING":
      readback.reason,
    accepted,original_article_sha256:accepted?readback.article_sha256:null,
    original_native_published_at:accepted?readback.original_published_at:null,
    country_and_category_scope_review_pending:true,
    semantic_claim_reviewed:false,source_article_rights_verified:false,
    facts_signature_verified:false,rights_signature_verified:false,
    independent_corroboration_verified:false,
    commercial_eligible:false,signed_gro_created:false,
    public_hot_published:false,payment_authorized:false,
    raw_upstream_exposed:false,b2_requests:0,d1_writes:0,
    supabase_requests:0,payments:0,
  });
}
