import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Commercial pre-publication event qualification. PRIVATE INPUT ONLY.
 *
 * A pair of articles is not a pair of confirmations unless two independently
 * authored first-party publishers make the *same precisely identified claim*.
 * One press-release syndicated to multiple outlets, different places/actions,
 * article re-indexing and a newer retrieval timestamp NEVER corroborate.
 *
 * This checks signed-off *internal* source verification results and rights
 * receipts; it does NOT fetch news, certify legal rights by itself, verify
 * Ed25519 GRO signatures or authorize settlement.
 */
export const SAME_EVENT_QUALIFICATION_SCHEMA =
  "geomacro.private-independent-same-event-qualification.v1";
const HASH=/^[0-9a-f]{64}$/u;
const ISO3=/^[A-Z]{3}$/u;
const TOKEN=/^[a-z][a-z0-9_-]{2,79}$/u;
const MAX_SOURCE_AGE=6*60*60*1000;
const MAX_EVENT_SPREAD=90*60*1000;
const DOMAINS=new Set(["geopolitics","macro","rare_earth"]);
const PUBLISHER_REGISTRY=Object.freeze({
  "news.un.org":"un_news",
  "www.gov.uk":"uk_fcdo",
  "www.ungeneva.org":"un_geneva",
  "www.federalreserve.gov":"federal_reserve",
  "www.ecb.europa.eu":"ecb",
  "www.usgs.gov":"usgs",
  "www150.statcan.gc.ca":"statistics_canada",
  "www.canada.ca":"natural_resources_canada",
});
const err=code=>{throw Error("INDEPENDENT_EVENT_"+code)};
// A valid event type in the WRONG category is not commercial intelligence.
const EVENT_TYPES_BY_CATEGORY=Object.freeze({
  geopolitics:new Set(["conflict_escalation","ceasefire","sanctions_policy","trade_disruption"]),
  macro:new Set(["central_bank_policy","inflation_release","fx_intervention","trade_disruption"]),
  rare_earth:new Set(["critical_mineral_supply","critical_mineral_export_control",
    "critical_mineral_production","trade_disruption"]),
});

// Reuse the project's *authoritative, explicit* 250-entity ISO3 registry.
// Do not mistake any three capital letters for a country, or silently
// introduce a competing generated country list into commercial admission.
// The trusted server-side publisher runs this module from the repository;
// missing/drifted registry is a hard fail BEFORE B2/D1/network/payment.
function approvedGlobalEntityIso3() {
  let source;
  try{
    source=readFileSync(new URL("../../src/lib/global-entity-classification.ts",
      import.meta.url),"utf8");
  }catch{err("CANONICAL_COUNTRY_REGISTRY_UNAVAILABLE")}
  const groups=[["SOVEREIGN_ISO3",194],["TERRITORY_ISO3",53],
    ["SPECIAL_ENTITY_ISO3",3]];
  const union=new Set();
  for(const [name,count] of groups){
    const start='const '+name+' = new Set([';
    const from=source.indexOf(start);
    const end=from<0?-1:source.indexOf("]);",from+start.length);
    if(from<0||end<0)err("CANONICAL_COUNTRY_REGISTRY_INVALID");
    const entries=[...source.slice(from+start.length,end)
      .matchAll(/"([A-Z]{3})"/gu)].map(x=>x[1]);
    if(entries.length!==count||new Set(entries).size!==count)
      err("CANONICAL_COUNTRY_REGISTRY_DRIFT");
    for(const code of entries){
      if(union.has(code))err("CANONICAL_COUNTRY_REGISTRY_OVERLAP");
      union.add(code);
    }
  }
  if(union.size!==250)err("CANONICAL_COUNTRY_REGISTRY_DRIFT");
  return union;
}
const CANONICAL_COUNTRY_ISO3=approvedGlobalEntityIso3();

// The reviewer must sign the *exact derived customer row* as well as the
// underlying source/evidence. Otherwise a paid publisher could keep a valid
// reviewer signature while silently modifying its severity, explanation or
// published_at (including advancing an expired original event's clock).
//
// This explicit allowlist is the same public B2 Intelligence projection, not
// internal publisher/source identities. Stable fixed ordering avoids object
// property insertion-order drift without ever using unsafe prototype writes.
const DERIVED_ROW_FIELDS=Object.freeze([
  "id","source_title","summary","category","severity",
  "delta","created_at","published_at","public_status",
]);
const UTC_TIME=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
function validUtcTime(s) {
  return typeof s==="string"&&UTC_TIME.test(s)&&
    Number.isFinite(Date.parse(s));
}
export function derivedCustomerRowSha256(row) {
  if(!row||typeof row!=="object"||Array.isArray(row)||
     ![Object.prototype,null].includes(Object.getPrototypeOf(row)))
    err("DERIVED_ROW_UNAPPROVED_SHAPE");
  const keys=Object.keys(row);
  if(keys.length!==DERIVED_ROW_FIELDS.length ||
     keys.some(k=>!DERIVED_ROW_FIELDS.includes(k))||
     DERIVED_ROW_FIELDS.some(k=>!Object.hasOwn(row,k)))
    err("DERIVED_ROW_UNAPPROVED_FIELDS");
  if(typeof row.id!=="string"||!/^[-_A-Za-z0-9]{1,128}$/u.test(row.id)||
     row.public_status!=="verified_b2"||!DOMAINS.has(row.category)||
     !Number.isInteger(row.severity)||row.severity<0||row.severity>100||
     (row.delta!==null&&
       (typeof row.delta!=="number"||!Number.isFinite(row.delta)))||
     !validUtcTime(row.created_at)||!validUtcTime(row.published_at))
    err("DERIVED_ROW_VALUE_INVALID");
  // Enforce concise, publisher-free, canonical public narrative. No raw
  // headlines, links, source metadata, rendered HTML or upstream fragments.
  if(typeof row.source_title!=="string"||
     !row.source_title.startsWith("Geomacro finds ")||
     row.source_title.length<22||row.source_title.length>280||
     (row.summary!==null&&
      (typeof row.summary!=="string"||
       row.summary.length<8||row.summary.length>190))||
     [row.source_title,row.summary??""].some(t=>
       /(?:https?:\/\/|www\.|<[^>]*>|\[(?:source|provider|publisher)\])/iu.test(t)))
    err("DERIVED_ROW_PUBLIC_TEXT_INVALID");
  const canonical=Object.create(null);
  for(const key of DERIVED_ROW_FIELDS)canonical[key]=row[key];
  const encoded=JSON.stringify(canonical);
  if(Buffer.byteLength(encoded,"utf8")>4096)
    err("DERIVED_ROW_OVERSIZE");
  return createHash("sha256").update(encoded,"utf8").digest("hex");
}

const canonical=value=>JSON.stringify(value);
const digest=value=>createHash("sha256").update(canonical(value)).digest("hex");
// Safe server-side shared authority used by unsigned private event grouping.
// This is an identity/type check, NOT source verification or an approval.
export function isCanonicalSameEventIdentity(category,identity) {
  return Boolean(identity&&EVENT_TYPES_BY_CATEGORY[category]?.has(identity.event_type)&&
    ISO3.test(identity.country_iso3)&&CANONICAL_COUNTRY_ISO3.has(identity.country_iso3)&&
    TOKEN.test(identity.actor_id)&&TOKEN.test(identity.target_id)&&
    TOKEN.test(identity.location_id));
}
export function registeredOriginalPublisherOrganization(hostname) {
  if(typeof hostname!=="string")return null;
  return Object.hasOwn(PUBLISHER_REGISTRY,hostname.toLowerCase())
    ? PUBLISHER_REGISTRY[hostname.toLowerCase()] : null;
}
function nativeTime(s,now){
  if(typeof s!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(s))
    err("NATIVE_PUBLICATION_TIME_INVALID");
  const ms=Date.parse(s);
  if(!Number.isFinite(ms)||ms>now+5*60000||now-ms>MAX_SOURCE_AGE||now-ms<0)
    err("NATIVE_PUBLICATION_TIME_OUTSIDE_WINDOW");
  return ms;
}
function checkedCounterevidenceReview(review,nowMs,maxOriginalMs,evidenceCount){
  // Part of the trusted Ed25519-signed PRIVATE package. No unchecked
  // counterevidence can be silently dropped during paid risk publication.
  // A signed "none found" is a bounded reviewer assertion, NOT a claim that
  // no contradiction exists globally. Source review receipts remain private.
  if(!review||typeof review!=="object"||Array.isArray(review)||
     review.independent_counterevidence_review_completed!==true||
     !HASH.test(review.review_receipt_sha256)||
     !Number.isInteger(review.sources_screened)||
     review.sources_screened<evidenceCount||
     review.sources_screened>200||
     !Number.isInteger(review.material_conflicts_detected)||
     review.material_conflicts_detected<0||
     review.material_conflicts_detected>review.sources_screened||
     !Number.isInteger(review.material_conflicts_resolved)||
     review.material_conflicts_resolved<0||
     review.material_conflicts_resolved>review.material_conflicts_detected||
     review.unresolved_material_conflicts!==
       review.material_conflicts_detected-review.material_conflicts_resolved||
     review.unresolved_material_conflicts!==0||
     !Number.isInteger(review.retractions_detected)||
     review.retractions_detected!==0)
    err("COUNTEREVIDENCE_REVIEW_UNRESOLVED");
  const at=nativeTime(review.reviewed_at,nowMs);
  if(at<maxOriginalMs||nowMs-at>90*60*1000)
    err("COUNTEREVIDENCE_REVIEW_STALE");
}

function verifiedArticle(e,claim,now){
  if(!e||typeof e!=="object"||Array.isArray(e)||
     !HASH.test(e.original_article_sha256)||!HASH.test(e.rights_receipt_sha256)||
     !HASH.test(e.independent_review_sha256)||
     !TOKEN.test(e.publisher_organization_id)||
     !TOKEN.test(e.originating_reporting_organization_id)||
     !HASH.test(e.same_event_claim_sha256)||
     e.same_event_claim_sha256!==claim||
     e.native_published_at_verified!==true||
     e.original_article_content_verified!==true||
     e.independently_authored_reporting_verified!==true||
     e.commercial_derived_use_rights_verified!==true||
     e.reporting_position!=="confirms"||
     e.syndicated_from!==null||
     e.original_publisher_url_verified!==true||
     typeof e.url!=="string") err("SOURCE_ATTESTATION_UNVERIFIED");
  let uri;
  try{uri=new URL(e.url)}catch{err("ORIGINAL_URL_INVALID")}
  if(uri.protocol!=="https:"||uri.username||uri.password||uri.port||
    uri.hash||uri.href.length>2048||
    uri.hostname.toLowerCase()!==String(e.publisher_host??"").toLowerCase()||
    !/^[a-z0-9.-]+\.[a-z]{2,24}$/u.test(uri.hostname))
    err("ORIGINAL_HOST_UNVERIFIED");
  // A publisher host must be bound to a reviewed organization (not an
  // ungrounded public candidate's arbitrary organization string).
  if(e.publisher_organization_id!==e.originating_reporting_organization_id)
    err("SYNDICATION_OR_SHARED_ORIGIN");
  if(PUBLISHER_REGISTRY[uri.hostname]!==e.publisher_organization_id ||
    (uri.hostname==="www.canada.ca" &&
     !uri.pathname.startsWith("/en/natural-resources-canada/")))
    err("UNREGISTERED_ORIGINATING_ORGANIZATION");
  const ms=nativeTime(e.original_published_at,now);
  return {ms,organization:e.originating_reporting_organization_id,
    content:e.original_article_sha256,review:e.independent_review_sha256,
    host:uri.hostname};
}
export function sameEventClaimHash(category,identity){
  return digest({
    category,country_iso3:identity.country_iso3,
    event_type:identity.event_type,actor_id:identity.actor_id,
    target_id:identity.target_id,location_id:identity.location_id,
    occurred_at:identity.occurred_at,
  });
}

export function qualificationReviewSigningBytes(value){
  const {review_signature_base64:signature,...signed}=value;
  return Buffer.from(JSON.stringify(signed),"utf8");
}
export function qualifyIndependentSameEvent({
  rows,eventPackages,now=new Date(),trustedReviewerPublicKeyPem,
}={}) {
  const nowMs=now instanceof Date?now.getTime():NaN;
  if(!Number.isFinite(nowMs)||!Array.isArray(rows)||!Array.isArray(eventPackages)||
    rows.length<1||rows.length>80||rows.length!==eventPackages.length)
    err("INPUT_INVALID");
  const seen=new Set();
  // Prevent one actual development from being sold or ranked multiple times
  // under distinct derived row IDs within the same signed publication batch.
  const seenEventClaims=new Set();
  const qualified=[];
  for(let i=0;i<rows.length;i++){
    const row=rows[i],pkg=eventPackages[i];
    if(!row||!pkg||row.public_status!=="verified_b2"||
      !DOMAINS.has(row.category)||typeof row.id!=="string"||
      row.id!==pkg.event_id||row.category!==pkg.category||
      seen.has(row.id)||!Number.isInteger(row.severity)||
      row.severity<0||row.severity>100||
      pkg.schema!==SAME_EVENT_QUALIFICATION_SCHEMA)
      err("ROW_BINDING_INVALID");
    seen.add(row.id);
    const identity=pkg.event;
    if(!isCanonicalSameEventIdentity(row.category,identity)||
      !HASH.test(pkg.same_event_claim_sha256)||
      pkg.independent_same_event_review_verified!==true||
      !HASH.test(pkg.same_event_reviewer_receipt_sha256)||
      !Array.isArray(pkg.evidence)||pkg.evidence.length<2||
      pkg.evidence.length>6)
      err("EVENT_IDENTITY_OR_REVIEW_INVALID");
    const identityHash=sameEventClaimHash(row.category,identity);
    if(identityHash!==pkg.same_event_claim_sha256)
      err("EVENT_CLAIM_HASH_MISMATCH");
    // Two reviewer signatures and two customer row IDs must not multiply
    // a single WHO/WHAT/WHERE/WHEN event identity into multiple billable
    // events. Cross-category product views remain governed separately.
    if(seenEventClaims.has(identityHash))
      err("DUPLICATE_CANONICAL_EVENT_CLAIM");
    seenEventClaims.add(identityHash);
    const when=nativeTime(identity.occurred_at,nowMs);
    const reviewedRowHash=derivedCustomerRowSha256(row);
    // Reviewed output must be bound into the trusted Ed25519 event package;
    // an original article cannot authorize an unrelated severity or gist.
    if(!HASH.test(pkg.reviewed_derived_row_sha256)||
       pkg.reviewed_derived_row_sha256!==reviewedRowHash)
      err("DERIVED_ROW_REVIEW_BINDING_INVALID");
    const sources=pkg.evidence.map(e=>verifiedArticle(e,identityHash,nowMs));
    // The customer-facing published clock must describe the original
    // event or a first-party reviewed article publication, NEVER this
    // publisher's B2 upload/restore/deployment timestamp.
    const publishedAt=Date.parse(row.published_at);
    if(publishedAt>nowMs || nowMs-publishedAt>MAX_SOURCE_AGE ||
       ![when,...sources.map(s=>s.ms)].includes(publishedAt))
      err("DERIVED_ROW_ORIGINAL_TIME_MISMATCH");
    if(sources.some(s=>s.ms<when-5*60000)||
      Math.max(...sources.map(s=>s.ms))-Math.min(...sources.map(s=>s.ms))>
        MAX_EVENT_SPREAD)
      err("SAME_EVENT_TEMPORAL_MISMATCH");
    // A final customer-visible scored object cannot truthfully have been
    // CREATED before the last required independent original confirmation
    // existed. Signed source/published clocks must never be swapped for a
    // pre-confirmation ingestion or future wall-clock timestamp.
    const scoredAt=Date.parse(row.created_at);
    if(scoredAt>nowMs+5*60000 ||
       scoredAt<Math.max(when,...sources.map(s=>s.ms),publishedAt))
      err("DERIVED_ROW_PRECONFIRMATION_OR_FUTURE_CLOCK");
    const independentOrganizations=new Set(sources.map(s=>s.organization));
    if(independentOrganizations.size<2 ||
      new Set(sources.map(s=>s.content)).size<2 ||
      new Set(sources.map(s=>s.review)).size<2 ||
      new Set(sources.map(s=>s.host)).size<2)
      err("SOURCE_FAMILY_NOT_INDEPENDENT");
    checkedCounterevidenceReview(pkg.counterevidence_review,nowMs,
      Math.max(...sources.map(s=>s.ms)),sources.length);
    // The reviewed *complete* event package (all source and rights claims)
    // must be signed by a separately trusted Ed25519 review key. Arbitrary
    // booleans, hashes and press syndication are not enough.
    if(typeof trustedReviewerPublicKeyPem!=="string"||
       !trustedReviewerPublicKeyPem.includes("BEGIN PUBLIC KEY"))
      err("TRUSTED_REVIEW_KEY_REQUIRED");
    if(typeof pkg.review_signature_base64!=="string"||
       !/^[A-Za-z0-9+/]{86}==$/u.test(pkg.review_signature_base64))
      err("INDEPENDENT_REVIEW_SIGNATURE_REQUIRED");
    try{
      const key=createPublicKey(trustedReviewerPublicKeyPem);
      if(key.asymmetricKeyType!=="ed25519"||
         !verifySignature(null,qualificationReviewSigningBytes(pkg),key,
           Buffer.from(pkg.review_signature_base64,"base64")))
        err("INDEPENDENT_REVIEW_SIGNATURE_INVALID");
    }catch(error){
      if(error instanceof Error && error.message.startsWith("INDEPENDENT_EVENT_"))
        throw error;
      err("INDEPENDENT_REVIEW_SIGNATURE_INVALID");
    }
    qualified.push({event_id:row.id,category:row.category,
      event_claim_sha256:identityHash,
      reviewed_derived_row_sha256:reviewedRowHash,
      independent_reporting_organizations:independentOrganizations.size,
      counterevidence_review_signed:true,
      unresolved_material_conflicts:0,retractions_detected:0,
      source_native_freshness_verified:true,
      same_event_structured_identity_verified:true,
      review_and_derived_use_rights_receipts_present:true,
      source_bytes_private_only:true,
      trusted_ed25519_review_signature_verified:true});
  }
  const receipt={
    schema:"geomacro.commercial-independent-event-admission.v1",
    generated_at:now.toISOString(),commercial_event_admission:true,
    qualified_event_count:qualified.length,
    per_domain:Object.fromEntries([...DOMAINS].map(d=>[
      d,qualified.filter(q=>q.category===d).length])),
    qualified,
    no_raw_news_exposed:true,no_publisher_url_exposed:true,
    source_text_reproduced:false,payment_performed:false,
    b2_requests:0,d1_writes:0,supabase_writes:0,
    // Attested input may still require independent external legal/licence
    // and artifact signature verification downstream; never infer x402.
    signed_gro_and_b2_verified:false,
    x402_mainnet_ready:false,
  };
  return {receipt,receipt_sha256:digest(receipt)};
}
