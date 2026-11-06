import {PaymentError,requireValue,uuid} from './payments/common.mjs';
// Owner-selected Hot 50. Imported from the existing canonical scope registry.
import {RISK_GATE_HOT50} from '../../../workers/control-plane/src/risk-gate-hot50-scope.mjs';
export const TIER_ORDER=Object.freeze(['basic','standard','complex']);
export const TIER_NAMES=Object.freeze({basic:'basic_focused',standard:'standard',complex:'complex_full'});
export const CASH_ATOMIC=Object.freeze({basic:100000,standard:150000,complex:250000});
const hot=new Set(RISK_GATE_HOT50);
const corridors=new Set(['bab-el-mandeb','red-sea','hormuz','suez','malacca','taiwan-strait','panama',
 'singapore-strait','south-china-sea','gulf-of-aden','gulf-of-guinea','black-sea-grain']);
export function subjectTarget(subject){
 if(typeof subject!=='string')throw new PaymentError('SUBJECT_REQUIRED',400);
 if(/^[A-Z]{3}$/.test(subject)){
  requireValue(hot.has(subject),'COUNTRY_OUTSIDE_HOT50_SCOPE',400);return {type:'COUNTRY',id:subject};
 }
 requireValue(corridors.has(subject),'UNKNOWN_COUNTRY_OR_CORRIDOR',400);return {type:'CORRIDOR',id:subject};
}
export function parseRiskRequest(input,id){
 requireValue(input&&typeof input==='object'&&!Array.isArray(input)&&
  Object.keys(input).every(k=>['subject','tier','request_id'].includes(k)),'INVALID_RISK_REQUEST',400);
 requireValue(TIER_ORDER.includes(input.tier),'INVALID_TIER',400);
 subjectTarget(input.subject);
 const requestId=id??input.request_id;
 requireValue(uuid(requestId)&&(!id||!input.request_id||id===input.request_id),'INVALID_REQUEST_ID',400);
 return {subject:input.subject,tier:input.tier,request_id:requestId};
}
/** All of these fields are inside the issuer signature. A receipt proves issuer
 * integrity, never an independent risk-index or reviewer certification. */
export function safeRiskFields(risk){
 requireValue(risk&&['allow','review','deny'].includes(risk.decision)&&Number.isFinite(risk.risk_score)&&
  risk.risk_score>=0&&risk.risk_score<=100&&Array.isArray(risk.factors),'INCONCLUSIVE_NO_CHARGE');
 return {decision:risk.decision,risk_score:risk.risk_score,factors:risk.factors,
  metadata:{schema:'geomacro.commercial-risk-gate.v1',advisory_only:true,certified_risk_index:false,
   risk_score_kind:risk.risk_score_kind??'UNSPECIFIED_ADVISORY_SCORE',confidence:risk.confidence??null,
   data_as_of:risk.data_as_of??null,evidence_receipt_hash:risk.evidence_receipt_hash??null,
   gro_payload_hash:risk.gro_payload_hash??null,cache_status:risk.cache_status??'MISS'}};
}
