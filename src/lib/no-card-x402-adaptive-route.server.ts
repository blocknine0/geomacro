import process from "node:process";
import type { AgentQueryPlan } from "./agent-query-plan";
import { checkAgentQueryDeliverability } from "./agent-query-deliverability.server";
import { checkAgentQueryExternalModule } from "./agent-query-external-modules.server";
import { resolveEligiblePublishedCapabilityPrice } from "./verified-capability-coinbase-binding.server";
import { prepareVerifiedCapabilityOffer,assertFrozenCapabilityResponse } from "./capability-x402-offer.server";
import { getCommercialLaunchState } from "./commercial-launch-gate.server";
import { GEOMACRO_USDC_NATIVE_RAILS } from "./usdc-native-rail-identities";
import { GEOMACRO_STRUCTURED_LICENSE_DISCOVERY, GEOMACRO_STRUCTURED_LICENSE_HEADERS }
  from "./geomacro-structured-commercial-license";
import { allowPublicDemoRequest } from "./public-demo-rate-limit.server";
import { coinbaseRequestFingerprint,decodeCoinbasePaymentHeader,encodeX402Header }
  from "./coinbase-x402.server";
import { capabilityQuoteFromPaymentPayload } from "./capability-x402-payment-contract.server";
import { freezeCanonicalCapabilityHttpBody,sendFrozenCapabilityHttpBody }
  from "./capability-x402-exact-http-body.server";
import { assertNoCardProductionAuthorized,readAlreadyDeliveredNoCardReplay,
  requirementsForNoCardQuote,runNoCardMainnetPreparedPurchase,
  probeNoCardX402Supported,type NoCardX402Provider } from "./no-card-x402-payment-adapter.server";

/**
 * Separate, explicitly opt-in mainnet route handler.
 * Existing Coinbase path is untouched unless the merchant enables this feature
 * AFTER acceptance, or a previous settled no-card proof requests exact replay.
 *
 * Never switches an already-signed provider/chain. Never uses testnet.
 */
const PRODUCT_ID="geomacro_adaptive_risk_intelligence_v1";
const NAMES={
  base:{provider:"xpay_x402" as const,rail:GEOMACRO_USDC_NATIVE_RAILS.base},
  polygon:{provider:"dexter_x402" as const,rail:GEOMACRO_USDC_NATIVE_RAILS.polygon},
};
const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type, PAYMENT-SIGNATURE, payment-signature",
  "Access-Control-Expose-Headers":"PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-Geomacro-Quote-ID, X-Geomacro-Delivery-SHA256, X-Geomacro-Output-License, Link",
  "Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff",
};
function response(data:unknown,status:number,extra:Record<string,string>={}) {
  return Response.json(data,{status,headers:{...CORS,...extra}});
}
function selectedNetwork(request:Request) {
  const key=new URL(request.url).searchParams.get("network")??"base";
  if(key!=="base" && key!=="polygon")throw Error("NO_CARD_NETWORK_NOT_SUPPORTED");
  return NAMES[key];
}
function requireMerchantPrelaunchFlags() {
  if(process.env.GEOMACRO_LOW_FEE_CHECKOUT_ENABLED!=="true" ||
     process.env.GEOMACRO_NO_CARD_MAINNET_ACK!=="I_AUTHORIZE_NO_CARD_FACILITATOR_REAL_USDC" ||
     process.env.GEOMACRO_REAL_FUNDS_SECURITY_ACK!=="I_ACCEPT_REAL_FUNDS_SECURITY_GATES" ||
     process.env.GEOMACRO_NO_CARD_PROVIDER_FEE_APPROVED!=="I_HAVE_VERIFIED_CURRENT_PROVIDER_FEES" ||
     !getCommercialLaunchState().authorized)
    throw Error("NO_CARD_MERCHANT_LAUNCH_LOCKED");
}
function exactPlanProof(payload:Record<string,unknown>,plan:AgentQueryPlan) {
  const ext=payload.extensions;
  const geomacro=ext && typeof ext==="object" && !Array.isArray(ext)
    ? (ext as Record<string,unknown>).geomacro:null;
  const info=geomacro && typeof geomacro==="object" && !Array.isArray(geomacro)
    ? (geomacro as Record<string,unknown>).info:null;
  if(!info||typeof info!=="object"||Array.isArray(info)||
     (info as Record<string,unknown>).query_plan_hash!==plan.query_plan_hash||
     (info as Record<string,unknown>).product!==PRODUCT_ID)
    throw Error("NO_CARD_QUERY_PLAN_PAYMENT_BINDING_INVALID");
}
export function publicNoCardSelectedNetwork(request:Request){
  return selectedNetwork(request);
}
export function explicitlyConfiguredNoCardCheckout(){
  return process.env.GEOMACRO_LOW_FEE_CHECKOUT_ENABLED==="true";
}

/**
 * Pure routing detector for canonical POST. It parses only to classify.
 * Invalid/mismatched proofs are handled by fail-closed checkout, never
 * forwarded to the Coinbase settlement path as a fallback.
 */
export function isNoCardSignedPayload(header:string|null) {
  if(!header)return false;
  try{
    const p=decodeCoinbasePaymentHeader(header);
    const q=capabilityQuoteFromPaymentPayload(p);
    return q.payment_rail==="xpay_x402"||q.payment_rail==="dexter_x402";
  }catch{return false;}
}

export async function handleNoCardAdaptiveCheckout(input:{
  request:Request;plan:AgentQueryPlan;requestBody:unknown;clientRequestId?:string|null;
  replayOnly?:boolean;
}) {
  const {request,plan}=input;
  let selected:typeof NAMES.base|typeof NAMES.polygon;
  try{selected=selectedNetwork(request);}
  catch{return response({ok:false,chargeable:false,error:{code:"MAINNET_NETWORK_UNSUPPORTED"}},400);}
  const {provider,rail}=selected;
  const fp=coinbaseRequestFingerprint({product:PRODUCT_ID,query_plan_hash:plan.query_plan_hash,request:
    input.requestBody});
  const signature=request.headers.get("payment-signature");
  let signed:Record<string,unknown>|null=null;
  if(signature){
    try{
      signed=decodeCoinbasePaymentHeader(signature);
      const quote=capabilityQuoteFromPaymentPayload(signed);
      if(quote.payment_rail!==provider || quote.network!==rail.caip2 ||
         quote.asset_contract!==rail.asset.toLowerCase() ||
         quote.request_fingerprint_sha256!==fp)
        throw Error("NO_CARD_SELECTED_NETWORK_OR_REQUEST_MISMATCH");
      exactPlanProof(signed,plan);
      // A previously settled immutable receipt remains replayable after a
      // launch switch/freeze or expired source state; no new funds involved.
      const delivered=await readAlreadyDeliveredNoCardReplay({
        quote,paymentPayload:signed,requestFingerprint:fp});
      if(delivered){
        assertFrozenCapabilityResponse(delivered.response);
        return sendFrozenCapabilityHttpBody(freezeCanonicalCapabilityHttpBody(delivered.response),
          delivered.responseSha256,{
            ...CORS,...GEOMACRO_STRUCTURED_LICENSE_HEADERS,
            "PAYMENT-RESPONSE":encodeX402Header({
              success:true,transaction:delivered.receipt,
              network:quote.network,extra:{idempotentReplay:true}}),
            "X-Geomacro-Quote-ID":quote.quote_id,
          });
      }
    }catch{
      return response({ok:false,chargeable:null,payment_state:"RECONCILIATION_REQUIRED",
        error:{code:"NO_CARD_SIGNED_REPLAY_PROOF_INVALID_OR_UNAVAILABLE"}},409);
    }
  }
  if(input.replayOnly)
    return response({ok:false,chargeable:false,error:{code:"NO_CARD_NEW_SALES_DISABLED_REPLAY_ONLY"}},503);
  try{requireMerchantPrelaunchFlags();}
  catch{return response({ok:false,chargeable:false,error:{code:"NO_CARD_MERCHANT_MAINNET_NOT_AUTHORIZED"}},503);}

  if(plan.fulfillment_mode!=="published_only" ||
     plan.product?.capability==="risk_gate_bundle" || plan.topics.includes("risk_gate"))
    return response({ok:false,chargeable:false,error:{code:"NO_CARD_PAID_SCOPE_NOT_DELIVERABLE"}},422);
  if(!signed && !allowPublicDemoRequest(request,{
    namespace:"no-card-x402-prequote",windowMs:60_000,maxPerClient:2,maxGlobal:12}))
    return response({ok:false,chargeable:false,error:{code:"NO_CARD_PREQUOTE_RATE_LIMITED"}},429);
  let availability;
  try{
    availability=await checkAgentQueryDeliverability(plan,{
      externalModuleChecker:checkAgentQueryExternalModule,
    });
  }catch{
    return response({ok:false,chargeable:false,error:{code:"NO_CARD_AVAILABILITY_UNAVAILABLE"},
      retry_after_seconds:120},503,{"Retry-After":"120"});
  }
  if(!availability.deliverable)
    return response({ok:false,chargeable:false,payment_required_now:false,
      error:{code:availability.code,message:"No eligible prepared evidence; no funds collected."}},422);
  let price;
  try{price=resolveEligiblePublishedCapabilityPrice(plan,availability);}
  catch{return response({ok:false,chargeable:false,error:{code:"NO_CARD_PRICE_OR_RIGHTS_UNVERIFIED"}},422);}
  if(!signed){
    try{
      if(!await probeNoCardX402Supported(provider,rail.caip2))
        throw Error("FACILITATOR_NOT_CURRENTLY_SUPPORTED");
      const offered=await prepareVerifiedCapabilityOffer({
        plan,availability,clientRequestId:input.clientRequestId??null,
        requestFingerprint:fp,rail:provider,network:rail.caip2,asset:rail.asset,
        recipient:process.env.GEOMACRO_USDC_RECEIVER??"",
      });
      assertNoCardProductionAuthorized(offered.quote);
      const requirement=requirementsForNoCardQuote(offered.quote);
      const required={
        x402Version:2,
        resource:{
          url:request.url,
          description:"Governed GeoMacro structured intelligence; no raw publisher data",
          mimeType:"application/json",
        },
        accepts:[requirement],
        extensions:{geomacro:{info:{
          product:PRODUCT_ID,query_plan_hash:plan.query_plan_hash,
          capability_quote:offered.quote,
          structured_output_license_id:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.id,
        }}},
      };
      return response(required,402,{...GEOMACRO_STRUCTURED_LICENSE_HEADERS,
        "PAYMENT-REQUIRED":encodeX402Header(required)});
    }catch{
      return response({ok:false,chargeable:false,payment_required_now:false,
        error:{code:"NO_CARD_OFFER_NOT_INDEPENDENTLY_VERIFIED"}},503);
    }
  }
  // New payment only: never silently switch the rail or SKU, and never settle
  // after fresh evidence/price/rights change.
  try{
    const quote=capabilityQuoteFromPaymentPayload(signed);
    if(quote.capability!==price.capability||quote.variant!==price.variant||
       quote.amount_atomic!==price.amount_atomic)
      throw Error("NO_CARD_SELECTED_PRICE_CHANGED");
    const paid=await runNoCardMainnetPreparedPurchase({
      quote,paymentPayload:signed,requestFingerprint:fp,
      clientRequestId:input.clientRequestId??null,
      revalidateCurrent:async(expected,prepared)=>{
        if(expected.request_fingerprint_sha256!==fp)return false;
        assertFrozenCapabilityResponse(prepared);
        const latest=await checkAgentQueryDeliverability(plan,{
          externalModuleChecker:checkAgentQueryExternalModule,
        });
        if(!latest.deliverable)return false;
        const current=resolveEligiblePublishedCapabilityPrice(plan,latest);
        return current.capability===expected.capability&&
          current.variant===expected.variant&&
          current.amount_atomic===expected.amount_atomic;
      },
    });
    const frozen=freezeCanonicalCapabilityHttpBody(paid.response);
    return sendFrozenCapabilityHttpBody(frozen,quote.prepared_answer_sha256,{
      ...CORS,...GEOMACRO_STRUCTURED_LICENSE_HEADERS,
      "PAYMENT-RESPONSE":encodeX402Header({
        success:true,transaction:paid.receipt,network:quote.network,
        extra:{idempotentReplay:paid.replayed}}),
      "X-Geomacro-Quote-ID":quote.quote_id,
    });
  }catch{
    return response({ok:false,chargeable:null,payment_state:"RECONCILIATION_REQUIRED",error:{
      code:"NO_CARD_SETTLEMENT_OR_DELIVERY_REQUIRES_RECONCILIATION",
      message:"No automatic re-charge; inspect the existing immutable payment state."
    }},503,{"Retry-After":"120"});
  }
}
