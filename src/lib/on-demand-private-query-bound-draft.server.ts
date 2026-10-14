import {createHash} from "node:crypto";
import {agentAdaptiveQuerySchema,buildAgentQueryPlan,
  type AgentQueryPlan} from "./agent-query-plan";
import {canonicalRiskObjectJson} from "./risk-object-signing.server";
import {approvedFedBoardMinutesAttribution,
  type FederalReserveBoardDerivedAttribution}
  from "./federal-reserve-board-derived-attribution";
import {type buildPrivateVerifiedFedMinutesFinding} from "./on-demand-evidence-qualification.server";

/**
 * Narrow review-only binding of an ACTUAL customer request to the existing
 * verified Board minutes original. This does NOT create an eligible product,
 * a signed GRO, an x402 quote, or a durable customer delivery.
 *
 * The customer request is re-planned and checked against the exact production
 * hash. Its unnormalized question bytes are hashed, never logged or retained
 * in the draft. A generic macro-risk question is NOT answered by merely
 * finding an unrelated original announcement.
 */
type VerifiedFedFinding=NonNullable<ReturnType<typeof buildPrivateVerifiedFedMinutesFinding>>;
export type PrivateFedQueryBindingRejection=
  "EXACT_CUSTOMER_QUESTION_MISSING"|"CANONICAL_QUERY_PLAN_MISMATCH"|
  "UNSUPPORTED_CUSTOMER_INTENT"|"SUBJECT_COUNTRY_CATEGORY_MISMATCH"|
  "UNSUPPORTED_QUESTION_CLAIM"|"ORIGINAL_SOURCE_PROOF_UNVERIFIED"|
  "REAL_SOURCE_OBSERVATION_CLOCK_MISSING"|"ORIGINAL_OUTSIDE_QUERY_WINDOW"|
  "CURRENT_QUERY_REQUIRES_FRESH_ORIGINAL";

type PrivateQueryBoundDraft=Readonly<{
 schema:"geomacro.private-query-bound-fed-draft.v1";
 status:"QUERY_BOUND_DRAFT_NOT_COMMERCIALLY_ADMITTED";
 country_iso3:"USA";category:"macro";
 source_event:"FED_BOARD_DISCOUNT_WINDOW_MEETING_MINUTES_PUBLISHED";
 query_plan_sha256:string;exact_customer_question_sha256:string;
 source_evidence_sha256:string;source_original_identity_sha256:string;
 original_published_at_utc:string;observed_at_utc:string;
 original_age_seconds:number;max_age_seconds:number;
 source_classification:"CURRENT_24H_ORIGINAL"|"HISTORICAL_ORIGINAL";
 expiry_at_utc:string;
 finding:string;cause_context:string;
 supported_implications:readonly string[];uncertainty:readonly string[];
 required_attribution:"Board of Governors of the Federal Reserve System";
 required_data_attribution:FederalReserveBoardDerivedAttribution;
 risk_score:null;
 source_page_verified:true;
 independent_review_accepted:false;
 item_commercial_rights_admitted:false;
 signing_eligible:false;
 signed:false;
 durable_freeze_authorized:false;
 x402_payment_authorized:false;
}>;
export type PrivateQueryBoundFedDraftResult=
 | Readonly<{ok:false;reason:PrivateFedQueryBindingRejection}>
 | Readonly<{ok:true;draft:PrivateQueryBoundDraft;canonical_private_json:string;
             canonical_private_sha256:string}>;

const SHA=/^[a-f0-9]{64}$/u;
const hash=(value:string)=>createHash("sha256").update(value,"utf8").digest("hex");
const blocked=(reason:PrivateFedQueryBindingRejection):
  PrivateQueryBoundFedDraftResult=>({ok:false,reason});
const APPROVED_QUESTION_TERMS: readonly RegExp[]=[
 /\b(?:federal reserve|fed)\b/iu,
 /\bdiscount[\s-]*(?:window|rate)\b/iu,
 /\bminutes\b/iu,
 /\b(?:publish(?:ed|ing)?|releas(?:e|ed|ing)|when)\b/iu,
 /\b2026\b/iu,
];
const UNSUPPORTED_CUSTOMER_CLAIM=
  /\b(?:risk score|risk index|gri|risk gate|fx|foreign exchange|market reaction|market impact|predict|forecast|rate change|changed rates?|cut rates?|raise rates?|rate hike|rate cut|should (?:i|we)|today|latest|right now)\b/iu;
const CURRENT_QUESTION=/\b(?:current|latest|today|right now|in the last 24 hours?|past 24 hours?)\b/iu;

/**
 * The existing exact plan and original are both prerequisites. A passing
 * result means only that this particular, narrow Board minutes fact directly
 * answers the received question; it NEVER waives rights/reviewer/signing.
 */
export function bindPrivateFedMinutesToExactCustomerQuery(input:Readonly<{
 receivedRequest:unknown;
 canonicalPlan:AgentQueryPlan;
 finding:VerifiedFedFinding;
}>):PrivateQueryBoundFedDraftResult{
 const raw=input.receivedRequest;
 if(!raw||typeof raw!=="object"||Array.isArray(raw)||
    typeof (raw as {question?:unknown}).question!=="string"||
    !(raw as {question:string}).question.trim())
   return blocked("EXACT_CUSTOMER_QUESTION_MISSING");
 const exactQuestion=(raw as {question:string}).question;
 const parsed=agentAdaptiveQuerySchema.safeParse(raw);
 if(!parsed.success)return blocked("UNSUPPORTED_CUSTOMER_INTENT");
 let plan:AgentQueryPlan;
 try{plan=buildAgentQueryPlan(parsed.data);}
 catch{return blocked("UNSUPPORTED_CUSTOMER_INTENT");}
 const p=input.canonicalPlan;
 if(!SHA.test(p.query_plan_hash)||plan.query_plan_hash!==p.query_plan_hash||
    plan.question_key!==p.question_key)
   return blocked("CANONICAL_QUERY_PLAN_MISMATCH");
 if(p.intent!=="single_subject"||p.fulfillment_mode!=="live_on_demand"||
    p.delivery_tier!=="signed_risk_intelligence"||p.as_of!==null||
    p.risk_gate_context!==null||p.ranking!==null||p.change!==null)
   return blocked("UNSUPPORTED_CUSTOMER_INTENT");
 if(p.subjects.length!==1||p.subjects[0].type!=="country"||
    p.subjects[0].country_iso3!=="USA"||
    p.topics.length!==1||p.topics[0]!=="macro_risk"||
    parsed.data.topics.length!==1||parsed.data.topics[0]!=="macro_risk")
   return blocked("SUBJECT_COUNTRY_CATEGORY_MISMATCH");
 const q=plan.question_key;
 if(!q||!APPROVED_QUESTION_TERMS.every(term=>term.test(q))||
    UNSUPPORTED_CUSTOMER_CLAIM.test(q)||
    /\b(?:august|september)\b/iu.test(q)===false)
   return blocked("UNSUPPORTED_QUESTION_CLAIM");
 const f=input.finding;
 if(f.schema!=="geomacro.private-source-bound-intelligence-candidate.v1"||
    f.country_iso3!=="USA"||f.category!=="macro"||
    f.verified_event!=="FED_BOARD_DISCOUNT_WINDOW_MEETING_MINUTES_PUBLISHED"||
    !f.provenance.original_page_verified||
    f.provenance.issuer!=="Board of Governors of the Federal Reserve System"||
    !SHA.test(f.provenance.article_identity_sha256)||
    !SHA.test(f.evidence_fingerprint_sha256)||
    f.query_binding.received_query_plan_hash!==p.query_plan_hash||
    !SHA.test(f.query_binding.discovery_query_fingerprint_sha256)||
    f.query_binding.exact_customer_question_verified!==false||
    f.rights.item_specific_commercial_admission_verified!==false||
    f.reviewer.independent_same_event_verified!==false||
    f.reviewer.acceptance_status!=="BLOCKED_ITEM_RIGHTS_AND_INDEPENDENT_REVIEW"||
    f.registered_signing_eligible!==false||f.signed!==false||
    f.x402_payment_authorized!==false)
   return blocked("ORIGINAL_SOURCE_PROOF_UNVERIFIED");
 const freshness=f.source_freshness;
 if(!freshness)return blocked("REAL_SOURCE_OBSERVATION_CLOCK_MISSING");
 const sourceAt=Date.parse(f.original_publication_utc);
 const checkedAt=Date.parse(freshness.checked_at_utc);
 if(!Number.isFinite(sourceAt)||!Number.isFinite(checkedAt)||
    checkedAt<sourceAt||f.original_publication_utc!=="2026-10-13T18:00:00.000Z"||
    freshness.original_age_seconds!==Math.floor((checkedAt-sourceAt)/1000)||
    freshness.current_24h_window_expires_utc!=="2026-10-14T18:00:00.000Z"||
    (freshness.classification==="CURRENT_24H_ORIGINAL")!==(checkedAt-sourceAt<=86400_000))
   return blocked("ORIGINAL_SOURCE_PROOF_UNVERIFIED");
 // Unspecified freshness retains the existing strict 24h discovery default.
 // A historical release requires an EXPLICIT wider permitted research window.
 const maxAge=p.requested_max_age_seconds??86_400;
 if(!Number.isSafeInteger(maxAge)||maxAge<1||maxAge>31*86_400||
    checkedAt-sourceAt>maxAge*1000)
   return blocked("ORIGINAL_OUTSIDE_QUERY_WINDOW");
 if(CURRENT_QUESTION.test(q)&&freshness.classification!=="CURRENT_24H_ORIGINAL")
   return blocked("CURRENT_QUERY_REQUIRES_FRESH_ORIGINAL");
 const prepared:PrivateQueryBoundDraft={
   schema:"geomacro.private-query-bound-fed-draft.v1",
   status:"QUERY_BOUND_DRAFT_NOT_COMMERCIALLY_ADMITTED",
   country_iso3:"USA",category:"macro",
   source_event:"FED_BOARD_DISCOUNT_WINDOW_MEETING_MINUTES_PUBLISHED",
   query_plan_sha256:p.query_plan_hash,
   exact_customer_question_sha256:hash(exactQuestion),
   source_evidence_sha256:f.evidence_fingerprint_sha256,
   source_original_identity_sha256:f.provenance.article_identity_sha256,
   original_published_at_utc:f.original_publication_utc,
   observed_at_utc:freshness.checked_at_utc,
   original_age_seconds:freshness.original_age_seconds,
   max_age_seconds:maxAge,
   source_classification:freshness.classification,
   expiry_at_utc:new Date(sourceAt+maxAge*1000).toISOString(),
   finding:f.finding,cause_context:f.cause_context,
   supported_implications:f.supported_implications,
   uncertainty:f.uncertainty,
   required_attribution:"Board of Governors of the Federal Reserve System",
   // Bound to canonical PRIVATE draft bytes; no output, signer or payment.
   required_data_attribution:approvedFedBoardMinutesAttribution(),
   risk_score:null,source_page_verified:true,
   independent_review_accepted:false,item_commercial_rights_admitted:false,
   signing_eligible:false,signed:false,
   durable_freeze_authorized:false,x402_payment_authorized:false,
 };
 const canonical_private_json=canonicalRiskObjectJson(prepared);
 return {ok:true,draft:prepared,canonical_private_json,
   canonical_private_sha256:hash(canonical_private_json)};
}
