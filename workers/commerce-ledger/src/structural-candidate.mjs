import {canonicalJson} from '../../../src/lib/canonical-json.ts';
import {resolveGeomacroCapabilityPrice} from '../../../src/lib/capability-pricing-catalog.ts';
import {MCS_DIGEST_CSV_SHA256} from '../../../src/lib/mcs-digest-source-identity.ts';
import {TREASURY_TERMS_SHA256} from '../../../src/lib/treasury-fx-source-identity.ts';
export const STRUCTURAL_CANDIDATE_VERSION='geomacro.structural-prepared-candidate.v1';
export const STRUCTURAL_CANDIDATE_SCOPE={provider:'geomacro_structural_candidate',providerEnvironment:'prelaunch'};
const HASH=/^[a-f0-9]{64}$/u;
const FIELDS=['schema','capability','variant','amount_atomic','country_iso3','topic','request_hash',
 'answer_sha256','source_file_sha256','rights_metadata_sha256','source_period_end','checked_at','expires_at','binding_hash'];
export async function structuralCandidateHash(candidate){
 const {binding_hash:_ignored,...fields}=candidate;
 return hashText(canonicalJson(fields));
}
export async function hashText(bytes){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(bytes));
 return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
/** Storage admission only: this cannot certify source rights, issue an offer,
 * settle a payment or provide an entitlement. The protected source qualifier
 * independently verifies actual originals before invoking this private action. */
export async function assertStructuralCandidate(candidate,customerBytes,scope,now=Date.now()){
 const fail=()=>{throw Error('STRUCTURAL_CANDIDATE_UNVERIFIED_OR_INVALID')};
 const quarterly=candidate?.country_iso3==='IND'&&candidate?.topic==='fx_external_risk'&&
  candidate?.rights_metadata_sha256===TREASURY_TERMS_SHA256&&
  HASH.test(candidate?.source_file_sha256??'')&&
  /^\d{4}-(?:03-31|06-30|09-30|12-31)T23:59:59\.000Z$/u.test(candidate?.source_period_end??'');
 const annual=['USA','CHN'].includes(candidate?.country_iso3)&&candidate?.topic==='critical_minerals'&&
  candidate?.source_file_sha256===MCS_DIGEST_CSV_SHA256&&candidate?.source_period_end==='2025-12-31T23:59:59.000Z';
 if(scope.provider!==STRUCTURAL_CANDIDATE_SCOPE.provider||
    scope.providerEnvironment!==STRUCTURAL_CANDIDATE_SCOPE.providerEnvironment||
    !candidate||typeof candidate!=='object'||Array.isArray(candidate)||
    Object.keys(candidate).length!==FIELDS.length||Object.keys(candidate).some(k=>!FIELDS.includes(k))||
    candidate.schema!==STRUCTURAL_CANDIDATE_VERSION||candidate.capability!=='structural_country_digest'||
    candidate.variant!=='standard'||candidate.amount_atomic!==resolveGeomacroCapabilityPrice('structural_country_digest','standard').amount_atomic||
    (!annual&&!quarterly)||
    ![candidate.binding_hash,candidate.request_hash,candidate.answer_sha256,candidate.rights_metadata_sha256].every(x=>typeof x==='string'&&HASH.test(x))||
    typeof customerBytes!=='string'||!customerBytes||new TextEncoder().encode(customerBytes).byteLength>96*1024||
    /sciencebase|datacite|usgs_mcs|treasury|fiscaldata|source_url|source_id|input_row_hashes/iu.test(customerBytes))fail();
 const checked=Date.parse(candidate.checked_at),expires=Date.parse(candidate.expires_at),native=Date.parse(candidate.source_period_end);
 if(!Number.isFinite(now)||!Number.isSafeInteger(checked)||!Number.isSafeInteger(expires)||
    new Date(checked).toISOString()!==candidate.checked_at||new Date(expires).toISOString()!==candidate.expires_at||
    checked>now+60_000||native>checked||expires!==Math.min(checked+86400_000,native+(quarterly?125:400)*86400_000)||expires<=now)fail();
 if(await hashText(customerBytes)!==candidate.answer_sha256||await structuralCandidateHash(candidate)!==candidate.binding_hash)fail();
 let answer;try{answer=JSON.parse(customerBytes)}catch{fail()}
 const {delivered_product_hash,...core}=answer;
 if(answer.schema_version!=='geomacro.adaptive-intelligence-response.v1'||
    answer.query_plan_hash!==candidate.request_hash||answer.subjects?.length!==1||
    answer.subjects[0]?.type!=='country'||answer.subjects[0]?.country_iso3!==candidate.country_iso3||
    answer.question_interpretation?.delivery_tier!=='structural_baseline'||
    canonicalJson(answer.question_interpretation?.topics)!==canonicalJson([candidate.topic])||
    canonicalJson(answer.question_interpretation?.required_modules)!==canonicalJson([quarterly?'external_fx':'critical_minerals'])||
    answer.methodology?.price_usdc!=='0.02'||answer.execution_authorized!==false||
    !Array.isArray(answer.signed_risk_objects)||answer.signed_risk_objects.length!==0||
    !Array.isArray(answer.risk_gate)||answer.risk_gate.length!==0||answer.gri_context!==null||
    !HASH.test(delivered_product_hash)||await hashText(canonicalJson(core))!==delivered_product_hash)fail();
 return expires;
}
