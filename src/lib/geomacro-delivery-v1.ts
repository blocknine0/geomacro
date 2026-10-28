import {resolveGeomacroCapabilityPrice} from "./capability-pricing-catalog";

export const GEOMACRO_DELIVERY_V1="geomacro.delivery.v1" as const;
const HASH=/^sha256:[a-f0-9]{64}$/u;
const PUBLIC_ID=/^[a-zA-Z0-9_.:-]{1,128}$/u;
const REQUEST_ID=/^[a-zA-Z0-9_-]{8,128}$/u;
const NO_SAMPLE=/(?:SAMPLE|EXAMPLE|NOT_VALID|PLACEHOLDER)/iu;
const FORBIDDEN_FIELDS=new Set([
 "raw","raw_data","raw_payload","raw_article","article_url",
 "source","source_id","source_url","source_name","publisher",
 "provider","provider_id","provider_name","feed_url","b2_key",
 "object_key","upstream_url","secret","private_key","auth_token",
]);
const record=(o:unknown):o is Record<string,unknown> =>
 o!==null&&typeof o==="object"&&!Array.isArray(o);
const iso=(s:unknown):s is string=>
 typeof s==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(s)&&
 Number.isFinite(Date.parse(s))&&new Date(s).toISOString().startsWith(s.slice(0,19));
function rejectPrivate(value:unknown,depth=0):void{
 if(depth>24)throw Error("DELIVERY_TOO_DEEP");
 if(typeof value==="string"){
  if(NO_SAMPLE.test(value)||/(?:https?:\/\/|www\.)/iu.test(value))
   throw Error("DELIVERY_UNVERIFIED_OR_SOURCE_PRIVATE_VALUE");
  return;
 }
 if(Array.isArray(value)){
  if(value.length>100)throw Error("DELIVERY_TOO_MANY_ITEMS");
  value.forEach(item=>rejectPrivate(item,depth+1));
  return;
 }
 if(!record(value))return;
 for(const [key,child] of Object.entries(value)){
  if(FORBIDDEN_FIELDS.has(key.toLowerCase()))
   throw Error("DELIVERY_UPSTREAM_SOURCE_FIELD");
  rejectPrivate(child,depth+1);
 }
}

/**
 * Read-only V1 envelope admission. This deliberately DOES NOT sign, settle,
 * publish, convert samples to facts, or implement an independent GRO engine.
 * The real canonical signer/JCS verifier, rights+same-event acceptance, hot
 * current B2/D1 pointer, and durable settlement must each return a real proof.
 */
export async function assertGeomacroDeliveryV1(
 payload:unknown,
 expected:Readonly<{
   capability:string;variant:string;verified_content_hash:string;
   now?:Date;
 }>,
 proofs:Readonly<{
   verifyCurrentRightsAndEvidence:(body:Record<string,unknown>)=>Promise<boolean>;
   verifySignatureAndContentHash:(body:Record<string,unknown>)=>Promise<boolean>;
   verifySettledDelivery:(body:Record<string,unknown>)=>Promise<boolean>;
 }>,
):Promise<void>{
 if(!record(payload)||Object.keys(payload).length!==14||
  !["schema","request_id","capability","delivered_at","billing","subject",
    "data_state","freshness","summary","result","provenance","limits",
    "attribution","integrity"].every(k=>Object.hasOwn(payload,k)))
   throw Error("DELIVERY_ENVELOPE_INVALID");
 if(payload.schema!==GEOMACRO_DELIVERY_V1||
  payload.capability!==expected.capability||
  typeof payload.request_id!=="string"||!REQUEST_ID.test(payload.request_id)||
  !record(payload.billing)||payload.billing.charged!==true||
  payload.billing.reason!=="DELIVERED")
   throw Error("DELIVERY_BILLING_OR_SCOPE_INVALID");
 const price=resolveGeomacroCapabilityPrice(expected.capability,expected.variant);
 if(payload.billing.price_usdc!==price.amount_usdc)
   throw Error("DELIVERY_PRICE_NOT_FOUNDER_LOCKED");
 if(!record(payload.subject)||!["global","country","corridor","query"].includes(String(payload.subject.type))||
   typeof payload.subject.id!=="string"||!PUBLIC_ID.test(payload.subject.id)||
   (payload.subject.type==="country"&&!/^[A-Z]{3}$/u.test(payload.subject.id)))
   throw Error("DELIVERY_SUBJECT_INVALID");
 if(payload.data_state!=="AVAILABLE"||!iso(payload.delivered_at)||
   !record(payload.freshness)||!iso(payload.freshness.as_of)||
   payload.freshness.stale!==false||
   !Number.isSafeInteger(payload.freshness.max_age_s)||
   Number(payload.freshness.max_age_s)<=0)
   throw Error("DELIVERY_NOT_CURRENT");
 const now=expected.now??new Date();
 const nowMs=now.getTime(), asOfMs=Date.parse(payload.freshness.as_of);
 const atMs=Date.parse(payload.delivered_at);
 if(!Number.isFinite(nowMs)||asOfMs>atMs||atMs>nowMs+60000||
   asOfMs>nowMs||nowMs-asOfMs>Number(payload.freshness.max_age_s)*1000)
   throw Error("DELIVERY_ORIGINAL_CLOCK_INVALID");
 if(typeof payload.summary!=="string"||payload.summary.length>500||
  !record(payload.result)||!record(payload.provenance)||
  !record(payload.limits)||payload.limits.execution_authorized!==false||
  payload.limits.advisory_only!==true)
   throw Error("DELIVERY_BOUNDARY_INVALID");
 // Public attribution is to GEOMACRO alone; upstream identities stay private.
 if(!record(payload.attribution)||Object.keys(payload.attribution).some(k=>!["url","notice"].includes(k))||
   payload.attribution.url!=="https://geomacro.live/attributions"||
   typeof payload.attribution.notice!=="string"||
   payload.attribution.notice.length>200)
   throw Error("DELIVERY_ATTRIBUTION_NOT_APPROVED");
 if(!record(payload.integrity)||payload.integrity.alg!=="ed25519"||
   payload.integrity.canonicalization!=="JCS-RFC8785"||
   typeof payload.integrity.key_id!=="string"||
   !PUBLIC_ID.test(payload.integrity.key_id)||
   typeof payload.integrity.signature!=="string"||
   payload.integrity.signature.length<64||
   typeof payload.integrity.content_hash!=="string"||
   !HASH.test(payload.integrity.content_hash)||
   payload.integrity.content_hash!==expected.verified_content_hash)
   throw Error("DELIVERY_UNVERIFIED_SIGNATURE_OR_HASH");
 rejectPrivate({summary:payload.summary,result:payload.result,provenance:payload.provenance});
 // Never accept only shape or a stub response as crypto/legal proof.
 if(typeof proofs?.verifyCurrentRightsAndEvidence!=="function"||
   typeof proofs?.verifySignatureAndContentHash!=="function"||
   typeof proofs?.verifySettledDelivery!=="function")
   throw Error("DELIVERY_TRUST_PROOFS_MISSING");
 if(await proofs.verifyCurrentRightsAndEvidence(payload)!==true)
   throw Error("DELIVERY_RIGHTS_AND_EVIDENCE_UNVERIFIED");
 if(await proofs.verifySignatureAndContentHash(payload)!==true)
   throw Error("DELIVERY_CRYPTOGRAPHIC_PROOF_UNVERIFIED");
 if(await proofs.verifySettledDelivery(payload)!==true)
   throw Error("DELIVERY_SETTLEMENT_UNVERIFIED");
}
