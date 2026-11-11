/**
 * Strict local admission of 10 REAL same-event independent original pairs.
 * Cryptographic checks are necessary but not substitutes for production
 * registry readback, original-source independent review or legal rights.
 */
import {validateAttesterKeys,verifyIndependentAttestations}
 from "./risk-stream-shadow-attesters.mjs";
const ROLES={
 GEOPOLITICS:["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"],
 MACRO_FX:["OFFICIAL_STATISTICS","MARKET_PRICE"],
 CRITICAL_MINERALS:["TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]
};
const HEX=/^[a-f0-9]{64}$/u,ISO3=/^[A-Z]{3}$/u;
const DATE72=72*3600_000,DATE48=48*3600_000;
function need(b,msg){if(!b)throw Error("REAL_ORIGINAL_MANIFEST_HOLD_"+msg)}
export function validateRealOriginalManifest(events,{
 factsPublicB64,rightsPublicB64,now=new Date()
}={}){
 const {keys,fingerprints}=validateAttesterKeys(factsPublicB64,rightsPublicB64);
 need(Array.isArray(events)&&events.length===20,"EXACTLY_TWENTY_ORIGINALS_REQUIRED");
 const seenIds=new Set(),pairs=new Map(),registry=new Map();
 for(const e of events){
  need(e?.schema==="geomacro.risk-stream-candidate.v1"&&
   e.kind==="VERIFIED_ORIGINAL"&&ISO3.test(e.country_iso3??"")&&
   Object.hasOwn(ROLES,e.category)&&
   ["OFFICIAL_API","RSS","WEBSITE_INTELLIGENCE"].includes(e.feed_origin)&&
   /^[A-Z0-9][A-Z0-9:_-]{6,119}$/.test(e.event_key??"")&&
   HEX.test(e.event_fingerprint??"")&&HEX.test(e.original_page_sha256??"")&&
   /^[a-z0-9][a-z0-9_.:-]{2,119}$/.test(e.source_id??"")&&
   /^[a-z0-9.-]{3,253}$/.test(e.publisher_root_domain??"")&&
   /^[a-z0-9_.:-]{1,100}$/.test(e.parent_media_entity??"")&&
   ROLES[e.category].includes(e.source_role)&&
   Array.isArray(e.entities)&&e.entities.length>0&&e.entities.length<=12&&
   e.entities.every(x=>typeof x==="string"&&/^[A-Z0-9:_-]{2,64}$/.test(x))&&
   new Set(e.entities).size===e.entities.length&&
   e.entities.join("|")===[...e.entities].sort().join("|")&&
   e.derived&&Object.keys(e.derived).sort().join("|")==="market|watch|what|why"&&
   Object.values(e.derived).every(x=>typeof x==="string"&&x.length>=6&&
    x.length<=360&&!/https?:\/\/|<[^>]+>|[\r\n]/iu.test(x))&&
   typeof e.raw_payload==="string"&&e.raw_payload.length>=16&&
   e.raw_payload.length<=8000&&Buffer.byteLength(e.raw_payload,"utf8")<=8000,
   "ORIGINAL_CANDIDATE_SCHEMA_INVALID");
  let url;try{url=new URL(e.source_url)}catch{need(false,"ORIGINAL_URL_INVALID")}
  need(url.protocol==="https:"&&!url.username&&!url.password&&!url.port&&!url.hash&&
   (url.hostname===e.publisher_root_domain||
    url.hostname.endsWith("."+e.publisher_root_domain))&&
   !/(\.invalid|\.example|\.test|example\.(com|org|net))$/u.test(url.hostname),
   "ORIGINAL_SOURCE_URL_NOT_REAL_PUBLISHER");
  const t=Date.parse(e.published_at);
  need(Number.isFinite(t)&&t<=now.getTime()+60_000&&now.getTime()-t<=DATE72,
   "ORIGINAL_PUBLICATION_FRESHNESS_INVALID");
  const rv=e.rights_verification;
  need(rv&&rv.registry_source_id===e.source_id&&
   rv.registry_enabled===true&&rv.registry_commercial_rights_approved===true&&
   typeof rv.independent_reviewer_id==="string"&&
   /^[a-zA-Z0-9_.:-]{3,100}$/.test(rv.independent_reviewer_id)&&
   typeof rv.authorization_reference==="string"&&
   rv.authorization_reference.length>=8&&rv.authorization_reference.length<=512&&
   typeof rv.checked_at_utc==="string"&&
   Number.isFinite(Date.parse(rv.checked_at_utc))&&
   Date.parse(rv.checked_at_utc)<=now.getTime()+60_000&&
   now.getTime()-Date.parse(rv.checked_at_utc)<30*86400_000&&
   (rv.rights_expires_at_utc===null||
    (Number.isFinite(Date.parse(rv.rights_expires_at_utc))&&
     Date.parse(rv.rights_expires_at_utc)>now.getTime())),
   "RIGHTS_OPERATOR_REVIEW_METADATA_MISSING_OR_STALE");
  // Cryptographic verification covers the exact original-facts claim,
  // not any unsigned rights_verification metadata supplied by an operator.
  verifyIndependentAttestations(e,keys);
  const identity=e.source_id+"|"+e.event_fingerprint;
  need(!seenIds.has(identity),"SOURCE_EVENT_REPLAY_DUPLICATE");
  seenIds.add(identity);
  const previous=registry.get(e.source_id);
  const spec=[e.publisher_root_domain,e.parent_media_entity,e.source_role].join("|");
  need(!previous||previous===spec,"SOURCE_IDENTITY_CONFLICT");
  registry.set(e.source_id,spec);
  if(!pairs.has(e.event_fingerprint))pairs.set(e.event_fingerprint,[]);
  pairs.get(e.event_fingerprint).push(e);
 }
 need(pairs.size===10,"EXACTLY_TEN_DISTINCT_EVENTS_REQUIRED");
 for(const pair of pairs.values()){
  need(pair.length===2,"ORIGINAL_PAIR_SIZE_NOT_TWO");
  const [a,b]=pair;
  need(a.country_iso3===b.country_iso3&&a.category===b.category&&
   a.event_key===b.event_key&&
   a.source_id!==b.source_id&&
   a.publisher_root_domain!==b.publisher_root_domain&&
   a.parent_media_entity!==b.parent_media_entity&&
   a.entities.some(x=>b.entities.includes(x))&&
   Math.abs(Date.parse(a.published_at)-Date.parse(b.published_at))<=DATE48&&
   ROLES[a.category].every(role=>pair.some(x=>x.source_role===role)),
   "INDEPENDENT_SAME_EVENT_ROLE_OR_WINDOW_INVALID");
 }
 return {status:"LOCAL_SIGNED_ORIGINAL_PAIR_PREFLIGHT_PASS",
  originals:events.length,independent_pairs:pairs.size,
  sources:registry.size,fingerprints,local_cryptographic_signatures_verified:20,
  operator_rights_metadata_reviewed:true,
  actual_production_rights_registry_verified:false,
  source_fetch_independence_verified_externally:false,
  customer_delivery_authorized:false};
}
