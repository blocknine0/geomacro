/**
 * #2043 Source observation -> PRIVATE SHA-only first-party review queue.
 *
 * The original first-party feed item is still UNVERIFIED. A topic-matching
 * title is only a hint, not claim/country/commodity corroboration. No raw
 * publisher title, URL, HTML, text, provider key, user query, or GRO is kept.
 * Queue is part of the existing compact D1 30-minute checkpoint, NOT a new
 * database or a publication/paid-delivery channel.
 */
const DOMAINS=new Set(["geopolitics","macro","rare_earth"]);
const SHA=/^[0-9a-f]{64}$/u;
const CLOCK=/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const MAX_PER_DOMAIN=240;
const MAX_AGE_MS=24*60*60*1000;
const STATES=new Set(["TOPIC_HINT_UNVERIFIED","NO_TOPIC_HINT"]);
const QUEUE_FIELDS=new Set([
  "schema","domain","article_sha256","native_published_at","first_queued_at",
  "intake_status","review_status","topic_hint","country_verified",
  "commodity_verified","same_event_reviewed","commercial_rights_verified",
  "signed_gro_verified","payment_eligible",
]);
const invalid=()=>new Error("PRIVATE_ORIGINAL_REVIEW_QUEUE_INVALID");
function ms(s) {
  if(typeof s!=="string"||!CLOCK.test(s))return NaN;
  return Date.parse(s);
}
function safeEntry(e,domain,now) {
  if(!e||typeof e!=="object"||Array.isArray(e)||
     Object.keys(e).some(key=>!QUEUE_FIELDS.has(key))||
     e.schema!=="geomacro.private-original-review-ref.v1"||
     e.domain!==domain||!SHA.test(e.article_sha256)||
     !Number.isFinite(ms(e.native_published_at))||
     ms(e.native_published_at)>now||
     !Number.isFinite(ms(e.first_queued_at))||
     ms(e.first_queued_at)>now ||
     ms(e.first_queued_at)<ms(e.native_published_at)||
     e.intake_status!=="OBSERVED"||
     e.review_status!=="UNVERIFIED"||
     !STATES.has(e.topic_hint)||
     e.country_verified!==false||e.commodity_verified!==false||
     e.same_event_reviewed!==false||e.commercial_rights_verified!==false||
     e.signed_gro_verified!==false||e.payment_eligible!==false)
    throw invalid();
}
/**
 * Only new identities from the independently validated cross-poll ledger
 * enter this queue. A repeated article is not a new event and must not start
 * a fresh review. Expiration is based on original source time, never on
 * first-seen/last-checked scheduler time.
 */
export function reconcilePrivateOriginalReviewQueue({
  domain,checkedAt,candidates=[],newArticleRefs=[],previousQueue,
}={}) {
  const now=ms(checkedAt);
  if(!DOMAINS.has(domain)||!Number.isFinite(now)||
     !Array.isArray(candidates)||candidates.length>80||
     !Array.isArray(newArticleRefs)||newArticleRefs.length>80||
     previousQueue!==undefined&&(!Array.isArray(previousQueue)||
       previousQueue.length>MAX_PER_DOMAIN))
    throw invalid();
  const queue=new Map();
  for(const e of previousQueue??[]) {
    safeEntry(e,domain,now);
    if(queue.has(e.article_sha256))throw invalid();
    if(now-ms(e.native_published_at)<=MAX_AGE_MS)
      queue.set(e.article_sha256,Object.fromEntries(
        [...QUEUE_FIELDS].map(k=>[k,e[k]])));
  }
  const byArticle=new Map();
  for(const c of candidates) {
    if(!c||c.schema!=="geomacro.private-original-article-candidate.v1"||
       c.domain!==domain||!SHA.test(c.original_article_sha256)||
       !SHA.test(c.headline_fingerprint_sha256)||
       !Number.isFinite(ms(c.native_published_at))||
       ms(c.native_published_at)>now||now-ms(c.native_published_at)>MAX_AGE_MS||
       c.read_transport_verified!==true||
       c.original_article_content_verified!==false||
       c.same_event_claim_identity_verified!==false||
       c.independently_authored_reporting_verified!==false||
       c.commercial_derived_use_rights_verified!==false||
       ![false,undefined].includes(c.article_category_relevance_verified)||
       c.eligible_for_scoring!==false||c.eligible_for_publication!==false||
       ![true,false,undefined].includes(c.discovery_topic_matched))
      throw invalid();
    const prior=byArticle.get(c.original_article_sha256);
    if(prior && (prior.native_published_at!==c.native_published_at ||
       prior.discovery_topic_matched!==c.discovery_topic_matched))
      throw invalid();
    byArticle.set(c.original_article_sha256,c);
  }
  if(new Set(newArticleRefs).size!==newArticleRefs.length)throw invalid();
  let added=0,withTopicHint=0;
  for(const ref of newArticleRefs) {
    if(!SHA.test(ref)||!byArticle.has(ref)||queue.has(ref))throw invalid();
    const candidate=byArticle.get(ref);
    const topic=candidate.discovery_topic_matched===true
      ?"TOPIC_HINT_UNVERIFIED":"NO_TOPIC_HINT";
    const e={
      schema:"geomacro.private-original-review-ref.v1",
      domain,article_sha256:ref,
      native_published_at:candidate.native_published_at,
      first_queued_at:checkedAt,
      intake_status:"OBSERVED",review_status:"UNVERIFIED",
      topic_hint:topic,
      country_verified:false,commodity_verified:false,
      same_event_reviewed:false,commercial_rights_verified:false,
      signed_gro_verified:false,payment_eligible:false,
    };
    queue.set(ref,e);added++;
    if(topic==="TOPIC_HINT_UNVERIFIED")withTopicHint++;
  }
  // Never silently evict a still-current original; stop checkpoint writes
  // rather than losing source identities or treating an overflow as "zero".
  if(queue.size>MAX_PER_DOMAIN)
    throw Error("PRIVATE_ORIGINAL_REVIEW_QUEUE_CAPACITY_EXCEEDED");
  const refs=[...queue.values()].sort((a,b)=>
    b.native_published_at.localeCompare(a.native_published_at)||
    a.article_sha256.localeCompare(b.article_sha256));
  return {
    schema:"geomacro.private-original-review-queue.v1",
    checked_at:checkedAt,domain,
    newly_queued:added,new_topic_hints_unverified:withTopicHint,
    awaiting_source_content_and_claim_review:refs.length,
    private_review_refs:refs,
    genuine_event_classifications_verified:0,
    independently_verified_same_event_claims:0,
    signed_gro_created:false,payment_eligible:false,
  };
}
