import {canonicalJson} from './canonical-json';
import {inputHash} from './automated-intelligence-input';
export const LOW_REVIEW_DOMAIN='geomacro.internal-low-source-review.v1\n';
export type LowSourceReview={
 schema:'geomacro.internal-low-source-review.v1';authority:'GEOMACRO_INTERNAL_AUTOMATED_LOW_V1';
 scope:'ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME';input_id:string;category:string;
 source_published_at:string;reviewed_at:string;expires_at:string;
 verdict:'SOURCE_EVIDENCE_VERIFIED'|'EVIDENCE_PENDING'|'SOURCE_EVIDENCE_REJECTED';
 reason:string;evidence_sha256:string|null;semantic_claims_verified:false;
 commercial_authorization:false;external_reviewer_attested:false;
};
export type SignedLowSourceReview={review:LowSourceReview;signature:string};
export type LowReviewTrust={public_spki_b64:string;public_sha256:string;issuer_public_keys_b64:string[]};
const hash=/^[a-f0-9]{64}$/;
const exact=(v:object,keys:string[])=>Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const reasons=['ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED','PRIVATE_ORIGINAL_REFERENCE_NOT_AVAILABLE',
 'ORIGINAL_DAY_PRECISION_ONLY','OUTSIDE_SIX_HOUR_CURRENT_PROOF_WINDOW',
 'ORIGINAL_ISSUER_NOT_REGISTERED_FOR_BYTE_RECHECK','ORIGINAL_PAGE_READBACK_DEFERRED_QUOTA',
 'ORIGINAL_BYTES_OR_NATIVE_CLOCK_UNVERIFIED'];
export const lowSourceReviewBytes=(review:LowSourceReview)=>new TextEncoder().encode(LOW_REVIEW_DOMAIN+canonicalJson(review));
const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function assertLowReviewTrust(trust:LowReviewTrust){
 if(!trust||!hash.test(trust.public_sha256)||!Array.isArray(trust.issuer_public_keys_b64)||!trust.issuer_public_keys_b64.length)
  throw Error('LOW_REVIEW_TRUST_INVALID');
 const bytes=decode(trust.public_spki_b64);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 if(digest!==trust.public_sha256||trust.issuer_public_keys_b64.some(k=>{const issuer=decode(k);return issuer.length===bytes.length&&issuer.every((b,i)=>b===bytes[i]);}))
  throw Error('LOW_REVIEW_DISTINCT_PINNED_AUTHORITY_REQUIRED');
 await crypto.subtle.importKey('spki',bytes,{name:'Ed25519'},false,['verify']);
}
export async function verifyLowSourceReview(envelope:SignedLowSourceReview,trust:LowReviewTrust,now=Date.now()){
 await assertLowReviewTrust(trust);
 if(!envelope||!exact(envelope,['review','signature'])||!/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature))
  throw Error('LOW_REVIEW_ENVELOPE_INVALID');
 const r=envelope.review;
 if(!r||!exact(r,['schema','authority','scope','input_id','category','source_published_at','reviewed_at','expires_at',
  'verdict','reason','evidence_sha256','semantic_claims_verified','commercial_authorization','external_reviewer_attested'])||
  r.schema!=='geomacro.internal-low-source-review.v1'||r.authority!=='GEOMACRO_INTERNAL_AUTOMATED_LOW_V1'||
  r.scope!=='ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME'||!hash.test(r.input_id)||
  !['geopolitics','macro','rare_earth'].includes(r.category)||!reasons.includes(r.reason)||
  r.semantic_claims_verified!==false||r.commercial_authorization!==false||r.external_reviewer_attested!==false)
  throw Error('LOW_REVIEW_SCOPE_INVALID');
 const reviewed=Date.parse(r.reviewed_at),source=Date.parse(r.source_published_at),expiry=Date.parse(r.expires_at);
 if(!Number.isFinite(now)||!Number.isFinite(reviewed)||!Number.isFinite(source)||source>reviewed||reviewed>now||
  now-reviewed>6*3600_000||new Date(reviewed).toISOString()!==r.reviewed_at||
  expiry!==source+72*3600_000||expiry<=now||reviewed>=expiry||new Date(expiry).toISOString()!==r.expires_at)throw Error('LOW_REVIEW_CLOCK_INVALID');
 const verified=r.reason==='ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED';
 const rejected=r.reason==='ORIGINAL_BYTES_OR_NATIVE_CLOCK_UNVERIFIED';
 if(verified&&(!/^\d{4}-\d\d-\d\dT/.test(r.source_published_at)||reviewed-source<15*60_000||reviewed-source>6*3600_000))
  throw Error('LOW_REVIEW_CURRENT_EXACT_ORIGINAL_REQUIRED');
 if(r.verdict!==(verified?'SOURCE_EVIDENCE_VERIFIED':rejected?'SOURCE_EVIDENCE_REJECTED':'EVIDENCE_PENDING')||
  (verified?!hash.test(r.evidence_sha256??''):r.evidence_sha256!==null))throw Error('LOW_REVIEW_EVIDENCE_INVALID');
 const pub=await crypto.subtle.importKey('spki',decode(trust.public_spki_b64),{name:'Ed25519'},false,['verify']);
 if(!await crypto.subtle.verify('Ed25519',pub,decode(envelope.signature),lowSourceReviewBytes(r)))
  throw Error('LOW_REVIEW_SIGNATURE_INVALID');
 return inputHash(LOW_REVIEW_DOMAIN+canonicalJson(r));
}
