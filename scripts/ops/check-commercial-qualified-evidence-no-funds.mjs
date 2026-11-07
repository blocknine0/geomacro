#!/usr/bin/env node
/** Bounded protected evidence-status diagnosis; NO FUNDS, no signed payment.
 * Reports only allowlisted diagnostic codes, never source content or tokens.
 */
import { readJsonResponse } from '../../services/commercial-api/src/payments/common.mjs';
import { admitQualifiedProduct } from '../../services/commercial-api/src/qualified-risk.mjs';
import { TIER_NAMES } from '../../services/commercial-api/src/risk-contract.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const SCHEMA='geomacro.commercial-qualified-evidence-no-funds.v1';
const ORIGIN='https://api.geomacro.live';
const DIRECT='https://geomacro-control-plane.daspallab202391.workers.dev';
const tiers=['basic','standard','complex'];
const ERRORS=new Set([
 'RISK_UPSTREAM_CONTRACT_INVALID','RISK_UPSTREAM_STALE','RISK_UPSTREAM_PROOF_INVALID',
 'BASIC_EVIDENCE_INVALID','RISK_SCORE_BASIS_INVALID','INDEPENDENT_CORROBORATION_REQUIRED',
 'THREE_CATEGORY_EVIDENCE_REQUIRED','COMPLEX_PROOF_INCOMPLETE','QUALIFIED_EVIDENCE_UNAVAILABLE'
]);
const statusOf=r=>r.status;
const errorCode=e=>ERRORS.has(e?.code)?e.code:'EVIDENCE_CONTRACT_NOT_VERIFIED';

export async function checkEvidenceNoFunds({token=process.env.RISK_GATE_TIERED_TOKEN,fetchImpl=fetch,subject='USA',origin=process.env.GEOMACRO_EVIDENCE_PROBE_ORIGIN??ORIGIN}={}){
 const result={schema:SCHEMA,mode:'READ_ONLY_NO_FUNDS',subject,
  origin:origin===ORIGIN?'canonical-api':origin===DIRECT?'direct-control-plane':'unapproved',
  payment_attempted:false,payment_enabled:false,certified_gri_claimed:false,tiers:[]};
 if(origin!==ORIGIN&&origin!==DIRECT)return {...result,classification:'BLOCKED_NO_CHARGE',reason:'EVIDENCE_ORIGIN_NOT_APPROVED'};
 if(!/^[a-f0-9]{64}$/u.test(String(token??''))){
  return {...result,classification:'BLOCKED_NO_CHARGE',reason:'QUALIFIED_RISK_TOKEN_NOT_CONFIGURED'};
 }
 // Fixed 3 requests to a previously-approved origin. No network discovery or
 // arbitrary URLs; no payment, user identity or client secrets in output.
 for(const tier of tiers){
  const body={target_type:'COUNTRY',target_id:subject,client_policy:'STRICT',product_tier:TIER_NAMES[tier]};
  let response;
  try{
   response=await fetchImpl(origin+'/v1/risk-gate/unified/evaluate',{
    method:'POST',redirect:'manual',signal:AbortSignal.timeout(12000),
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(body)
   });
  }catch{result.tiers.push({tier,classification:'BLOCKED_NO_CHARGE',reason:'UPSTREAM_NETWORK_UNAVAILABLE'});continue}
  if(response.status>=300&&response.status<400){
   result.tiers.push({tier,classification:'BLOCKED_NO_CHARGE',reason:'UPSTREAM_REDIRECT_REJECTED'});
   continue;
  }
  if(!response.ok){
   result.tiers.push({tier,classification:'BLOCKED_NO_CHARGE',reason:'UPSTREAM_HTTP_'+statusOf(response)});
   continue;
  }
  let payload;
  try{payload=await readJsonResponse(response,262144)}
  catch{result.tiers.push({tier,classification:'BLOCKED_NO_CHARGE',reason:'UPSTREAM_JSON_REJECTED'});continue}
  try{
   const admitted=admitQualifiedProduct(payload,{subject,tier});
   result.tiers.push({tier,
    classification:admitted?'LOCAL_CONTRACT_CANDIDATE_NOT_CERTIFIED':'BLOCKED_NO_CHARGE',
    reason:admitted?'REQUIRES_INDEPENDENT_SIGNED_EVIDENCE_PROOF':'NOT_READY_NO_CHARGE'});
  }catch(e){
   result.tiers.push({tier,classification:'BLOCKED_NO_CHARGE',reason:errorCode(e)});
  }
 }
 result.classification=result.tiers.every(t=>t.classification==='LOCAL_CONTRACT_CANDIDATE_NOT_CERTIFIED')
  ?'LOCAL_CONTRACT_CANDIDATES_ONLY':'BLOCKED_NO_CHARGE';
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.stdout.write(JSON.stringify(await checkEvidenceNoFunds(),null,2)+'\n')}
 catch{process.stdout.write(JSON.stringify({schema:SCHEMA,classification:'BLOCKED_NO_CHARGE',
  reason:'DIAGNOSTIC_UNAVAILABLE',payment_attempted:false})+'\n')}
}
