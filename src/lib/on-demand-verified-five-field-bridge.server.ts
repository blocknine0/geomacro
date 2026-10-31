import {qualifyMachineIntelligenceBatch} from "./machine-intelligence-publication.server";
import {extractQualifiedFiveFieldEvent,
  HIGH_AUTHORITY_PAID_INTELLIGENCE_UNIVERSE,
  type QualifiedFiveFieldEvent} from "./high-authority-paid-intelligence";

/**
 * Private, exact-query FIVE-FIELD bridge after the existing genuine machine
 * dual-authority fact + rights signatures, original reread and B2 registry
 * evidence checks. No semantic verification or rights are inferred here.
 *
 * An admissible internal event must also contain its own signed structured
 * what_happened and why_it_matters statements and bind the customer's
 * canonical query-plan hash. Missing any field leaves payment CLOSED.
 */
type Input=Parameters<typeof qualifyMachineIntelligenceBatch>[0] & {
  queryPlanHash:string;
};
type Dependencies=Parameters<typeof qualifyMachineIntelligenceBatch>[1];
const SHA=/^[a-f0-9]{64}$/u;
export async function buildSignedQueryBoundFiveFieldBatch(
  input:Input,deps?:Dependencies,
):Promise<Readonly<{
  schema:"geomacro.on-demand-verified-five-field-bridge.v1";
  query_plan_hash:string;
  qualified_event_count:number;
  event_fields:readonly QualifiedFiveFieldEvent[];
  independent_same_event_proof_verified:true;
  exact_original_item_permissions_verified:true;
  source_native_event_time_verified:true;
  payment_authorized:false;
  current_signed_gro_claimed:false;
}>> {
  if(!input || !SHA.test(input.queryPlanHash)||
    !Array.isArray(input.eventPackages) || !Array.isArray(input.rows))
    throw Error("QUERY_BOUND_HIGH_AUTHORITY_INPUT_INVALID");

  // This is the ONLY authority for proof flags below: it independently
  // verifies distinct Ed25519 facts/rights signatures and scoped original
  // item permissions, original bytes and event claim bindings.
  const qualified=await qualifyMachineIntelligenceBatch(input,deps);
  if(qualified.receipt.commercial_event_admission!==true ||
    qualified.receipt.qualified_event_count!==input.eventPackages.length ||
    Date.parse(qualified.qualified_until)<=(input.now?.getTime()??Date.now()))
    throw Error("QUERY_BOUND_SIGNED_EVIDENCE_NOT_VERIFIED");

  const fields:QualifiedFiveFieldEvent[]=[];
  for(const pkg of input.eventPackages){
    const event=pkg.event;
    const structured=event?.structured_payload;
    if(!structured || structured.query_plan_sha256!==input.queryPlanHash ||
      !event || typeof event.material_evidence_at!=="string")
      throw Error("QUERY_BOUND_SIGNED_EVENT_NOT_BOUND");
    // An official issuer label only reflects a source ID that appears in
    // both the fully verified candidate set and signed event source IDs.
    const originals=new Set(pkg.candidates.map(x=>x.source_registry_id));
    const sourceId=[...new Set(event.source_ids??[])].sort()
      .find(id=>originals.has(id) &&
        Object.hasOwn(HIGH_AUTHORITY_PAID_INTELLIGENCE_UNIVERSE,id));
    if(!sourceId)throw Error("QUERY_BOUND_HIGH_AUTHORITY_SOURCE_NOT_VERIFIED");
    const extracted=extractQualifiedFiveFieldEvent({
      source_id:sourceId,headline:event.title,
      event_timestamp:event.material_evidence_at,
      what_happened:structured.what_happened,
      why_it_matters:structured.why_it_matters,
      original_event_timestamp_verified:true,
      independent_same_event_verified:true,
      item_commercial_rights_verified:true,
    },input.now?.getTime()??Date.now());
    if(!extracted)throw Error("QUERY_BOUND_FIVE_FIELDS_NOT_VERIFIED");
    fields.push(extracted);
  }
  return Object.freeze({
    schema:"geomacro.on-demand-verified-five-field-bridge.v1" as const,
    query_plan_hash:input.queryPlanHash,
    qualified_event_count:fields.length,event_fields:Object.freeze(fields),
    independent_same_event_proof_verified:true as const,
    exact_original_item_permissions_verified:true as const,
    source_native_event_time_verified:true as const,
    // The customer's ephemeral vs durable x402 persistence path is still
    // unapproved; a successful proof bridge alone cannot open payment.
    payment_authorized:false as const,current_signed_gro_claimed:false as const,
  });
}
