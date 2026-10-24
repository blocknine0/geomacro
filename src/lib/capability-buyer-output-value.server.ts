import type {AgentQueryPlan} from "./agent-query-plan";
import type {AgentQueryDeliverability} from "./agent-query-deliverability.server";
import {isStructuralStoreProduct} from "./store-product-selection";

/**
 * Final BUYER-CONTENT gate. The availability preflight proves eligibility,
 * but a fresh assembly can still return no rows (e.g. a partial provider
 * outage). NEVER issue a payable 402 for empty/foreign/wrong-topic JSON.
 * This only checks delivered content; rights, time, signatures, price,
 * privacy and immutable bytes have their own independent fail-closed gates.
 */
const EXTERNAL=new Set(["signed_risk_object","risk_gate","gri_context","hot_topics"]);
const record=(v:unknown):v is Record<string,unknown> =>
  v!==null&&typeof v==="object"&&!Array.isArray(v);
const iso=(v:unknown):v is string=>typeof v==="string"&&/^[A-Z]{3}$/u.test(v);
const key=(value:unknown):string|null=>{
  if(!record(value))return null;
  if(value.type==="country"&&iso(value.country_iso3))
    return "country:"+value.country_iso3;
  if(value.type==="corridor"&&iso(value.origin_country_iso3)&&iso(value.destination_country_iso3)&&
     value.origin_country_iso3!==value.destination_country_iso3)
    return "corridor:"+value.origin_country_iso3+">"+value.destination_country_iso3;
  return null;
};
function fail(code:string):never{throw Error("CAPABILITY_BUYER_OUTPUT_"+code)}
const nonEmpty=(v:unknown):v is unknown[]=>Array.isArray(v)&&v.length>0;
const validTimestamp=(v:unknown,now:number):boolean=>
  typeof v==="string"&&Number.isFinite(Date.parse(v))&&
  Date.parse(v)<=now&&Date.parse(v)>0;

/** Check the delivered payload against the same exact immutable buyer plan.
 * No extra HTTP/source retrieval, no new storage or paid AI provider.
 */
export function assertPreparedCapabilityBuyerValue(
 plan:AgentQueryPlan,availability:AgentQueryDeliverability,
 payload:Record<string,unknown>,expectedPriceUsdc:string,
 now=Date.now(),
):void {
 if(!Number.isFinite(now)||!record(payload)||!record(payload.methodology)||
    payload.query_plan_hash!==plan.query_plan_hash||
    payload.methodology.price_usdc!==expectedPriceUsdc)
   fail("WRONG_PLAN_OR_PRICE");
 if(!availability?.deliverable||availability.code!=="AVAILABLE"||
    availability.query_plan_hash!==plan.query_plan_hash)
   fail("AVAILABILITY_NOT_VERIFIED");
 if(plan.product && (!record(payload.question_interpretation) ||
    JSON.stringify(payload.question_interpretation.product)!==JSON.stringify(plan.product)))
   fail("STORE_PRODUCT_SELECTION_MISMATCH");
 const subjectKeys=plan.subjects.map(key);
 if(subjectKeys.length<1||subjectKeys.some(k=>k===null)||
    new Set(subjectKeys).size!==subjectKeys.length ||
    !Array.isArray(payload.subjects)||
    payload.subjects.length!==subjectKeys.length||
    payload.subjects.some((s,i)=>key(s)!==subjectKeys[i]))
   fail("SUBJECTS_MISMATCH");
 if(!Array.isArray(payload.structural)||payload.structural.length!==subjectKeys.length)
   fail("STRUCTURAL_SUBJECTS_MISSING");
 const required=plan.required_modules.filter(x=>!EXTERNAL.has(x));
 for(let i=0;i<subjectKeys.length;i++){
   const row=payload.structural[i];
   if(!record(row)||key(row.subject)!==subjectKeys[i]||
      !record(row.intelligence)||!record(row.evidence_summary))
      fail("STRUCTURAL_SUBJECT_MISSING");
   for(const module of required){
     const delivered=row.intelligence[module];
     if(!record(delivered))fail("REQUIRED_MODULE_MISSING");
     const governed=typeof delivered.delivery==="string"&&
       delivered.delivery.startsWith("GOVERNED_") &&
       record(delivered.state)&&Object.keys(delivered.state).length>0 &&
       validTimestamp(delivered.source_observed_at,now);
     const originals=nonEmpty(delivered.observations)&&
       delivered.observations.some((v:unknown)=>record(v)&&
         (typeof v.value_text==="string"&&v.value_text.trim().length>0||
          typeof v.value_numeric==="number"&&Number.isFinite(v.value_numeric))) &&
       validTimestamp(row.evidence_summary.latest_observed_at,now);
     if(!governed&&!originals)fail("REQUIRED_MODULE_EMPTY_OR_UNDATED");
     if(isStructuralStoreProduct(plan.product) && plan.subjects[i].type==="corridor") {
       const subject=plan.subjects[i];
       if(subject.type!=="corridor" || !Array.isArray(delivered.observations) ||
          ![subject.origin_country_iso3,subject.destination_country_iso3].every(country=>
            (delivered.observations as unknown[]).some(value=>record(value)&&value.country_iso3===country)))
         fail("STORE_CORRIDOR_ENDPOINT_MISSING");
     }
   }
 }
 if(plan.required_modules.includes("signed_risk_object")){
   if(!Array.isArray(payload.signed_risk_objects)||
      payload.signed_risk_objects.length!==subjectKeys.length||
      payload.signed_risk_objects.some((r,i)=>!record(r)||
        key(r.subject)!==subjectKeys[i]||!record(r.object)||
        !record(r.object.verification)||r.object.verification.status!=="VERIFIED"))
      fail("SIGNED_OBJECT_MISSING");
 }
 if(plan.required_modules.includes("risk_gate")){
   if(!Array.isArray(payload.risk_gate)||payload.risk_gate.length!==subjectKeys.length||
      payload.risk_gate.some((r,i)=>!record(r)||
        key(r.subject)!==subjectKeys[i]||!record(r.result)))
      fail("RISK_GATE_MISSING");
 }
 if(plan.required_modules.includes("gri_context")){
   if(!record(payload.gri_context))fail("GRI_CONTEXT_MISSING");
 }
 if(plan.required_modules.includes("hot_topics")){
   if(!Array.isArray(payload.hot_topics)||payload.hot_topics.length!==subjectKeys.length||
      payload.hot_topics.some((r,i)=>!record(r)||key(r.subject)!==subjectKeys[i]||
        r.deliverable!==true))
      fail("HOT_TOPICS_MISSING");
 }
}
