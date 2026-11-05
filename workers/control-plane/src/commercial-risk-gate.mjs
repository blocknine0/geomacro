import {authorizeCanonicalCustomerPaid,CustomerPaidError,CUSTOMER_RISK_GATE_USAGE_USD_CENTS}
 from './customer-paid-ledger.mjs';
import {unifiedRiskGateEvaluate} from './unified-risk-gate.mjs';

const TIERS=Object.freeze({
 basic_focused:{capability:'risk_gate_basic_focused',price:CUSTOMER_RISK_GATE_USAGE_USD_CENTS.risk_gate_basic_focused,label:'BASIC_0_10'},
 standard:{capability:'risk_gate_standard',price:CUSTOMER_RISK_GATE_USAGE_USD_CENTS.risk_gate_standard,label:'STANDARD_0_15'},
 complex_full:{capability:'risk_gate_complex_full',price:CUSTOMER_RISK_GATE_USAGE_USD_CENTS.risk_gate_complex_full,label:'COMPLEX_0_25'},
});
const REQUEST_ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}$/;
const HASH=/^[a-f0-9]{64}$/;
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{
 'Cache-Control':'private, no-store','Vary':'Authorization',
 'X-Content-Type-Options':'nosniff',...headers,
}});
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest(
 'SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
const validTier=t=>Object.hasOwn(TIERS,t);

async function evaluateInternal(request,env,target,tier,approvedThresholds=null){
 const token=String(env?.RISK_GATE_TIERED_TOKEN??'');
 if(!HASH.test(token))return {response:json({ok:false,error:'RISK_GATE_INTERNAL_UNAVAILABLE'},503)};
 const internal=new Request(new URL('/v1/risk-gate/unified/evaluate',request.url),{
  method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
  body:JSON.stringify({target_type:target.target_type,target_id:target.target_id,
   product_tier:tier,client_policy:'STRICT',
   ...(approvedThresholds?{approved_thresholds:approvedThresholds}:{})}),
 });
 const response=await unifiedRiskGateEvaluate(internal,env);
 let payload;try{payload=await response.json()}catch{return {response:json({ok:false,error:'RISK_GATE_RESPONSE_INVALID'},503)}}
 return {payload,status:response.status};
}

async function postUsage(db,record){
 const id=await sha(['geomacro-risk-gate-usage-v1',record.key_id,record.request_id].join('\0'));
 try{
  await db.prepare(`INSERT INTO risk_gate_usage_ledger
   (ledger_id,request_id,principal_id,key_id,subject_type,subject_id,requested_tier,
    delivered_tier,amount_usd_cents,snapshot_sha256,entry_status,created_at,policy_hash)
   VALUES(?,?,?,?,?,?,?,?,?,?,'POSTED',?,?)
   ON CONFLICT(key_id,request_id) DO NOTHING`).bind(id,record.request_id,
    record.principal_id,record.key_id,record.subject_type,record.subject_id,
    record.requested_tier,record.delivered_tier,record.amount_usd_cents,
    record.snapshot_sha256,record.created_at,record.policy_hash).run();
  const saved=await db.prepare(`SELECT ledger_id,request_id,principal_id,key_id,
    subject_type,subject_id,requested_tier,delivered_tier,amount_usd_cents,
    snapshot_sha256,entry_status,created_at,policy_hash FROM risk_gate_usage_ledger
    WHERE key_id=? AND request_id=?`).bind(record.key_id,record.request_id).first();
  if(!saved||saved.ledger_id!==id||saved.subject_type!==record.subject_type||
    saved.subject_id!==record.subject_id||saved.requested_tier!==record.requested_tier||
    saved.delivered_tier!==record.delivered_tier||saved.amount_usd_cents!==record.amount_usd_cents||
    saved.snapshot_sha256!==record.snapshot_sha256||saved.policy_hash!==record.policy_hash)
   return {ok:false};
  return {ok:true,entry:saved};
 }catch{return {ok:false}}
}

/** Customer Risk Gate, held behind the existing explicit paid-runtime acceptance switch. */
export async function commercialRiskGateEvaluate(request,env){
 if(request.method!=='POST')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
 if(env?.GEOMACRO_RISK_GATE_COMMERCIAL_ACCEPTANCE!==
   'ACCEPTED_RISK_GATE_PRICING_LEDGER')
  return json({ok:false,error:'RISK_GATE_COMMERCIAL_RUNTIME_NOT_ACCEPTED'},503);
 if(!env?.DB?.prepare)return json({ok:false,error:'CUSTOMER_PAID_D1_UNAVAILABLE'},503);
 const auth=request.headers.get('authorization')??'';
 if(!auth.startsWith('Bearer '))return json({ok:false,error:'CUSTOMER_PAID_API_KEY_REQUIRED'},401);
 const apiKey=auth.slice(7);
 let body;
 try{
  if(Number(request.headers.get('content-length')??0)>4096)return json({ok:false,error:'PAYLOAD_TOO_LARGE'},413);
  const raw=await request.text();if(new TextEncoder().encode(raw).length>4096)return json({ok:false,error:'PAYLOAD_TOO_LARGE'},413);
  body=JSON.parse(raw);
 }catch{return json({ok:false,error:'INVALID_JSON'},400)}
 if(!body||typeof body!=='object'||Array.isArray(body)||
   Object.keys(body).some(k=>!['target_type','target_id','tier','request_id','approved_thresholds'].includes(k))||
   !['COUNTRY','CORRIDOR'].includes(body.target_type)||typeof body.target_id!=='string'||
   body.target_id.length>64||!validTier(body.tier))
  return json({ok:false,error:'INVALID_RISK_GATE_REQUEST'},400);
 const approved=body.approved_thresholds;
 if(approved!==undefined&&(!approved||typeof approved!=='object'||Array.isArray(approved)||
   Object.keys(approved).some(k=>!['block_at','pass_below','minimum_confidence'].includes(k))||
   ![approved.block_at,approved.pass_below,approved.minimum_confidence].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1)||
   approved.pass_below>=approved.block_at))
  return json({ok:false,error:'INVALID_POLICY_PROFILE'},400);
 const requestId=body.request_id??request.headers.get('idempotency-key');
 if(typeof requestId!=='string'||!REQUEST_ID.test(requestId))
  return json({ok:false,error:'IDEMPOTENCY_KEY_REQUIRED'},400);
 const tier=body.tier,requested=TIERS[tier];
 let principal;
 try{principal=await authorizeCanonicalCustomerPaid(env.DB,env,apiKey,requested.capability)}
 catch(error){if(error instanceof CustomerPaidError)return json({ok:false,error:error.code},error.status);return json({ok:false,error:'CUSTOMER_PAID_AUTHORIZATION_UNAVAILABLE'},503)}
 const target={target_type:body.target_type,target_id:body.target_id};
 let evaluated=await evaluateInternal(request,env,target,tier,approved??null);
 if(evaluated.response)return evaluated.response;
 if(evaluated.status<200||evaluated.status>=300||evaluated.payload?.ok!==true)
  return json({ok:false,error:evaluated.payload?.error??'RISK_GATE_EVALUATION_FAILED',chargeable:false},evaluated.status||503);
 let product=evaluated.payload.tiered_product;
 let delivered=tier,deliveredEntitlement=principal;
 if(tier==='complex_full'&&product?.status!=='READY'){
  try{deliveredEntitlement=await authorizeCanonicalCustomerPaid(env.DB,env,apiKey,TIERS.basic_focused.capability)}
  catch(error){if(error instanceof CustomerPaidError)return json({ok:false,error:'COMPLEX_UNAVAILABLE_BASIC_ENTITLEMENT_REQUIRED',requested_tier:tier,chargeable:false},error.status);return json({ok:false,error:'CUSTOMER_PAID_AUTHORIZATION_UNAVAILABLE'},503)}
  delivered='basic_focused';
  evaluated=await evaluateInternal(request,env,target,delivered,approved??null);
  if(evaluated.response)return evaluated.response;
  if(evaluated.status<200||evaluated.status>=300||evaluated.payload?.ok!==true)
   return json({ok:false,error:'BASIC_DOWNGRADE_EVALUATION_FAILED',chargeable:false},evaluated.status||503);
  product=evaluated.payload.tiered_product;
 }
 if(product?.status!=='READY'||product?.chargeable!==true||
   !Number.isFinite(product.risk_score_0_100))
  return json({ok:false,error:'TIER_DELIVERABLE_NOT_READY',requested_tier:tier,
   delivered_tier:delivered,chargeable:false,tiered_product:product??null},409);
 const snapshot=evaluated.payload;
 const snapshotHash=typeof snapshot.content_sha256==='string'&&HASH.test(snapshot.content_sha256)?
  snapshot.content_sha256:await sha(JSON.stringify(snapshot));
 const deliveredRule=TIERS[delivered],timestamp=new Date().toISOString();
 const policyHash=await sha(JSON.stringify(approved??null));
 const logged=await postUsage(env.DB,{request_id:requestId,principal_id:principal.principal_id,
  key_id:principal.key_id,subject_type:body.target_type,subject_id:body.target_id,
  requested_tier:tier,delivered_tier:delivered,amount_usd_cents:deliveredRule.price,
  snapshot_sha256:snapshotHash,created_at:timestamp,policy_hash:policyHash});
 if(!logged.ok)return json({ok:false,error:'USAGE_LEDGER_READBACK_FAILED',chargeable:false},503);
 const confidence=product.confidence?.verification==='CRYPTO_SIGNED'?'HIGH / CRYPTO_SIGNED':
  product.confidence?.verification==='VERIFIED'?'MEDIUM / VERIFIED':'LOW / PROVISIONAL';
 const categoryRows=product.category_fact_sheets??product.category_observations??[];
 const sourcesAnalyzed=categoryRows.reduce((total,row)=>total+
  Math.max(0,Number(row.observed_count??row.source_count??0)||0),0);
 const coverage={};for(const row of categoryRows){
  const category=String(row.category??'').toLowerCase();if(!category)continue;
  coverage[category]=row.evidence_status==='VERIFIED_CORROBORATED'?'VERIFIED':
   row.status==='OBSERVED_UNVERIFIED'?'OBSERVED':'NO_VERIFIED_SIGNAL';
 }
 const bodyOut={provider:'GeoMacro Risk Intelligence',
  evaluated_at:timestamp,
  subject:{type:body.target_type,id:body.target_id},
  metric_id:`GSRM-${body.target_id}-${new Date().toISOString().slice(0,10).replaceAll('-','')}`,
  tier:deliveredRule.label,requested_tier:TIERS[tier].label,delivered_tier:deliveredRule.label,
  unified_risk_score:product.risk_score_0_100,confidence_grade:confidence,coverage,
  data_provenance:{canonical_hash:`sha256:${snapshotHash}`,
   sources_analyzed_count:sourcesAnalyzed,
   ed25519_signature:product.gro_signature?.signature??null,
   ed25519_payload_sha256:product.gro_signature?.payload_sha256??null,
   source_references:product.source_references??[]},
  chargeable:true,cost_usd:Number((deliveredRule.price/100).toFixed(2)),
  request_id:requestId,usage_ledger_id:logged.entry.ledger_id,
  downgraded:delivered!==tier,tiered_product:product,
  policy_profile_applied:approved??null,
  advisory_decision:evaluated.payload.client_policy_decision==="GATE_PASS"?"CONTINUE":
   evaluated.payload.client_policy_decision==="GATE_BLOCKED"?"PAUSE":
   evaluated.payload.client_policy_decision==="GATE_HOLD"?"REQUIRE_APPROVAL":"REQUIRE_APPROVAL",
  reason_codes:product.status==="READY"?["VERIFIED_TIER_DELIVERED"]:["TIER_EVIDENCE_NOT_READY"],
  primary_driver:snapshot.dominant_risk??"NO_DOMINANT_DRIVER",
  affected_domain:categoryRows.find(row=>String(row.category).toLowerCase().includes(String(snapshot.dominant_risk??"").toLowerCase()))?.category??null,
  severity_score:product.risk_score_0_100??snapshot.verified_live_scoring?.verified_score_0_100??null,
  suggested_mitigation:evaluated.payload.intraday_override?{exposure_cap_ratio:0,settlement_delay_hours:24}:
   evaluated.payload.client_policy_decision==="GATE_HOLD"?{exposure_cap_ratio:0,settlement_delay_hours:24}:
   evaluated.payload.client_policy_decision==="GATE_BLOCKED"?{exposure_cap_ratio:0,settlement_delay_hours:0}:
   {exposure_cap_ratio:1,settlement_delay_hours:0},
  intraday_override:evaluated.payload.intraday_override===true,
  audit_receipt_hash:snapshot.audit_receipt_hash,
  audit_receipt_signature:snapshot.audit_receipt_signature,
  audit_receipt_signature_key_id:snapshot.audit_receipt_signature_key_id,
  audit_receipt_signature_scheme:snapshot.audit_receipt_signature_scheme,
  audit_receipt_signature_scope:snapshot.audit_receipt_signature_scope,
  audit_receipt_response_hash:snapshot.audit_receipt_response_hash??null,
  valid_until:snapshot.verified_live_scoring?.gro_expires_at??null,
  execution_authorized:false,
 };
 return json(bodyOut,200,{'X-GeoMacro-Provider':'GeoMacro Risk Intelligence',
  'X-GeoMacro-Metric-ID':bodyOut.metric_id,'X-GeoMacro-Tier':bodyOut.tier,
  'X-GeoMacro-Confidence':confidence,'X-GeoMacro-Chargeable':'true',
  'X-GeoMacro-Cost-USD':bodyOut.cost_usd.toFixed(2)});
}
