import {createHash} from "node:crypto";
import {verifyGeomacroSingleOriginalPage} from "./geomacro-original-page-readback.mjs";
import {isCanonicalSameEventIdentity,sameEventClaimHash,
 registeredOriginalPublisherOrganization} from "./independent-same-event-qualification.mjs";

/**
 * Founder policy: ONE genuine original may establish a factual observation.
 * This DOES NOT claim independent corroboration, signed commercial rights,
 * trusted facts/rights attestations, a GRO, a score, or x402 eligibility.
 *
 * Accept only the first-party publisher's exact HTML SHA and source-native
 * publication clock, using the existing same-event identity and URL pin.
 * Private metadata/flags never substitute for independently read bytes.
 */
const HASH=/^[a-f0-9]{64}$/u;
const UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
const CATS=new Set(["geopolitics","macro","rare_earth"]);
const FAIL="GEOMACRO_SINGLE_ORIGINAL_INPUT_INVALID";
const fail=()=>{throw Error(FAIL)};
const sha=x=>createHash("sha256").update(JSON.stringify(x),"utf8").digest("hex");
function denied(code){
 return Object.freeze({
  schema:"geomacro.private-single-original-binding.v1",
  status:code,accepted:false,
  verified_first_party_original_count:0,
  independent_original_source_count:0,
  independent_same_event_corroboration_verified:false,
  semantic_claim_checked_by_custodian:false,
  article_specific_commercial_rights_verified:false,
  facts_authority_signature_verified:false,
  rights_authority_signature_verified:false,
  signed_commercial_gro:false,
  public_hot_published:false,payment_authorized:false,
  b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
 });
}
/** @param {{candidate?: unknown, now?: Date, fetchImpl?: typeof fetch}} [options] */
export async function verifyGeomacroSingleOriginalBinding({
 candidate,now=new Date(),fetchImpl=fetch,
}={}){
 if(!candidate||typeof candidate!=="object"||Array.isArray(candidate)||
    !(now instanceof Date)||!Number.isFinite(now.getTime())||
    typeof fetchImpl!=="function"||
    !CATS.has(candidate.category)||
    !isCanonicalSameEventIdentity(candidate.category,candidate.event)||
    typeof candidate.event.occurred_at!=="string"||
    !UTC.test(candidate.event.occurred_at)||
    typeof candidate.original_published_at!=="string"||
    !UTC.test(candidate.original_published_at)||
    candidate.same_event_claim_sha256!==sameEventClaimHash(candidate.category,candidate.event)||
    candidate.private_only!==true||
    candidate.original_article_content_verified!==true||
    candidate.original_publisher_url_verified!==true||
    candidate.native_published_at_verified!==true||
    candidate.independently_authored_reporting_verified!==true||
    candidate.syndicated_from!==null||
    candidate.commercial_eligible!==false||
    candidate.reporting_position!=="confirms"||
    !HASH.test(candidate.original_article_sha256??"")||
    typeof candidate.original_article_url!=="string"||
    typeof candidate.publisher_host!=="string"||
    candidate.originating_reporting_organization_id!==candidate.publisher_organization_id)
  fail();
 let parsed;
 try{parsed=new URL(candidate.original_article_url)}catch{fail()}
 if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.port||
    parsed.search||parsed.hash||
    parsed.hostname!==candidate.publisher_host||
    registeredOriginalPublisherOrganization(parsed.hostname)!==
      candidate.originating_reporting_organization_id)fail();
 const clock=now.getTime(),occurred=Date.parse(candidate.event.occurred_at),
   published=Date.parse(candidate.original_published_at);
 if(!Number.isFinite(occurred)||!Number.isFinite(published)||
    occurred>published+5*60_000||published>clock||
    published<occurred-5*60_000||clock-published>6*60*60_000)fail();
 let pages;
 try{pages=await verifyGeomacroSingleOriginalPage({
   original:{
    category:candidate.category,
    same_event_claim_sha256:candidate.same_event_claim_sha256,
    originating_reporting_organization_id:candidate.originating_reporting_organization_id,
    original_article_url:candidate.original_article_url,
    original_published_at:candidate.original_published_at,
    reporting_position:candidate.reporting_position,
    expected_html_sha256:candidate.original_article_sha256,
   },now,fetchImpl,
 })}catch{return denied("ORIGINAL_BYTES_OR_CLOCK_UNVERIFIED")}
 if(pages.schema!=="geomacro.private-single-original-page-readback.v1"||
    pages.checked_original_count!==1||pages.verified_original_count!==1||
    pages.original_pages_authenticity_and_clock_verified!==true||
    pages.independent_same_event_sources_verified!==false||
    pages.results?.length!==1||
    pages.results[0]?.article_sha256!==candidate.original_article_sha256||
    pages.same_event_claim_sha256!==candidate.same_event_claim_sha256||
    pages.results[0]?.status!=="PAGE_BYTES_AND_NATIVE_CLOCK_VERIFIED")
  return denied("ORIGINAL_BYTES_OR_CLOCK_UNVERIFIED");
 const exactSet=[{
  article_bytes_sha256:pages.results[0].article_sha256,
  original_published_at:pages.results[0].original_published_at,
  same_event_claim_sha256:candidate.same_event_claim_sha256,
 }];
 return Object.freeze({
  ...denied("SINGLE_ORIGINAL_FACTUAL_EVIDENCE_VERIFIED_RIGHTS_PENDING"),
  accepted:true,verified_first_party_original_count:1,
  original_article_sha256:candidate.original_article_sha256,
  exact_original_evidence_set_sha256:sha(exactSet),
  original_native_publication_at:pages.results[0].original_published_at,
  source_claim_sha256:candidate.same_event_claim_sha256,
  // This records independently read first-party bytes, NOT two sources.
 });
}
