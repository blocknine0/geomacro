import {randomUUID} from "node:crypto";
import type {AgentQueryPlan} from "./agent-query-plan";
import {publicAgentQueryAvailability, type AgentQueryDeliverability} from "./agent-query-deliverability.server";
import {assembleAgentQueryResponse} from "./agent-query-response.server";
import {resolveEligiblePublishedCapabilityPrice} from "./verified-capability-coinbase-binding.server";
import {quoteGeomacroPreparedCapability} from "./capability-prepared-quote.server";
import {freezeCanonicalCapabilityHttpBody} from "./capability-x402-exact-http-body.server";
import {freezeVerifiedCapabilityAnswer} from "./capability-x402-prequote.server";
import {sanitizeAndRehashPaidPreparedResponse,assertPublicPaidOutputBoundary} from "./public-paid-output-boundary";
import {GEOMACRO_STRUCTURED_LICENSE_DISCOVERY} from "./geomacro-structured-commercial-license";
import {assertGeomacroIntelligenceResponseContract} from "./geomacro-intelligence-contract";

/** One price classifier, governed assembler and existing durable vault.
 * No client-provided evidence or flags, synthetic signature, new scoring or
 * alternate pricing engine is admitted here. Structural digests remain
 * explicitly unsigned structural data, not signed current risk objects. */
export async function prepareVerifiedCapabilityOffer(input:{
  plan:AgentQueryPlan;availability:AgentQueryDeliverability;
  clientRequestId:string|null;requestFingerprint:string;
  rail:"coinbase_x402"|"circle_gateway_x402";
  network:string;asset:string;recipient:string;
}) {
  const price=resolveEligiblePublishedCapabilityPrice(input.plan,input.availability);
  const assembled=await assembleAgentQueryResponse({
    plan:input.plan,requestId:randomUUID(),clientRequestId:input.clientRequestId,
    priceUsdc:price.amount_usdc,
  });
  if(assembled.query_plan_hash!==input.plan.query_plan_hash || assembled.execution_authorized!==false)
    throw Error("CAPABILITY_PREQUOTE_QUERY_MISMATCH");
  const prepared=sanitizeAndRehashPaidPreparedResponse(assembled,{rejectEmbeddedLinks:true});
  assertGeomacroIntelligenceResponseContract(prepared);
  assertPublicPaidOutputBoundary(prepared);
  const response=sanitizeAndRehashPaidPreparedResponse({...prepared,
    availability:publicAgentQueryAvailability(input.availability),
    payment:{required:true,provider:input.rail,
      asset:"USDC",asset_contract:input.asset.toLowerCase(),network:input.network,
      amount_atomic:price.amount_atomic,amount_usdc:price.amount_usdc,
      capability:price.capability,variant:price.variant,
      output_contract_version:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.id,
      settlement_proof:"PAYMENT-RESPONSE_HEADER_ONLY",query_plan_bound:true},
  },{rejectEmbeddedLinks:true});
  assertFrozenCapabilityResponse(response);
  assertFrozenCapabilityCurrentForSettlement(response);
  const frozen=freezeCanonicalCapabilityHttpBody(response);
  const quote=quoteGeomacroPreparedCapability({
    capability:price.capability,variant:price.variant,
    requestFingerprint:input.requestFingerprint,preparedAnswerSha256:frozen.sha256,
    network:input.network,asset:input.asset,recipient:input.recipient,rail:input.rail,
    availabilityVerified:true,preparedAnswerVerified:true,
  });
  return freezeVerifiedCapabilityAnswer({quote,preparedIntelligence:response});
}

/** Validate without modifying any already quoted bytes or product hash. */
export function assertFrozenCapabilityResponse(response:Record<string,unknown>) {
  const {availability:_availability,payment:_payment,...safeIntelligence}=response;
  assertGeomacroIntelligenceResponseContract(safeIntelligence);
  assertPublicPaidOutputBoundary(response);
}

/** An unexpired quote cannot renew a signed object's own earlier expiry.
 * Delivered-only replay intentionally does not call this current-data check. */
export function assertFrozenCapabilityCurrentForSettlement(response:Record<string,unknown>,now=Date.now()) {
  if(!Number.isFinite(now)) throw Error("CAPABILITY_SIGNED_PROOF_EXPIRED");
  if(!Array.isArray(response.signed_risk_objects)) throw Error("CAPABILITY_SIGNED_PROOF_EXPIRED");
  for(const row of response.signed_risk_objects) {
    const expires=Date.parse(String(row?.object?.expires_at??""));
    if(!Number.isFinite(expires)||expires<=now) throw Error("CAPABILITY_SIGNED_PROOF_EXPIRED");
  }
}
