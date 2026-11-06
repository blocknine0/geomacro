import {PaymentError,requireValue,readJsonResponse} from './payments/common.mjs';
import {TIER_ORDER,TIER_NAMES,CASH_ATOMIC,subjectTarget} from './risk-contract.mjs';
const SHA=/^[0-9a-f]{64}$/;
const categories=['GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS'];
/** Only the existing protected evidence resolver may assert qualifications.
 * Source material/identities stay internal. Public factors are bounded factsheets.
 */
export function admitQualifiedProduct(data,{subject,tier,now=Date.now()}){
 const target=subjectTarget(subject),p=data?.tiered_product;
 requireValue(data?.ok===true&&data.execution_authorized===false&&p&&p.execution_authorized===false&&
  p.schema==='geomacro.risk-gate-commercial-three-tier.v1'&&p.tier===({basic:'BASIC_FOCUSED',standard:'STANDARD',complex:'COMPLEX_FULL'}[tier])&&p.subject?.type===target.type&&p.subject.id===target.id&&
  p.price?.usdc_atomic_at_1_usdc_per_usd===String(CASH_ATOMIC[tier]),'RISK_UPSTREAM_CONTRACT_INVALID');
 const at=Date.parse(p.evaluated_at);
 requireValue(Number.isFinite(at)&&at<=now+60000&&at>=now-60000,'RISK_UPSTREAM_STALE');
 if(p.status!=='READY'||p.chargeable!==true)return null;
 requireValue(Number.isFinite(p.risk_score_0_100)&&p.risk_score_0_100>=0&&p.risk_score_0_100<=100&&
  SHA.test(String(data.audit_receipt_hash??'')),'RISK_UPSTREAM_PROOF_INVALID');
 let factors,kind;
 if(tier==='basic'){
  requireValue(p.risk_score_kind==='INDICATIVE_UNVERIFIED_ACTIVITY_PROXY'&&p.confidence?.verification==='PROVISIONAL'&&
   Array.isArray(p.signal_alerts)&&p.signal_alerts.some(a=>SHA.test(a.title_sha256)&&
    Date.parse(a.observed_at)>=now-86400000&&Date.parse(a.observed_at)<=now+60000),'BASIC_EVIDENCE_INVALID');
  kind='INDICATIVE_UNVERIFIED_ACTIVITY_PROXY';
  factors=(p.category_observations??[]).filter(f=>categories.includes(f.category)).map(f=>({
   category:f.category,observed_count:Number.isSafeInteger(f.observed_count)&&f.observed_count>=0?f.observed_count:0,status:'OBSERVED_ACTIVITY'}));
  requireValue(factors.some(f=>f.observed_count>0),'BASIC_EVIDENCE_INVALID');
 }else{
  requireValue(p.risk_score_kind===(tier==='standard'?'CORROBORATED_RISK_SCORE':'PROPRIETARY_INSTITUTIONAL_SIGNED_SCORE')&&p.confidence?.verification===(tier==='standard'?'VERIFIED':'CRYPTO_SIGNED'),'RISK_SCORE_BASIS_INVALID');
  requireValue(p.independent_corroboration_verified===true||tier==='complex'&&p.gro_signature?.scheme==='Ed25519',
   'INDEPENDENT_CORROBORATION_REQUIRED');
  factors=(p.category_fact_sheets??[]).filter(f=>categories.includes(f.category)).map(f=>({
   category:f.category,score:Number.isFinite(f.verified_category_score_0_100)?f.verified_category_score_0_100:null,
   evidence_status:f.evidence_status==='VERIFIED_CORROBORATED'?'VERIFIED_CORROBORATED':'UNAVAILABLE',corroborated_event_count:Number.isSafeInteger(f.corroborated_event_count)&&f.corroborated_event_count>=0?f.corroborated_event_count:null}));
  requireValue(categories.every(c=>factors.some(f=>f.category===c&&f.evidence_status==='VERIFIED_CORROBORATED'&&
   Number.isFinite(f.score)&&f.score>=0&&f.score<=100)),'THREE_CATEGORY_EVIDENCE_REQUIRED');
  kind=tier==='standard'?'CORROBORATED_RISK_SCORE':'SIGNED_GRO_RISK_SCORE';
  if(tier==='complex'){
   requireValue(p.confidence?.verification==='CRYPTO_SIGNED'&&p.gro_signature?.scheme==='Ed25519'&&
    SHA.test(p.gro_signature.payload_sha256)&&Date.parse(p.gro_signature.expires_at)>now&&
    Date.parse(p.gro_signature.generated_at)<=now&&SHA.test(p.b2_archive?.archive_sha256)&&
    p.seven_day_verified_subject_history?.verified_score_days===7,'COMPLEX_PROOF_INCOMPLETE');
  }
 }
 let decision='review';
 if(tier!=='basic'&&data.flash_check_available===true&&!data.intraday_override){
  if(data.client_policy_decision==='GATE_PASS')decision='allow';
  else if(data.client_policy_decision==='GATE_BLOCKED')decision='deny';
 }
 return {decision,risk_score:p.risk_score_0_100,factors,risk_score_kind:kind,
  confidence:p.confidence?.level??null,data_as_of:p.evaluated_at,
  evidence_valid_until:tier==='complex'?p.gro_signature.expires_at:data.verified_live_scoring?.gro_expires_at??null,
  evidence_receipt_hash:data.audit_receipt_hash,gro_payload_hash:p.gro_signature?.payload_sha256??null};
}
export function createQualifiedRiskResolver({origin,token,fetchImpl=fetch,cacheTtlMs=30000}){
 requireValue(origin==='https://api.geomacro.live'||origin==='https://geomacro-control-plane.daspallab202391.workers.dev',
  'RISK_ORIGIN_NOT_APPROVED',500);
 const cache=new Map();
 return async({subject,tier,signal})=>{
  const target=subjectTarget(subject),key=subject+':'+tier,now=Date.now(),hit=cache.get(key);
  if(hit&&hit.until>now)return structuredClone({...hit.value,riskByTier:Object.fromEntries(
   Object.entries(hit.value.riskByTier).map(([t,r])=>[t,{...r,cache_status:'HIT'}]))});
  requireValue(typeof token==='string'&&/^[0-9a-f]{64}$/.test(token),'QUALIFIED_RISK_RESOLVER_NOT_CONFIGURED');
  const availableTiers=[],riskByTier={};
  // Highest deliverable tier only; no expensive lower-tier work after success.
  for(const candidate of TIER_ORDER.slice(0,TIER_ORDER.indexOf(tier)+1).reverse()){
   signal?.throwIfAborted();
   const response=await fetchImpl(origin+'/v1/risk-gate/unified/evaluate',{method:'POST',redirect:'manual',
    signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000),
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({target_type:target.type,target_id:target.id,client_policy:'STRICT',product_tier:TIER_NAMES[candidate]})});
   if(response.status>=300&&response.status<400)throw new PaymentError('RISK_UPSTREAM_REDIRECT_REJECTED');
   requireValue(response.ok,'QUALIFIED_EVIDENCE_UNAVAILABLE');
   const result=admitQualifiedProduct(await readJsonResponse(response),{subject,tier:candidate});
   if(result){availableTiers.push(candidate);riskByTier[candidate]={...result,cache_status:'MISS'};break;}
  }
  requireValue(availableTiers.length,'INCONCLUSIVE_NO_CHARGE');
  const value={availableTiers,riskByTier};
  if(cache.size>=256)cache.delete(cache.keys().next().value);
  const expiry=Math.min(now+cacheTtlMs,...Object.values(riskByTier).map(r=>Date.parse(r.evidence_valid_until)).filter(Number.isFinite));
  cache.set(key,{until:expiry,value:structuredClone(value)});return value;
 };
}
