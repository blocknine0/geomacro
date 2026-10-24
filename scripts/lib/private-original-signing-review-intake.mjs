import {ORIGINAL_VERIFICATION_WINDOW_MS} from "../../src/lib/original-verification-policy.ts";
import {createHash} from "node:crypto";
import {registeredOriginalPublisherOrganization} from "./independent-same-event-qualification.mjs";
import {verifyGeomacroUnclaimedOriginalPage} from "./geomacro-original-page-readback.mjs";
import {pinnedRbiPressReleaseLink} from "./rbi-official-macro-release.mjs";

/**
 * Machine-signing preparation, NOT a machine signing authority. Genuine
 * first-party source HTML is reread under the existing pin and native-clock
 * verifier. The trust boundary stops BEFORE semantic event review, article
 * commercial rights, counterevidence review, signatures or public promotion.
 *
 * Caller must keep `leads` ONLY in a private operator handoff. Publish only
 * the `receipt`, which never includes upstream URLs, titles or byte hashes.
 */
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const HASH=/^[a-f0-9]{64}$/u;
const ISO3=/^[A-Z]{3}$/u;
const MAX_AGE_MS=ORIGINAL_VERIFICATION_WINDOW_MS;
const fail=code=>{throw Error("PRIVATE_ORIGINAL_REVIEW_"+code)};
const sha=x=>createHash("sha256").update(x).digest("hex");
export async function preparePrivateOriginalSigningReview({
  country_iso3,discovery,pages,now=new Date(),readback=verifyGeomacroUnclaimedOriginalPage,
  maxRereads=2,
}={}){
 if(!ISO3.test(country_iso3??"")||!discovery||!pages||
    !(now instanceof Date)||!Number.isFinite(now.getTime())||
    discovery.discovery?.country_iso3!==country_iso3||
    !Array.isArray(discovery.private_original_review_candidates)||
    !Array.isArray(pages.verified_candidates)||
    !Number.isSafeInteger(pages.attempted)||pages.attempted<0||pages.attempted>4||
    !Number.isSafeInteger(discovery.discovery?.network_attempts)||
    discovery.discovery.network_attempts>12||
    discovery.discovery.network_attempts<0||
    !Number.isSafeInteger(maxRereads)||maxRereads<1||maxRereads>3||
    typeof readback!=="function")fail("INPUT_INVALID");
 const leads=[],attempts=[];
 const ids=new Set(),urls=new Set();
 const clock=now.getTime();
 // Page-date proof is not article-byte proof. Require the page to match one
 // source-native discovery identity (not a search index or country guess).
 const newest=[...pages.verified_candidates].sort((a,b)=>
   Date.parse(b.page_original_published_at)-Date.parse(a.page_original_published_at));
 // A busy domain cannot consume all rereads before another domain's genuine
 // original is examined. Keep one newest candidate/category ahead of extras.
 const firstByCategory=[...CATEGORIES].map(category=>
   newest.find(candidate=>candidate.domain===category)).filter(Boolean);
 const ordered=[...firstByCategory,...newest.filter(x=>!firstByCategory.includes(x))];
 for(const candidate of ordered){
  if(attempts.length>=maxRereads)break;
  const source=discovery.private_original_review_candidates.find(x=>
    x.article_identity_sha256===candidate.article_identity_sha256&&
    x.article_url===candidate.article_url&&
    x.article_title===candidate.article_title&&
    x.publisher_family===candidate.publisher_family&&
    x.domain===candidate.domain&&x.country_iso3===candidate.country_iso3);
  if(!source||candidate.country_iso3!==country_iso3||
     !CATEGORIES.has(candidate.domain)||
     !HASH.test(candidate.article_identity_sha256??"")||
     candidate.publisher_article_page_date_verified!==true||
     candidate.first_party_article_url_verified!==true||
     !source.first_party_article_url_verified ||
     source.derived_commercial_rights_verified!==false ||
     source.signed_gro_verified!==false ||
     typeof candidate.article_url!=="string"||
     typeof candidate.article_title!=="string"||
     candidate.article_title.length>500||
     urls.has(candidate.article_url) ||
     ids.has(candidate.article_identity_sha256))continue;
  let uri;
  try{uri=new URL(candidate.article_url)}catch{continue}
  const publisher=registeredOriginalPublisherOrganization(uri.hostname);
  // URL pin and content hash are independently enforced AGAIN by readback.
  if(uri.protocol!=="https:"||uri.username||uri.password||uri.port||
     (uri.search && !(candidate.domain==="macro" &&
       publisher==="rbi" &&
       pinnedRbiPressReleaseLink(candidate.article_url)===candidate.article_url))||
     uri.hash||!publisher)continue;
  const at=Date.parse(candidate.page_original_published_at);
  if(!Number.isFinite(at)||at>clock||clock-at>MAX_AGE_MS||
     (source.source_native_feed_publication_date_verified===true&&
      (!Number.isFinite(Date.parse(source.feed_item_published_at))||
       Math.abs(at-Date.parse(source.feed_item_published_at))>10*60_000)))continue;
  urls.add(candidate.article_url);ids.add(candidate.article_identity_sha256);
  let proof=null;
  try{
   proof=await readback({original:{
    category:candidate.domain,
    originating_reporting_organization_id:publisher,
    original_article_url:candidate.article_url,
    original_published_at:candidate.page_original_published_at,
   },now});
  }catch{/* An inaccessible article never becomes a verified signing input. */}
  attempts.push({category:candidate.domain,ok:proof?.accepted===true});
  if(proof?.schema!=="geomacro.private-unclaimed-original-pre-review.v1"||
     proof.accepted!==true||
     proof.status!=="ORIGINAL_BYTES_AND_CLOCK_VERIFIED_REVIEW_PENDING"||
     !HASH.test(proof.original_article_sha256??"")||
     proof.original_native_published_at!==new Date(at).toISOString()||
     proof.source_article_rights_verified!==false||
     proof.facts_signature_verified!==false||
     proof.rights_signature_verified!==false||
     proof.signed_gro_created!==false||
     proof.payment_authorized!==false)continue;
  // Private review lead only. The source's statement has NOT been semantically
  // checked, and no canonical WHO/WHAT/WHERE/WHEN event is fabricated.
  leads.push({
    schema:"geomacro.private-original-signing-review-lead.v1",
    disposition:"GENUINE_HTML_BYTES_DATE_VERIFIED_FACTS_AND_RIGHTS_PENDING",
    country_iso3,category:candidate.domain,
    issuer_organization_id:publisher,
    publisher_family:candidate.publisher_family,
    original_article_url:candidate.article_url,
    original_article_title:candidate.article_title,
    original_article_identity_sha256:candidate.article_identity_sha256,
    original_html_sha256:proof.original_article_sha256,
    native_original_publication_at:proof.original_native_published_at,
    observed_at:now.toISOString(),independent_original_count:0,
    semantic_event_claim_verified:false,
    country_topic_factual_scope_review_pending:true,
    original_article_commercial_rights_verified:false,
    source_registry_rights_qualified:false,
    reviewed_event_identity:null,rights_receipt_sha256:null,
    facts_signature:null,rights_signature:null,
    commercial_eligible:false,
  });
 }
 const counts=Object.fromEntries([...CATEGORIES].map(c=>
  [c,leads.filter(l=>l.category===c).length]));
 const receipt=Object.freeze({
  schema:"geomacro.private-original-signing-review-intake.v1",
  checked_at:now.toISOString(),country_iso3,
  discovery_attempts:discovery.discovery.network_attempts,
  original_page_attempts:pages.attempted,
  byte_exact_rereads_attempted:attempts.length,
  distinct_source_verified_pre_review_leads:leads.length,
  verified_original_counts_by_category:counts,
  status:leads.length>0?"FACTUAL_SOURCE_BYTES_VERIFIED_REVIEW_PENDING":
    "NO_CURRENT_BYTE_VERIFIED_SOURCE_FOR_REVIEW",
  native_original_clock_policy_enforced:true,article_bytes_reread:attempts.length>0,
  individual_country_category_semantic_claim_verified:false,
  article_specific_commercial_rights_verified:false,
  signed_machine_input_created:false,independent_facts_signature_verified:false,
  independent_rights_signature_verified:false,signed_gro_created:false,
  commercial_hot_published:false,x402_payment_authorized:false,
  all_195_countries_verified:false,
  private_upstream_article_url_logged:false,
  private_upstream_article_title_logged:false,
  private_article_hash_logged:false,
  B2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
 });
 return {receipt,leads};
}
