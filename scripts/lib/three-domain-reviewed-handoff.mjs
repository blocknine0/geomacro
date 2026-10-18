/**
 * Strict PRIVATE handoff from independently reviewed originals to the two
 * EXISTING public publisher input contracts. No signing, review authorization,
 * source discovery, country certification, B2 network, D1, Supabase or x402.
 * The authorizing review key must be pinned OUTSIDE this module.
 */
import {createHash,createPublicKey,verify as verifySignature} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {qualifyIndependentSameEvent} from "./independent-same-event-qualification.mjs";
import {GRI_CATEGORIES} from "./gri-engine-v12.js";
import {reviewedGriPortfolioProfile,GRI_RETAINED_MAX_AGE_MS} from "./gri-reviewed-source-window.mjs";

const SHA=/^[a-f0-9]{64}$/u;
const DOMAINS=new Set(GRI_CATEGORIES);
const MAX_CURRENT_MS=90*60_000;
const HIST_PREFIX="geomacro-evidence/v1/history/global-risk/gri-v1.2.0/";
const CERT_SCHEMA="geomacro.current-country-category-certification.v1";
const GRI_SCHEMA="geomacro.gri-v12-reviewed-current-input.v1";
const ERROR="THREE_DOMAIN_REVIEW_HANDOFF_";
const need=(x,code)=>{if(!x)throw Error(ERROR+code);};
const digest=(data)=>createHash("sha256").update(data).digest("hex");

function signedObject(envelope,key) {
  need(envelope&&typeof envelope==="object"&&!Array.isArray(envelope)&&
    Object.keys(envelope).length===2&&
    Object.hasOwn(envelope,"signed_input")&&
    Object.hasOwn(envelope,"review_signature_base64"),
  "SIGNED_ENVELOPE_REQUIRED");
  const sig=envelope.review_signature_base64;
  need(typeof sig==="string"&&/^[a-zA-Z0-9+/]{86}==$/u.test(sig),"REVIEW_SIGNATURE_REQUIRED");
  const value=envelope.signed_input;
  need(value&&typeof value==="object"&&!Array.isArray(value),"REVIEW_INPUT_INVALID");
  need(verifySignature(null,Buffer.from(JSON.stringify(value)),key,
    Buffer.from(sig,"base64")),"REVIEW_SIGNATURE_INVALID");
  return value;
}
function approvedKey(pem) {
  let key;
  try{key=createPublicKey(pem);}catch{throw Error(ERROR+"APPROVED_REVIEWER_KEY_MISSING");}
  need(key.asymmetricKeyType==="ed25519","APPROVED_REVIEWER_KEY_INVALID");
  return key;
}
function originalClock(value,now,maxAge=MAX_CURRENT_MS) {
  const t=Date.parse(value);
  return typeof value==="string"&&Number.isFinite(t)&&
    /Z$/u.test(value)&&t<=now+5*60_000&&now-t<=maxAge;
}

/**
 * Receive the completed externally signed GRI envelope and external signed
 * country/category certification, plus actual previously read-back B2 bytes.
 * No boolean from a feed or country-mesh registry upgrades to CERTIFIED.
 */
export function verifyThreeDomainReviewerHandoff({
  intelligence,reviewedGri,countryCategoryCertificates,
  historicalB2Bytes,trustedReviewerPublicKeyPem,now=new Date(),
}={}) {
  const time=now instanceof Date?now.getTime():NaN;
  need(Number.isFinite(time),"RUNTIME_CLOCK_INVALID");
  const key=approvedKey(trustedReviewerPublicKeyPem);
  need(intelligence&&typeof intelligence==="object"&&
    Object.keys(intelligence).length===2&&
    Array.isArray(intelligence.rows)&&
    Array.isArray(intelligence.eventPackages)&&
    intelligence.rows.length>=3&&
    intelligence.rows.length<=80,"INTELLIGENCE_INPUT_INVALID");
  const {rows,eventPackages}=intelligence;
  // Authenticate the exact current signed GRI profile BEFORE considering
  // the wider original lookback. Neither the free news queue nor any public
  // caller can select this path without the independent reviewer key.
  const gri=signedObject(reviewedGri,key);
  const retained=reviewedGriPortfolioProfile(gri);
  const originalWindow=retained?GRI_RETAINED_MAX_AGE_MS:MAX_CURRENT_MS;
  need(rows.length===eventPackages.length &&
    GRI_CATEGORIES.every(c=>rows.some(r=>r?.category===c)),
  "THREE_DOMAIN_REVIEW_REQUIRED");
  const qualified=qualifyIndependentSameEvent({
    rows,eventPackages,now,trustedReviewerPublicKeyPem,
    griRetainedPortfolio:retained,
  });
  need(qualified.receipt?.commercial_event_admission===true &&
    qualified.receipt.qualified_event_count===rows.length,
  "ORIGINAL_REVIEW_NOT_QUALIFIED");
  need(gri.schema===GRI_SCHEMA&&gri.private_only===false&&
    gri.publication_review_authorized===true&&
    gri.original_sources_independently_verified===true&&
    gri.canonical_scoring_and_story_reviewed===true&&
    gri.commercial_derived_rights_verified===true&&
    gri.historical_lineage_reviewed===true&&
    originalClock(gri.as_of,time)&&originalClock(gri.reviewed_at,time)&&
    Array.isArray(gri.customerRows)&&Array.isArray(gri.eventPackages)&&
    Array.isArray(gri.events)&&gri.events.length===rows.length&&
    JSON.stringify(gri.customerRows)===JSON.stringify(rows)&&
    JSON.stringify(gri.eventPackages)===JSON.stringify(eventPackages),
  "GRI_REVIEWED_CONTRACT_MISMATCH");
  const scoreById=new Map();
  for(const event of gri.events){
    need(event&&typeof event.id==="string"&&!scoreById.has(event.id)&&
      DOMAINS.has(event.category)&&
      Number.isInteger(event.severity)&&event.severity>=0&&event.severity<=100&&
      originalClock(event.published_at,time,originalWindow)&&
      originalClock(event.created_at,time,originalWindow)&&
      !String(event.story_cluster_id??"").startsWith("private-singleton:"),
    "GRI_EVENT_CLOCK_SCORE_OR_STORY_INVALID");
    scoreById.set(event.id,event);
  }
  if(retained)need([...scoreById.values()].some(event=>
    originalClock(event.published_at,time)),
  "RETAINED_PORTFOLIO_NO_NEW_ORIGINAL_EVENT");
  for(const row of rows){
    const event=scoreById.get(row.id);
    need(event&&event.category===row.category&&event.severity===row.severity&&
      event.created_at===row.created_at&&event.published_at===row.published_at,
    "SIGNED_ROW_SCORE_BINDING_MISMATCH");
  }

  // One independently signed country/category certificate per distinct
  // referenced country-domain cell. Country registry and upstream source
  // rights are still verified separately by the existing same-event gate.
  const requiredCells=new Map();
  for(const p of eventPackages) {
    need(Array.isArray(p?.evidence)&&p.evidence.length>=2 &&
      typeof p.event?.country_iso3==="string","ORIGINAL_COUNTRY_INVALID");
    const cell=p.event.country_iso3+"|"+p.category;
    const ids=p.evidence.map(e=>e.source_registry_id);
    need(ids.every(x=>typeof x==="string"&&/^[a-z][a-z0-9_]{1,100}$/u.test(x))&&
      new Set(ids).size===ids.length,"REGISTERED_RIGHTS_SOURCE_IDS_REQUIRED");
    const old=requiredCells.get(cell)??new Set();
    for(const id of ids)old.add(id);
    requiredCells.set(cell,old);
  }
  need(Array.isArray(countryCategoryCertificates)&&
    countryCategoryCertificates.length===requiredCells.size,
  "COUNTRY_CATEGORY_CERTIFICATION_MISSING");
  const certified=new Set();
  for(const signed of countryCategoryCertificates) {
    const cert=signedObject(signed,key);
    const cell=cert.country_iso3+"|"+cert.category;
    const required=requiredCells.get(cell);
    need(cert.schema===CERT_SCHEMA&&required&&!certified.has(cell)&&
      cert.certification_state==="CERTIFIED"&&
      cert.country_specific_original_evidence_verified===true&&
      cert.original_publisher_rights_verified===true&&
      cert.independent_same_event_review_verified===true&&
      cert.source_runtime_verified===true&&
      SHA.test(cert.certification_hash)&&
      originalClock(cert.verified_at,time)&&
      Array.isArray(cert.source_ids)&&
      cert.source_ids.length===required.size&&
      cert.source_ids.every(x=>required.has(x)),
    "COUNTRY_CATEGORY_UNCERTIFIED_OR_STALE");
    certified.add(cell);
  }
  const keyName=gri.history_b2_key;
  need(typeof keyName==="string"&&keyName.startsWith(HIST_PREFIX)&&
    /^[a-z0-9/_.-]+\.json\.gz$/u.test(keyName)&&
    !keyName.includes("..")&&SHA.test(gri.history_b2_sha256),
  "HISTORICAL_B2_PIN_NOT_SIGNED");
  const archive=Buffer.from(historicalB2Bytes??[]);
  need(archive.length>=30&&archive.length<=2*1024*1024&&
    digest(archive)===gri.history_b2_sha256,
  "HISTORICAL_B2_EXACT_READBACK_HASH_MISMATCH");
  let historical;
  try {
    historical=JSON.parse(gunzipSync(archive,{
      maxOutputLength:12*1024*1024,
    }).toString("utf8"));
  }catch{throw Error(ERROR+"HISTORICAL_GZIP_RESTORE_INVALID");}
  need(historical.schema==="geomacro.public-global-risk-history.v1"&&
    historical.methodology_version==="gri-v1.2.0"&&
    Array.isArray(historical.verified_snapshot_rows)&&
    historical.verified_snapshot_rows.length>=2&&
    historical.verified_snapshot_rows[0]?.verification_status==="verified"&&
    historical.snapshot_as_of===historical.verified_snapshot_rows[0]?.as_of&&
    Date.parse(historical.snapshot_as_of)<Date.parse(gri.as_of),
  "HISTORICAL_GRI_CONTINUITY_NOT_ESTABLISHED");
  // The subsequent PR #2249 GRI publisher still RE-verifies the full
  // original B2 bytes, canonical portable proof and actual continuity.
  const intelligenceBytes=Buffer.from(JSON.stringify({rows,eventPackages}));
  const griBytes=Buffer.from(JSON.stringify(reviewedGri));
  return {
    intelligenceInput:intelligenceBytes, reviewedGriInput:griBytes,
    receipt:{
      schema:"geomacro.three-domain-reviewer-handoff-verified.v1",
      independently_reviewer_signed:true,
      current_three_domain_originals_verified:true,
      signed_country_category_cells:certified.size,
      qualified_event_count:rows.length,
      retained_source_portfolio_review:retained,
      original_source_lookback_hours:retained?72:1.5,
      independent_event_receipt_sha256:qualified.receipt_sha256,
      intelligence_input_sha256:digest(intelligenceBytes),
      gri_input_sha256:digest(griBytes),
      historical_b2_sha256:gri.history_b2_sha256,
      historical_b2_object_key:keyName,
      historical_b2_bytes_verified:true,
      source_payload_publicly_exposed:false,
      supabase_requests:0,b2_requests:0,d1_writes:0,
      payments_executed:0,
    },
  };
}
