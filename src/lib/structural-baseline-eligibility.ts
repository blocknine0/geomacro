import type {AgentQueryPlan} from "./agent-query-plan";
import type {AgentQueryDeliverability} from "./agent-query-deliverability.server";

/**
 * Exactly the same mandatory, no-money admission condition that the
 * canonical structural baseline availability endpoint uses. Reused for
 * country coverage grade computation; no separate marketing eligibility.
 */
export function qualifiedStructuralBaselinePreflight(
 plan:AgentQueryPlan,availability:AgentQueryDeliverability,now=Date.now(),
):boolean{
 const observed=availability.subjects[0]?.latest_evidence_at;
 const observedAt=typeof observed==="string"?Date.parse(observed):Number.NaN;
 const rightsReady=availability.source_contracts.length>0&&
   availability.source_contracts.every(contract=>
     ["COMMERCIAL_OK","DERIVED_ONLY"].includes(contract.commercial_usage_status??"")&&
     contract.attribution_required===false);
 return availability.deliverable===true &&
   availability.code==="AVAILABLE" &&
   availability.query_plan_hash===plan.query_plan_hash &&
   availability.subjects.length===1 &&
   availability.subjects[0]?.subject.type===plan.subjects[0]?.type &&
   (plan.subjects[0]?.type!=="country"||
     availability.subjects[0]?.subject.type==="country" &&
     availability.subjects[0].subject.country_iso3===plan.subjects[0].country_iso3) &&
   Number.isFinite(observedAt)&&observedAt<=now&&
   rightsReady&&availability.ineligible_source_ids.length===0&&
   availability.missing_modules.length===0&&availability.stale_modules.length===0&&
   plan.required_modules.every(module=>
     availability.subjects[0].available_modules.includes(module));
}
