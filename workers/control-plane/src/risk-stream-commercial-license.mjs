/**
 * GeoMacro-only DERIVED intellectual-property redistribution licence.
 * Signature proves issuance/integrity, never truth, third-party source rights
 * or customer entitlement. The licence never covers source articles.
 */
import {isHot50RiskCountry} from "./risk-gate-hot50-scope.mjs";
export const GEOMACRO_LICENSE_ID="GEOMACRO_COMMERCIAL_REDISTRIBUTION_v1";
export const GEOMACRO_DERIVED_RIGHTS="GEOMACRO_COMMERCIAL_DERIVED_INTELLIGENCE";
const SCHEMA="geomacro.commercial-derived-risk-envelope.v1";
const DOMAIN="geomacro.commercial-derived-risk-license.v1\n";
const HASH=/^[a-f0-9]{64}$/u;
const ALLOWED=new Set(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
const enc=new TextEncoder();
const fail=c=>{throw Error("GEOMACRO_LICENSE_"+c)};
const bytes=s=>enc.encode(s);
export function canonicalLicensedJson(value){
 if(value===null||typeof value==="boolean"||typeof value==="string")return JSON.stringify(value);
 if(typeof value==="number"&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return "["+value.map(canonicalLicensedJson).join(",")+"]";
 if(value&&typeof value==="object"&&
    Object.keys(value).every(x=>x!=="__proto__"&&x!=="constructor"))
   return "{"+Object.keys(value).sort().map(x=>JSON.stringify(x)+":"+
    canonicalLicensedJson(value[x])).join(",")+"}";
 fail("CANONICAL_NON_JSON");
}
export const licensedSha=async value=>Array.from(
 new Uint8Array(await crypto.subtle.digest("SHA-256",bytes(value))),
 x=>x.toString(16).padStart(2,"0")).join("");
function decoded(v){
 if(typeof v!=="string"||!/^[A-Za-z0-9+/]+={0,2}$/u.test(v))fail("KEY_ENCODING_INVALID");
 const b=Uint8Array.from(atob(v),c=>c.charCodeAt(0));
 if(btoa(String.fromCharCode(...b))!==v)fail("KEY_NONCANONICAL");
 return b;
}
async function pubkey(b64){
 const raw=decoded(b64);
 if(raw.length!==44)fail("PUBLIC_KEY_INVALID");
 return crypto.subtle.importKey("spki",raw,{name:"Ed25519"},false,["verify"]);
}
function sigB64(raw){return btoa(String.fromCharCode(...raw))}
export async function verifyCommercialSourceGro(record,groPublicSpkiB64,now=Date.now()){
 if(!record||!HASH.test(record.payload_sha256??"")||
   typeof record.payload_json!=="string"||record.payload_json.length>18000||
   !HASH.test(record.gro_id??"")||
   await licensedSha(record.payload_json)!==record.payload_sha256)fail("SOURCE_GRO_HASH_INVALID");
 if(!await crypto.subtle.verify("Ed25519",await pubkey(groPublicSpkiB64),
   decoded(record.signature_b64),bytes(record.payload_json)))fail("SOURCE_GRO_SIGNATURE_INVALID");
 let p;try{p=JSON.parse(record.payload_json)}catch{fail("SOURCE_GRO_JSON_INVALID")}
 if(p.schema!=="geomacro.event-stream-gro.v1"||
   p.subject?.type!=="COUNTRY"||!isHot50RiskCountry(p.subject.id)||
   !ALLOWED.has(p.category)||
   p.execution_authorized!==false||p.charged!==false||
   p.certified_risk_index!==false||
   p.customer_delivery_authorized!==true||
   !Array.isArray(p.source_originals)||p.source_originals.length!==2||
   new Set(p.source_originals).size!==2||
   !p.source_originals.every(s=>HASH.test(s))||
   p.evidence_and_confidence?.source_rights_and_origins!=="DUAL_MACHINE_ATTESTED"||
   p.evidence_and_confidence?.raw_sources_not_republished!==true||
   !Number.isFinite(Date.parse(p.expires_at))||Date.parse(p.expires_at)<=now||
   !Number.isFinite(Date.parse(p.generated_at))||Date.parse(p.generated_at)>now+60000)
   fail("SOURCE_GRO_COMMERCIAL_OR_ORIGINALS_NOT_AUTHORIZED");
 return p;
}
/**
 * Only a trusted internal release authority may call this after resolving
 * original-source rights and subscription entitlements. The claims must be
 * backed by independently signed provider readbacks, never request JSON.
 */
export async function issueGeoMacroCommercialLicense({
 record,groPublicSpkiB64,licensePrivatePkcs8B64,licensePublicSpkiB64,
 eligibleDerivedScore,approval,releasePublicSpkiB64,now=Date.now()
}={}){
 const gro=await verifyCommercialSourceGro(record,groPublicSpkiB64,now);
 const release=approval?.signature_b64;
 if(!release||!releasePublicSpkiB64)fail("RELEASE_REVIEW_SIGNATURE_MISSING");
 const {signature_b64:unusedSignature,...reviewed}=approval;
 if(!await crypto.subtle.verify("Ed25519",await pubkey(releasePublicSpkiB64),
   decoded(release),bytes("geomacro.commercial-independent-release-review.v1\n"+canonicalLicensedJson(reviewed))))
  fail("RELEASE_REVIEW_SIGNATURE_INVALID");
 if(approval?.schema!=="geomacro.commercial-release-accepted.v1"||
   approval?.production_release_verified!==true||
   approval?.independent_source_rights_verified!==true||
   approval?.customer_entitlement_verified!==true||
   approval?.go_live_approved!==true||
   approval?.canary_hold_cleared!==true||
   approval?.validated_gro_sha256!==record.payload_sha256||
   !HASH.test(approval?.signed_release_receipt_sha256??"")||
   !Number.isFinite(Date.parse(approval?.reviewed_at))||
   now-Date.parse(approval.reviewed_at)>3600000||
   Date.parse(approval.reviewed_at)>now+60000)
  fail("INDEPENDENT_RELEASE_AUTHORITY_NOT_VERIFIED");
 const score=eligibleDerivedScore;
 if(score?.category!==gro.category||score.country_iso3!==gro.subject.id||
   !Number.isFinite(score.value_0_100)||score.value_0_100<0||
   score.value_0_100>100||score.provenance==="SEARCH_INDEX_ONLY"||
   score.derived_only!==true||score.licensed_source_text_included!==false||
   score.independent_accuracy_certified===true)
  fail("DERIVED_SCORE_UNVERIFIED");
 const base={
  schema:SCHEMA,license_id:GEOMACRO_LICENSE_ID,
  licensor:"GeoMacro Technologies / Autonomous Intelligence Engine",
  rights_tier:GEOMACRO_DERIVED_RIGHTS,
  authorized_redistribution:true,
  license_scope:"GEOMACRO_DERIVED_MACHINE_INTELLIGENCE_ONLY",
  downstream_rights:["COMMERCIAL_REDISTRIBUTION_OF_DERIVED_SCORES",
   "DERIVED_ANALYTICS","OPERATIONAL_ADVISORY_USE"],
  original_publisher_text_included:false,
  third_party_publisher_licensing_not_granted:true,
  subject:gro.subject,category:gro.category,
  tier:"STANDARD",event_fingerprint:gro.event_fingerprint,
  derived:{
   what:gro.what_happened,why:gro.why_it_matters,
   market:gro.market_relevance,watch:gro.what_to_watch,
   risk_score_0_100:score.value_0_100,
   risk_score_kind:"GEOMACRO_DERIVED_NOT_CERTIFIED_GRI",
  },
  source_gro_sha256:record.payload_sha256,
  source_gro_payload_json:record.payload_json,
  source_gro_signature_b64:record.signature_b64,
  source_gro_key_spki_b64:groPublicSpkiB64,
  release_receipt_sha256:approval.signed_release_receipt_sha256,
  timestamp_utc:new Date(now).toISOString(),
  expires_at:gro.expires_at,
  execution_authorized:false,charged:false
 };
 const canonical=canonicalLicensedJson(base),payloadHash=await licensedSha(canonical);
 const priv=await crypto.subtle.importKey("pkcs8",decoded(licensePrivatePkcs8B64),
   {name:"Ed25519"},false,["sign"]);
 const verify=await pubkey(licensePublicSpkiB64);
 const signature=new Uint8Array(await crypto.subtle.sign("Ed25519",priv,bytes(DOMAIN+canonical)));
 if(!await crypto.subtle.verify("Ed25519",verify,signature,bytes(DOMAIN+canonical)))
  fail("SIGNING_KEY_MISMATCH");
 return {payload:base,license_proof:{
  licensor:"GeoMacro",license_id:GEOMACRO_LICENSE_ID,
  authorized_redistribution:true,payload_sha256:payloadHash,
  geomacro_signature_b64:sigB64(signature),
  timestamp_utc:base.timestamp_utc,
  signature_scheme:"Ed25519",signature_domain:DOMAIN.trim(),
  license_public_spki_b64:licensePublicSpkiB64
 }};
}
export async function verifyGeoMacroCommercialLicense(envelope,{now=Date.now(),trustedLicensePublicSpkiB64,trustedGroPublicSpkiB64}={}){
 if(!trustedGroPublicSpkiB64)fail("PINNED_SOURCE_GRO_KEY_REQUIRED");
 if(!trustedLicensePublicSpkiB64)fail("PINNED_LICENSE_KEY_REQUIRED");
 const {payload:p,license_proof:proof}=envelope??{};
 if(!p||p.schema!==SCHEMA||p.license_id!==GEOMACRO_LICENSE_ID||
  p.rights_tier!==GEOMACRO_DERIVED_RIGHTS||
  p.authorized_redistribution!==true||
  p.original_publisher_text_included!==false||
  p.third_party_publisher_licensing_not_granted!==true||
  p.execution_authorized!==false||p.charged!==false||
  !isHot50RiskCountry(p.subject?.id)||!ALLOWED.has(p.category)||
  Date.parse(p.expires_at)<=now||
  proof?.license_id!==GEOMACRO_LICENSE_ID||
  proof.authorized_redistribution!==true||
  proof.licensor!=="GeoMacro"||
  proof.signature_scheme!=="Ed25519"||
  proof.signature_domain!==DOMAIN.trim()||
  proof.timestamp_utc!==p.timestamp_utc||
  !HASH.test(proof.payload_sha256??""))
  fail("ENVELOPE_POLICY_INVALID");
 const source=await verifyCommercialSourceGro({
  gro_id:await licensedSha(JSON.stringify(JSON.parse(p.source_gro_payload_json).source_originals)),
  payload_json:p.source_gro_payload_json,
  payload_sha256:p.source_gro_sha256,signature_b64:p.source_gro_signature_b64
 },trustedGroPublicSpkiB64,now);
 if(p.source_gro_key_spki_b64!==trustedGroPublicSpkiB64)
  fail("UPSTREAM_GRO_SIGNER_NOT_PINNED");
 if(source.subject.id!==p.subject.id||source.category!==p.category||
    source.event_fingerprint!==p.event_fingerprint)
  fail("UPSTREAM_GRO_PROVENANCE_INVALID");
 const canon=canonicalLicensedJson(p);
 if(await licensedSha(canon)!==proof.payload_sha256||
   proof.license_public_spki_b64!==trustedLicensePublicSpkiB64||
   !await crypto.subtle.verify("Ed25519",await pubkey(trustedLicensePublicSpkiB64),
     decoded(proof.geomacro_signature_b64),bytes(DOMAIN+canon)))
   fail("ENVELOPE_SIGNATURE_OR_HASH_INVALID");
 return {status:"GEOMACRO_DERIVED_LICENSE_SIGNATURE_VERIFIED",
  authorized_redistribution:true,
  original_source_rights_not_derived_from_signature:true,
  source_gro_sha256:p.source_gro_sha256,
  payload_sha256:proof.payload_sha256};
}
