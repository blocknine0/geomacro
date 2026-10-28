import {interpretMultilingualIntelligenceQuery} from "./multilingual-query-intent";
import {publicCapabilityNewSalesAllowed} from "./capability-pricing-catalog";

/**
 * Pure, no-funds remediation for users and machine agents whose selected SKU
 * conflicts with the question. Never change the original purchase request,
 * silently up/downsell, mint evidence, produce a quote or authorize payment.
 * A suggested exact plan is always consent-gated and rechecked by canonical
 * availability/x402 before a buyer can submit it.
 */
export const QUERY_RESOLUTION_SCHEMA="geomacro.universal-query-resolution.v1";
type Plain={ [key:string]:unknown };
const object=(x:unknown):x is Plain=>!!x && typeof x==="object" && !Array.isArray(x);
const bounded=(x:unknown,max:number)=>typeof x==="string"&&x.length<=max?x:null;
const unsupportedCode=(error:unknown)=>bounded(error instanceof Error?error.message:null,96)
  ??"UNSUPPORTED_OR_AMBIGUOUS_REQUEST";
const SCOPE_CODES=new Set([
 "STORE_STRUCTURAL_QUESTION_SCOPE_UNSUPPORTED",
 "STORE_STRUCTURAL_PRODUCT_SCOPE_MISMATCH",
 "STORE_STRUCTURAL_PRODUCT_DIMENSIONS_REQUIRED",
 "STRUCTURAL_PRODUCT_CURRENT_NEWS_NOT_SUPPORTED",
 "DIGEST_REQUIRES_ONE_DIMENSION",
 "PROFILE_REQUIRES_AT_LEAST_TWO_DIMENSIONS",
 "FOCUSED_REQUIRES_ONE_SEMANTIC_TOPIC",
 "STANDARD_REQUIRES_ONE_SUBJECT_UP_TO_THREE_TOPICS",
 "STORE_INTELLIGENCE_QUERY_SCOPE_MISMATCH",
 "STORE_SIGNED_OBJECT_SCOPE_MISMATCH",
 "SIGNED_NEW_REQUIRES_ISSUED_AFTER",
 "EXPLICIT_TOPICS_CONTRADICT_QUESTION",
 "EXPLICIT_SUBJECTS_CONTRADICT_QUESTION",
 "QUERY_INTENT_CONFLICT",
 "STRUCTURAL_BASELINE_PILOT_SCOPE_UNSUPPORTED",
]);
export function publicQueryResolution(input:unknown,error:unknown) {
 const code=unsupportedCode(error);
 const base={
  schema_version:QUERY_RESOLUTION_SCHEMA,
  status:"REQUIRES_BUYER_REVIEW" as const,
  failed_requirement: SCOPE_CODES.has(code)?code:"QUERY_REVIEW_REQUIRED",
  chargeable:false as const,
  payment_required_now:false as const,
  payment_authorized:false as const,
  execution_authorized:false as const,
  auto_upgrade:false as const,
  auto_charge:false as const,
  same_original_request_preserved:true as const,
  suggested_product:null as null|{capability:string,variant:string},
  indicative_price_usdc:null as string|null,
  suggested_canonical_request:null as Plain|null,
  suggested_query_plan_hash:null as string|null,
  suggestion_status:"NO_VERIFIED_SAFE_SUGGESTION" as string,
  next_endpoint:"/api/v1/intelligence/interpret",
  next_availability_endpoint:"/api/v1/intelligence/products-availability",
  pricing_endpoint:"/api/v1/pricing",
  available_evidence_checked:false as const,
  reviewer_must_explicitly_submit_suggested_request:true as const,
 };
 if(!object(input)||typeof input.question!=="string"||input.question.length<3||input.question.length>2000 ||
    !SCOPE_CODES.has(code))return base;
 // Never guess a current signed GRO from a general topic: without an explicit
 // signed-risk request a normal intelligence question stays a plain query.
 // Keep bounded explicit subjects/topics for global ISO3 and unsupported
 // natural languages, but allow semantic-only fallback when those conflict.
 const candidates=[
  {question:input.question,language:input.language,subjects:input.subjects,topics:input.topics,
   client_request_id:input.client_request_id},
  {question:input.question,language:input.language,subjects:input.subjects,
   client_request_id:input.client_request_id},
  {question:input.question,language:input.language,
   client_request_id:input.client_request_id},
 ];
 for(const candidate of candidates){
  try{
   const interpreted=interpretMultilingualIntelligenceQuery(candidate);
   const next=interpreted.selected_product;
   if(!publicCapabilityNewSalesAllowed(next.capability)||next.capability==="risk_gate_bundle")
     continue;
   const original=object(input.product)?input.product:null;
   if(original?.capability===next.capability && original?.variant===next.variant)
     continue; // An identical request cannot be presented as a repair.
   return {
    ...base,
    suggested_product:next,
    indicative_price_usdc:interpreted.indicative_catalog_price.amount_usdc,
    suggested_canonical_request:interpreted.canonical_request,
    suggested_query_plan_hash:interpreted.query_plan_hash,
    suggestion_status:"NON_BINDING_ALTERNATIVE_REQUIRES_EXPLICIT_CONSENT",
   };
  }catch{/* try an unambiguous narrower interpretation, never assume success */}
 }
 return base;
}
