import {CATEGORIES,WEIGHTS,CATEGORY_STATUS} from "./unified-risk-categories.mjs";
const clamp=x=>Math.min(1,Math.max(0,x));
const valid=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=1;
/** Null score is absence of evidence, NEVER 0 (safe). */
export function calculateUnifiedRisk(scores,{corridorExposureMultiplier=1}={}){
 if(!scores||typeof scores!=="object"||!Number.isFinite(corridorExposureMultiplier)||
    corridorExposureMultiplier<1||corridorExposureMultiplier>2)
  throw Error("UNIFIED_RISK_INVALID_INPUT");
 const entries=CATEGORIES.map(k=>[k,scores[k]]);
 const missing=entries.filter(([,v])=>!valid(v)).map(([k])=>k);
 if(missing.length)return {unifiedScore:null,dominantFactor:null,missing_categories:missing,
  assessment_status:"INSUFFICIENT_VERIFIED_CATEGORY_COVERAGE"};
 const base=entries.reduce((n,[k,v])=>n+WEIGHTS[k]*v,0);
 const risk=clamp(base*corridorExposureMultiplier);
 const dominant=entries.reduce((a,b)=>b[1]>a[1]?b:a)[0];
 return {unifiedScore:Number(risk.toFixed(4)),dominantFactor:dominant,missing_categories:[],
  assessment_status:"SIGNED_CATEGORY_CONTRIBUTIONS_AVAILABLE"};
}
/** Hard decisions require signed GRO + explicit approved client policy.
 * Neither syndicated publisher articles nor authority attribution alone suffice.
 */
export function generateCommercialTiers(result,{groVerified=false,policy=null,confidence=null}={}){
 const eligible=groVerified&&policy&&typeof policy==="object"&&
  valid(result?.unifiedScore)&&valid(confidence)&&
  Number.isFinite(policy.block_at)&&Number.isFinite(policy.pass_below)&&
  valid(policy.block_at)&&valid(policy.pass_below)&&policy.pass_below<policy.block_at&&
  confidence>=(policy.minimum_confidence??0.8);
 let core="GATE_INSUFFICIENT_EVIDENCE";
 if(eligible)core=result.unifiedScore>=policy.block_at?"GATE_BLOCKED":
  result.unifiedScore<policy.pass_below?"GATE_PASS":"GATE_HOLD";
 const signalLevel=result?.unifiedScore===null?"UNKNOWN":
   result.unifiedScore>0.6?"HIGH":result.unifiedScore>0.3?"ELEVATED":"LOW";
 return {core:{tier:"CORE",gate_decision:core,automatic_action:false,
   evidence_state:eligible?"SIGNED_GRO_CLIENT_POLICY":"POLICY_OR_VERIFIED_COVERAGE_REQUIRED"},
  signal:{tier:"SIGNAL",gate_decision:"GATE_ADVISORY",alert_level:signalLevel,
   risk_score:result?.unifiedScore??null,automatic_action:false},
  policy:{tier:"POLICY",strict_mode_outcome:core,
   lenient_mode_outcome:result?.unifiedScore===null?"OVERRIDE_REQUIRES_CLIENT_ACKNOWLEDGEMENT":
     result.unifiedScore>=0.6?"OVERRIDE_HOLD":"OVERRIDE_PASS",
   client_override_applied:false,execution_authorized:false}};
}
export function categoryView(category,sourceCount=0,score=null,gro=null){
 const ok=gro&&valid(score);
 return {category,risk_score:ok?score:null,confidence:ok?gro.confidence:null,
  source_count:Math.max(0,Math.min(40,sourceCount|0)),
  status:ok?CATEGORY_STATUS.VERIFIED:sourceCount>0?CATEGORY_STATUS.OBSERVED:CATEGORY_STATUS.EMPTY,
  signed_gro_object_id:ok?gro.object_id:null};
}
