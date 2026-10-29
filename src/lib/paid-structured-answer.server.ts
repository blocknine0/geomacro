import { ZodError } from "zod";
import { interpretMultilingualIntelligenceQuery } from "./multilingual-query-intent";
import { mainnetIntelligenceHandlers } from "./mainnet-intelligence-endpoint.server";
import { publicCapabilityNewSalesAllowed } from "./capability-pricing-catalog";
import { allowPublicDemoRequest } from "./public-demo-rate-limit.server";
import {publicQueryResolution} from "./universal-query-resolution";

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
  const url=new URL(request.url);
  if(url.search || url.hash) return noCharge("PAID_STRUCTURED_QUERY_PARAMS_FORBIDDEN",400);
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
  const targetUrl=new URL(TARGET,request.url);
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
    return await (options.post??mainnetIntelligenceHandlers.POST)({request:canonical});
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
    response:"Exact canonical 402 payment challenge or frozen 200 structured JSON",
    machine_tool:"paid_structured_answer",
    canonical_payment_resource:TARGET,
    prices:"/api/v1/pricing",
    risk_gate:"COMING_SOON",
    no_auto_charge:true, no_unverified_data_charge:true,
    no_raw_source_delivery:true, execution_authorized:false,
  },{headers:{...HEADERS,"Cache-Control":"public, max-age=300, must-revalidate"}}),
  POST:async({request}:{request:Request})=>paidStructuredAnswer(request),
};
