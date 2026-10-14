import { randomUUID } from "node:crypto";
import type { AgentQueryPlan } from "./agent-query-plan";
import { assembleAgentQueryResponse } from "./agent-query-response.server";
import type { AgentQueryDeliverability } from "./agent-query-deliverability.server";
import {
  resolveVerifiedPublishedPlanPrice,
  type VerifiedCapabilityPriceProof,
} from "./capability-pricing-verified-plan.server";
import { quoteGeomacroCapability, type CapabilityQuote } from "./capability-pricing";
import { commerceSha256, stableCommerceJson } from "./agent-commerce-delivery.server";
import { freezeVerifiedCapabilityAnswer } from "./capability-x402-prequote.server";
import {
  assertPublicPaidOutputBoundary, sanitizeAndRehashPaidPreparedResponse,
} from "./public-paid-output-boundary";
import { assertGeomacroIntelligenceResponseContract } from "./geomacro-intelligence-contract";

const SHA=/^[a-f0-9]{64}$/u;
const isObject=(value:unknown):value is Record<string,unknown> =>
  value!==null && typeof value==="object" && !Array.isArray(value);

/** Cryptographic, eligibility and source facts are exclusively server loaded.
 * A client plan alone, an LLM output or a probe's source count never satisfies
 * this prequote proof. An unknown signed-object lifecycle is never promoted.
 */
export function qualifyVerifiedPreparedCapability(
  plan:AgentQueryPlan,
  availability:AgentQueryDeliverability,
  prepared:Record<string,unknown>,
):VerifiedCapabilityPriceProof {
  if(availability.deliverable!==true ||
      availability.query_plan_hash!==plan.query_plan_hash ||
      availability.ineligible_source_ids.length>0 ||
      availability.stale_modules.length>0 || availability.missing_modules.length>0 ||
      prepared.query_plan_hash!==plan.query_plan_hash ||
      prepared.execution_authorized!==false) {
    throw Error("CAPABILITY_PREQUOTE_ELIGIBILITY_NOT_PROVEN");
  }
  const objects=prepared.signed_risk_objects;
  if(!Array.isArray(objects)) throw Error("CAPABILITY_PREQUOTE_SIGNED_EVIDENCE_MISSING");
  const signed=objects.length>0 && objects.length===plan.subjects.length &&
    objects.every(row=>{
      if(!isObject(row)||!isObject(row.object))return false;
      const proof=row.object,integrity=proof.integrity;
      return isObject(proof.verification) &&
        proof.verification.status==="VERIFIED" &&
        proof.commercial_eligibility_status==="VERIFIED" &&
        isObject(integrity) && SHA.test(String(integrity.payload_hash??"")) &&
        /ed25519/iu.test(String(integrity.signature_scheme??"")) &&
        typeof integrity.signing_key_id==="string" &&
        integrity.signing_key_id.length>0;
    });
  // An archive, GRI checksum or unsigned module alone is not a valid Ed25519
  // customer product. The canonical signer must have verified the GRO first.
  if(!signed)throw Error("CAPABILITY_PREQUOTE_SIGNED_RISK_OBJECT_UNAVAILABLE");
  const attestedChange=isObject(prepared.analysis) &&
    prepared.analysis.type==="change_since" &&
    Array.isArray(prepared.analysis.drivers) &&
    prepared.analysis.drivers.length>0;
  return {
    evidence_verified:true,
    rights_verified:true,
    signing_verified:true,
    deliverable:true,
    signed_object_lifecycle:"existing",
    change_attribution_verified:attestedChange,
  };
}

export type PreparedCapabilityOffer=Readonly<{
  quote:CapabilityQuote;
  intelligence:Record<string,unknown>;
}>;

/** Expensive bounded preflight is performed once before the 402. Every
 * immutable byte is frozen/read back through the existing authenticated DO.
 * A missing Worker operation blocks the quote; never fall back to 0.05 USDC.
 */
export async function prepareVerifiedCapabilityOffer(input:{
  plan:AgentQueryPlan;
  availability:AgentQueryDeliverability;
  clientRequestId:string|null;
  requestFingerprint:string;
  rail:"coinbase_x402"|"circle_gateway_x402";
  network:string;asset:string;recipient:string;
}):Promise<PreparedCapabilityOffer> {
  if(input.plan.fulfillment_mode!=="published_only" ||
      !SHA.test(input.requestFingerprint)) throw Error("CAPABILITY_PREQUOTE_SCOPE_UNSUPPORTED");
  // First assemble a governed response with no asserted payment amount. It
  // must be authentically source-qualified and signing-verified BEFORE 402.
  const initial=await assembleAgentQueryResponse({
    plan:input.plan,requestId:randomUUID(),
    clientRequestId:input.clientRequestId,
    priceUsdc:null,
  });
  const proof=qualifyVerifiedPreparedCapability(input.plan,input.availability,initial);
  const price=resolveVerifiedPublishedPlanPrice(input.plan,proof);
  const methodology=initial.methodology;
  if(!isObject(methodology))throw Error("CAPABILITY_PREQUOTE_METHOD_MISSING");
  const priced={
    ...initial,
    methodology:{
      ...methodology,
      pricing_phase:"CAPABILITY_USDC_V1",
      price_usdc:price.amount_usdc,
      pricing_contract_version:price.version,
      capability:price.capability,
      variant:price.variant,
    },
  };
  const prepared=sanitizeAndRehashPaidPreparedResponse(
    priced,{rejectEmbeddedLinks:true},
  );
  assertGeomacroIntelligenceResponseContract(prepared);
  assertPublicPaidOutputBoundary(prepared);
  const hash=commerceSha256(stableCommerceJson(prepared));
  const quote=quoteGeomacroCapability({
    capability:price.capability,variant:price.variant,
    requestFingerprint:input.requestFingerprint,
    preparedAnswerSha256:hash,
    rail:input.rail,network:input.network,asset:input.asset,
    recipient:input.recipient,availabilityVerified:true,
  });
  return freezeVerifiedCapabilityAnswer({quote,preparedIntelligence:prepared});
}
