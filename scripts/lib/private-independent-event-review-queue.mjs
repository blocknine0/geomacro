import { createHash } from "node:crypto";
import {
  isCanonicalSameEventIdentity,
  registeredOriginalPublisherOrganization,
  sameEventClaimHash,
} from "./independent-same-event-qualification.mjs";

const MAX_CANDIDATES=96;
const HASH=/^[0-9a-f]{64}$/u;
const DATE=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
const MAX_AGE=6*60*60*1000;
const PAIR_WINDOW=90*60*1000;
const MAX_GROUPS=48;
const REASON=new Set([
  "SINGLE_ORIGIN","SAME_CONTENT","TEMPORAL_SPREAD",
  "MATERIAL_CONTRADICTION","MULTI_ORIGIN_REVIEW_REQUIRED",
]);
function reject() {throw Error("PRIVATE_EVENT_ORIGINAL_CANDIDATE_INVALID")}
function epoch(value,now) {
  if(typeof value!=="string"||!DATE.test(value))reject();
  const ms=Date.parse(value);
  if(!Number.isFinite(ms)||ms>now||now-ms>MAX_AGE)reject();
  return ms;
}
function parseOrigin(candidate) {
  let url;
  try{url=new URL(candidate.original_article_url)}catch{reject()}
  const organization=registeredOriginalPublisherOrganization(url.hostname.toLowerCase());
  if(url.protocol!=="https:"||url.username||url.password||
     url.port||url.hash||url.href.length>2048||
     url.hostname.toLowerCase()!==candidate.publisher_host||
     !organization||
     organization!==candidate.publisher_organization_id||
     organization!==candidate.originating_reporting_organization_id||
     (url.hostname.toLowerCase()==="www.canada.ca" &&
       !url.pathname.startsWith("/en/natural-resources-canada/")))
    reject();
  return organization;
}

/**
 * Bounded private, source-native multi-origin pairing stage. Returns only
 * event-claim hashes and numeric *review candidates*: NO reviewer signature,
 * NO commercial rights judgement, NO signed GRO, NO publication and NO
 * headline, URL, origin identity or private article bytes in output.
 *
 * The signer MUST inspect the private original event & legal/source receipts
 * before producing qualified eventPackages. A two-source cluster alone does
 * not promote any customer-facing row.
 */
export function clusterPrivateIndependentEventCandidates({
  candidates=[],now=new Date(),
}={}) {
  const nowMs=now instanceof Date?now.getTime():NaN;
  if(!Number.isFinite(nowMs)||!Array.isArray(candidates)||
     candidates.length>MAX_CANDIDATES)reject();
  const groups=new Map();
  const articleUnique=new Set();
  for(const c of candidates) {
    if(!c||typeof c!=="object"||Array.isArray(c)||
      !isCanonicalSameEventIdentity(c.category,c.event)||
      c.private_only!==true||
      c.native_published_at_verified!==true||
      c.original_article_content_verified!==true||
      c.original_publisher_url_verified!==true||
      c.independently_authored_reporting_verified!==true||
      c.syndicated_from!==null||
      !HASH.test(String(c.original_article_sha256??""))||
      !HASH.test(String(c.same_event_claim_sha256??""))||
      c.same_event_claim_sha256!==sameEventClaimHash(c.category,c.event)||
      c.commercial_eligible!==false||
      !["confirms","disputes","retracts"].includes(c.reporting_position))reject();
    const org=parseOrigin(c);
    const time=epoch(c.original_published_at,nowMs);
    const occurred=epoch(c.event.occurred_at,nowMs);
    if(time<occurred-5*60000)reject();
    const articleKey=org+"|"+c.original_article_sha256;
    if(articleUnique.has(articleKey))continue; // one syndicated/replayed artifact
    articleUnique.add(articleKey);
    const key=c.same_event_claim_sha256;
    if(!groups.has(key))groups.set(key,{category:c.category,records:[]});
    const group=groups.get(key);
    if(group.category!==c.category)reject();
    group.records.push({org,hash:c.original_article_sha256,time,
      position:c.reporting_position});
    if(groups.size>MAX_GROUPS)reject();
  }
  const report=[];
  for(const [claim_sha256,group] of groups) {
    const origins=new Set(group.records.map(e=>e.org));
    const contents=new Set(group.records.map(e=>e.hash));
    const times=group.records.map(e=>e.time);
    const spread=Math.max(...times)-Math.min(...times);
    const confirming=group.records.filter(e=>e.position==="confirms");
    const confirmingOrigins=new Set(confirming.map(e=>e.org));
    const confirmingContents=new Set(confirming.map(e=>e.hash));
    const disputingOrigins=new Set(group.records.filter(e=>
      e.position==="disputes").map(e=>e.org));
    const retractingOrigins=new Set(group.records.filter(e=>
      e.position==="retracts").map(e=>e.org));
    // One genuine retraction or original contradiction is sufficient to
    // block automatic qualification, EVEN if two other sources confirm.
    // Customer risk scoring must not outrun evidence updates.
    let state="MULTI_ORIGIN_REVIEW_REQUIRED";
    if(disputingOrigins.size||retractingOrigins.size)
      state="MATERIAL_CONTRADICTION";
    else if(confirmingOrigins.size<2)state="SINGLE_ORIGIN";
    else if(confirmingContents.size<2)state="SAME_CONTENT";
    else if(spread>PAIR_WINDOW)state="TEMPORAL_SPREAD";
    if(!REASON.has(state))reject();
    report.push({
      event_claim_sha256:claim_sha256,
      category:group.category,
      independent_origin_count:origins.size,
      distinct_article_hash_count:contents.size,
      confirming_origin_count:confirmingOrigins.size,
      disputing_origin_count:disputingOrigins.size,
      retracting_origin_count:retractingOrigins.size,
      original_publication_spread_minutes:Math.floor(spread/60000),
      state,
      review_required:true,commercial_eligible:false,
      materially_disputed_or_retracted:state==="MATERIAL_CONTRADICTION",
    });
  }
  report.sort((a,b)=>a.event_claim_sha256.localeCompare(b.event_claim_sha256));
  return {
    schema:"geomacro.private-multi-source-review-queue.v1",
    observed_at:now.toISOString(),
    examined_original_candidates:candidates.length,
    distinct_original_artifacts:articleUnique.size,
    matched_event_claims:report.length,
    review_candidates:report,
    independent_human_or_trusted_review_completed:false,
    original_legal_rights_proven:false,
    canonical_severity_scored:false,
    signed_gro_verified:false,
    b2_full_readback_verified:false,
    d1_current_hot_published:false,
    paid_data_eligible:false,
    customer_raw_news_or_sources_exposed:false,
    external_payment_performed:false,
    d1_writes:0,b2_requests:0,supabase_writes:0,
    receipt_sha256:createHash("sha256").update(JSON.stringify(report)).digest("hex"),
  };
}
