import { createHash } from "node:crypto";

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
const TYPES=new Set([
  "conflict_escalation","ceasefire","sanctions_policy","trade_disruption",
  "central_bank_policy","inflation_release","fx_intervention",
  "critical_mineral_supply","critical_mineral_export_control",
  "critical_mineral_production",
]);
const err=code=>{throw Error("INDEPENDENT_EVENT_"+code)};
const canonical=value=>JSON.stringify(value);
const digest=value=>createHash("sha256").update(canonical(value)).digest("hex");
function nativeTime(s,now){
  if(typeof s!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(s))
    err("NATIVE_PUBLICATION_TIME_INVALID");
  const ms=Date.parse(s);
  if(!Number.isFinite(ms)||ms>now+5*60000||now-ms>MAX_SOURCE_AGE||now-ms<0)
    err("NATIVE_PUBLICATION_TIME_OUTSIDE_WINDOW");
  return ms;
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
  const ms=nativeTime(e.original_published_at,now);
  return {ms,organization:e.originating_reporting_organization_id,
    content:e.original_article_sha256,review:e.independent_review_sha256,
    host:uri.hostname};
}
export function qualifyIndependentSameEvent({
  rows,eventPackages,now=new Date(),
}={}) {
  const nowMs=now instanceof Date?now.getTime():NaN;
  if(!Number.isFinite(nowMs)||!Array.isArray(rows)||!Array.isArray(eventPackages)||
    rows.length<1||rows.length>80||rows.length!==eventPackages.length)
    err("INPUT_INVALID");
  const seen=new Set();
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
    if(!identity||!TYPES.has(identity.event_type)||
      !ISO3.test(identity.country_iso3)||
      !TOKEN.test(identity.actor_id)||!TOKEN.test(identity.target_id)||
      !TOKEN.test(identity.location_id)||
      !HASH.test(pkg.same_event_claim_sha256)||
      pkg.independent_same_event_review_verified!==true||
      !HASH.test(pkg.same_event_reviewer_receipt_sha256)||
      !Array.isArray(pkg.evidence)||pkg.evidence.length<2||
      pkg.evidence.length>6)
      err("EVENT_IDENTITY_OR_REVIEW_INVALID");
    const identityHash=digest({
      category:row.category,country_iso3:identity.country_iso3,
      event_type:identity.event_type,actor_id:identity.actor_id,
      target_id:identity.target_id,location_id:identity.location_id,
      occurred_at:identity.occurred_at,
    });
    if(identityHash!==pkg.same_event_claim_sha256)
      err("EVENT_CLAIM_HASH_MISMATCH");
    const when=nativeTime(identity.occurred_at,nowMs);
    const sources=pkg.evidence.map(e=>verifiedArticle(e,identityHash,nowMs));
    if(sources.some(s=>s.ms<when-5*60000)||
      Math.max(...sources.map(s=>s.ms))-Math.min(...sources.map(s=>s.ms))>
        MAX_EVENT_SPREAD)
      err("SAME_EVENT_TEMPORAL_MISMATCH");
    if(new Set(sources.map(s=>s.organization)).size<2 ||
      new Set(sources.map(s=>s.content)).size<2 ||
      new Set(sources.map(s=>s.review)).size<2 ||
      new Set(sources.map(s=>s.host)).size<2)
      err("SOURCE_FAMILY_NOT_INDEPENDENT");
    qualified.push({event_id:row.id,category:row.category,
      event_claim_sha256:identityHash,
      independent_reporting_organizations:sources.length,
      source_native_freshness_verified:true,
      same_event_structured_identity_verified:true,
      review_and_derived_use_rights_receipts_present:true,
      source_bytes_private_only:true});
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
