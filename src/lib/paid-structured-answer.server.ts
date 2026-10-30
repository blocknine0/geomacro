import { ZodError } from "zod";
import { interpretMultilingualIntelligenceQuery } from "./multilingual-query-intent";
import { mainnetIntelligenceHandlers } from "./mainnet-intelligence-endpoint.server";
import { publicCapabilityNewSalesAllowed } from "./capability-pricing-catalog";
import { allowPublicDemoRequest } from "./public-demo-rate-limit.server";
import {publicQueryResolution} from "./universal-query-resolution";
import {canonicalCheckoutUrl,selectedCheckoutNetwork} from "./x402-checkout-network-selection";

export const GEOMACRO_PAID_STRUCTURED_TOOL = "geomacro.paid-structured-answer.v1" as const;
const TARGET = "/api/v1/intelligence/query";
const MAX_BYTES = 8192;
const HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE, payment-signature",
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-Geomacro-Delivery-SHA256, X-Geomacro-Quote-ID",
} as const;
const noCharge = (code:string,status=422,resolution?:ReturnType<typeof publicQueryResolution>) => Response.json({
  ok:false, chargeable:false, payment_required_now:false, payment_authorized:false,
  execution_authorized:false, error:{code},
  ...(resolution?{resolution}:{}),
},{status,headers:HEADERS});

type CanonicalPost=(args:{request:Request})=>Promise<Response>;
const LIVE_RESEARCH_RETRY_CODES=new Set([
  "NOT_AVAILABLE","INSUFFICIENT_COVERAGE","STALE_REQUIRED_DATA","UNAVAILABLE",
  "AVAILABILITY_CHECK_UNAVAILABLE","CDP_API_CREDENTIALS_MISSING",
  "COINBASE_X402_NOT_CONFIGURED","COINBASE_X402_CONFIGURATION_INVALID",
  "CAPABILITY_PRICE_UNVERIFIED_NO_CHARGE",
]);

async function retryWithBoundedLiveResearch(input:Readonly<{
  request:Request;
  query:ReturnType<typeof interpretMultilingualIntelligenceQuery>["canonical_request"];
  response:Response;
  post:CanonicalPost;
}>):Promise<Response>{
  if(input.request.headers.has("payment-signature")||
    (input.response.status!==422&&input.response.status!==503)||
    input.query.fulfillment_mode!=="published_only"||
    input.query.product?.capability!=="intelligence_query"||
    input.query.subjects.length!==1||input.query.subjects[0]?.type!=="country"||
    (input.query.as_of!==undefined&&input.query.as_of!==null)||
    (input.query.ranking!==undefined&&input.query.ranking!==null)||
    (input.query.change!==undefined&&input.query.change!==null)||
    (input.query.risk_gate_context!==undefined&&input.query.risk_gate_context!==null)||
    input.query.topics.some(topic=>["risk_object","risk_gate","gri_context"].includes(topic)))
    return input.response;
  let code:string|null=null;
  try{
    const payload=await input.response.clone().json() as {error?:{code?:unknown};availability?:{code?:unknown}};
    const candidate=payload.error?.code??payload.availability?.code;
    if(typeof candidate==="string")code=candidate;
  }catch{return input.response;}
  if(!code||!LIVE_RESEARCH_RETRY_CODES.has(code))return input.response;

  // Retry only as explicit no-payment discovery, only for a single-country
  // intelligence question and only after canonical deliverability refused a
  // charge. The paid request remains unchanged; no quote or payment signature
  // is generated or forwarded into the live research pass.
  const headers=new Headers({"Content-Type":"application/json"});
  for(const name of ["cf-connecting-ip","true-client-ip","x-forwarded-for"]){
    const value=input.request.headers.get(name);
    if(value)headers.set(name,value);
  }
  return input.post({request:new Request(new URL(TARGET,input.request.url),{
    method:"POST",headers,
    body:JSON.stringify({...input.query,fulfillment_mode:"live_on_demand"}),
  })});
}

/**
 * Thin, fast user + machine adapter. In one incoming POST, deterministic
 * multilingual classification maps a question to the exact locked SKU,
 * then invokes the EXISTING canonical x402 handler directly in-process.
 *
 * No separate news crawl, double D1 read, model-generated credentials,
 * alternative settlement, bypassed commercial proof or automatic billing.
 * When the buyer includes the previously issued PAYMENT-SIGNATURE, the very
 * same exact canonical request is passed to x402 for verification/settlement
 * and its original frozen JSON is returned without mutation.
 */
export async function paidStructuredAnswer(
  request:Request,
  options:Readonly<{
    post?:CanonicalPost;
    rateLimit?:(request:Request)=>boolean;
  }>={},
):Promise<Response>{
  // Select Base or Polygon on the same canonical payment resource. Unknown
  // parameters never silently fall back to a different chargeable network.
  try{selectedCheckoutNetwork(request);}
  catch{return noCharge("PAID_STRUCTURED_QUERY_PARAMS_FORBIDDEN",400);}
  if(request.headers.has("authorization") || request.headers.has("x-payment"))
    return noCharge("PAID_STRUCTURED_UNSUPPORTED_PAYMENT_HEADER",400);
  if(!/^application\/json(?:\s*;|\s*$)/iu.test(request.headers.get("content-type")??""))
    return noCharge("PAID_STRUCTURED_JSON_REQUIRED",415);
  const declared=request.headers.get("content-length");
  if(declared!==null && (!/^\d+$/u.test(declared)||Number(declared)>MAX_BYTES))
    return noCharge("PAID_STRUCTURED_BODY_TOO_LARGE",413);
  if(!(options.rateLimit?.(request)??allowPublicDemoRequest(request,{
    namespace:"geomacro-paid-structured-answer",
    windowMs:60_000,maxPerClient:12,maxGlobal:120,
  })))return noCharge("PAID_STRUCTURED_RATE_LIMITED",429);
  let interpreted:ReturnType<typeof interpretMultilingualIntelligenceQuery>;
  let input:unknown;
  try{
    const raw=await request.text();
    if(new TextEncoder().encode(raw).byteLength>MAX_BYTES)
      return noCharge("PAID_STRUCTURED_BODY_TOO_LARGE",413);
    input=JSON.parse(raw);
    interpreted=interpretMultilingualIntelligenceQuery(input);
  }catch(error){
    return noCharge(error instanceof ZodError?"PAID_STRUCTURED_INVALID_ARGUMENTS":
      error instanceof SyntaxError?"PAID_STRUCTURED_INVALID_JSON":
      "PAID_STRUCTURED_UNSUPPORTED_SCOPE",400,
      error instanceof ZodError||error instanceof SyntaxError?undefined:
        publicQueryResolution(input,error));
  }
  if(!publicCapabilityNewSalesAllowed(interpreted.selected_product.capability))
    return noCharge("PAID_STRUCTURED_PRODUCT_COMING_SOON",422);
  const targetUrl=canonicalCheckoutUrl(request,TARGET);
  // x402 payment challenge MUST bind to /api/v1/intelligence/query, even if
  // the caller came from this convenience endpoint.
  const forwardedHeaders=new Headers({"Content-Type":"application/json"});
  // Keep the existing limiter's proxy hints across this in-process adapter.
  // Without these, all human buyers share the canonical "unknown" bucket.
  // These remain hints, never authentication; the global limit still applies.
  for(const name of ["cf-connecting-ip","true-client-ip","x-forwarded-for"]){
    const value=request.headers.get(name);
    if(value)forwardedHeaders.set(name,value);
  }
  const paymentSignature=request.headers.get("payment-signature");
  if(paymentSignature)forwardedHeaders.set("PAYMENT-SIGNATURE",paymentSignature);
  const canonical=new Request(targetUrl,{
    method:"POST",headers:forwardedHeaders,
    body:JSON.stringify(interpreted.canonical_request),
  });
  try{
    const post=options.post??mainnetIntelligenceHandlers.POST;
    const response=await post({request:canonical});
    return await retryWithBoundedLiveResearch({request,query:interpreted.canonical_request,response,post});
  }catch{
    return noCharge("PAID_STRUCTURED_CANONICAL_HANDLER_UNAVAILABLE",503);
  }
}

export const paidStructuredAnswerHandlers={
  OPTIONS:async()=>new Response(null,{status:204,headers:HEADERS}),
  GET:async()=>Response.json({
    ok:true,schema_version:GEOMACRO_PAID_STRUCTURED_TOOL,
    endpoint:"/api/v1/intelligence/structured-answer",
    method:"POST",
    input:"question, optional language/subjects/topics/product",
    payment:"Canonical x402 PAYMENT-SIGNATURE header only; never accept wallet keys",
    response:"Canonical x402 challenge or frozen paid JSON when qualified; otherwise bounded zero-charge live-research JSON with explicit evidence status",
    machine_tool:"paid_structured_answer",
    canonical_payment_resource:TARGET,
    native_usdc_network_selection:"?network=base or ?network=polygon; currently gated by individual live payment-rail readiness",
    prices:"/api/v1/pricing",
    risk_gate:"COMING_SOON",
    no_auto_charge:true, no_unverified_data_charge:true,
    no_raw_source_delivery:true, execution_authorized:false,
    bounded_live_research_fallback:true,
    live_research_requires_no_payment_signature:true,
    live_research_never_issues_x402_quote:true,
  },{headers:{...HEADERS,"Cache-Control":"public, max-age=300, must-revalidate"}}),
  POST:async({request}:{request:Request})=>paidStructuredAnswer(request),
};
