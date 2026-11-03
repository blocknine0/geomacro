import process from "node:process";
import {createHash,createHmac} from "node:crypto";
import {configuredPayPal,verifyPayPalWebhook} from "./paypal-api.server";

const NO_STORE={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const CAPTURE=/^[A-Z0-9]{8,32}$/u;
const MERCHANT=/^[A-Z0-9]{8,32}$/u;
const REVERSAL_EVENTS=new Set(["PAYMENT.CAPTURE.REFUNDED","PAYMENT.CAPTURE.REVERSED"]);
const error=(code:string,status=503)=>Response.json(
  {ok:false,code,execution_authorized:false},{status,headers:NO_STORE});
function obj(value:unknown):Record<string,unknown>|null{
  return value&&typeof value==="object"&&!Array.isArray(value)
    ?value as Record<string,unknown>:null;
}
/** Read PayPal webhook in bounded chunks. A caller-provided Content-Length
 * cannot be trusted; refuse oversized actual streams before allocating.
 */
async function readPayPalWebhookBody(request:Request):Promise<string>{
  const limit=64*1024;
  const declared=Number(request.headers.get("content-length")??0);
  if(!Number.isFinite(declared)||declared>limit)
    throw Error("PAYPAL_WEBHOOK_BODY_TOO_LARGE");
  const reader=request.body?.getReader();const chunks:Uint8Array[]=[];
  let total=0;
  if(reader)for(;;){
    const {done,value}=await reader.read();if(done)break;
    total+=value.byteLength;
    if(total>limit){
      void reader.cancel().catch(()=>undefined);
      throw Error("PAYPAL_WEBHOOK_BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  const joined=new Uint8Array(total);let off=0;
  for(const chunk of chunks){joined.set(chunk,off);off+=chunk.byteLength;}
  return new TextDecoder().decode(joined);
}
export async function handleVerifiedPayPalReversalWebhook(
 request:Request,
 options:{fetchImpl?:typeof fetch}={},
):Promise<Response>{
  if(request.method!=="POST"||new URL(request.url).search)
    return error("PAYPAL_WEBHOOK_METHOD_INVALID",405);
  const config=configuredPayPal();
  const env=process.env;
  if(config?.environment!=="live"||
     !MERCHANT.test(String(env.GEOMACRO_PAYPAL_MERCHANT_ID??""))||
     String(env.GEOMACRO_PAYPAL_FUNDING_ATTESTATION_KEY??"").length<64)
    return error("PAYPAL_LIVE_WEBHOOK_NOT_CONFIGURED");
  const fetcher=options.fetchImpl??fetch;
  let raw:string,verified:{eventId:string;eventType:string},event:Record<string,unknown>;
  try{
    raw=await readPayPalWebhookBody(request);
    verified=await verifyPayPalWebhook({rawBody:raw,headers:request.headers,
      config,fetcher});
    event=obj(JSON.parse(raw))??{};
  }catch{return error("PAYPAL_WEBHOOK_SIGNATURE_OR_BODY_INVALID",403);}
  if(!REVERSAL_EVENTS.has(verified.eventType))
    return Response.json({ok:true,ignored:true},{headers:NO_STORE});
  const resource=obj(event.resource);
  const supplemental=obj(resource?.supplementary_data);
  const related=obj(supplemental?.related_ids);
  const captureId=verified.eventType==="PAYMENT.CAPTURE.REFUNDED"
    ?related?.capture_id:resource?.id;
  if(typeof captureId!=="string"||!CAPTURE.test(captureId))
    return error("PAYPAL_WEBHOOK_CAPTURE_REFERENCE_UNAVAILABLE",422);
  const merchantId=String(env.GEOMACRO_PAYPAL_MERCHANT_ID);
  const transmittedAt=request.headers.get("paypal-transmission-time");
  if(!transmittedAt)return error("PAYPAL_WEBHOOK_TRANSMISSION_TIME_MISSING",403);
  const webhookSha256=createHash("sha256").update(raw).digest("hex");
  const fields=["geomacro.paypal-refund.v1",verified.eventId,
    verified.eventType,captureId,merchantId,transmittedAt,webhookSha256];
  const attestation=createHmac("sha256",String(env.GEOMACRO_PAYPAL_FUNDING_ATTESTATION_KEY))
    .update(fields.join("\0")).digest("hex");
  const token=String(env.GEOMACRO_CUSTOMER_SSR_TOKEN??"");
  const base=String(env.GEOMACRO_CUSTOMER_WORKER_URL??"");
  let url:URL;
  try{url=new URL(base);}catch{return error("PAYPAL_WEBHOOK_WORKER_UNAVAILABLE");}
  if(token.length<64||url.protocol!=="https:"||url.username||url.password||
     url.search||url.hash||url.pathname!=="/"||
     [env.CONTROL_PLANE_TOKEN,env.GEOMACRO_COMMERCE_LEDGER_TOKEN].some(x=>x&&x===token))
    return error("PAYPAL_WEBHOOK_WORKER_UNAVAILABLE");
  let response:Response;
  try{
    response=await fetcher(new URL("/v1/internal/paypal-reversal",url),{
      method:"POST",redirect:"manual",signal:AbortSignal.timeout(20000),
      headers:{Authorization:"Bearer "+token,Origin:new URL(request.url).origin,
        "Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({eventId:verified.eventId,eventType:verified.eventType,
        captureId,merchantId,transmittedAt,webhookSha256,attestation}),
    });
  }catch{return error("PAYPAL_WEBHOOK_D1_UNAVAILABLE");}
  if(response.status!==200)
    return error("PAYPAL_WEBHOOK_REVERSAL_NOT_RECONCILED");
  let result:unknown;
  try{result=await response.json();}
  catch{return error("PAYPAL_WEBHOOK_REVERSAL_NOT_RECONCILED");}
  if(obj(result)?.ok!==true||obj(result)?.reversed!==true)
    return error("PAYPAL_WEBHOOK_REVERSAL_NOT_RECONCILED");
  return Response.json({ok:true,reconciled:true},{headers:NO_STORE});
}
