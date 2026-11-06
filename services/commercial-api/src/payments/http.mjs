import { PaymentError,requireValue,readJsonResponse } from './common.mjs';
import { provisionAccount } from '../accounts.mjs';
export function supabaseAuthenticator({url,publishableKey,fetchImpl=fetch}) {
 const origin=new URL(url);requireValue(origin.protocol==='https:'&&!origin.username&&!origin.password,'SUPABASE_HTTPS_REQUIRED',500);
 return async request=>{
  const auth=request.headers.get('authorization');requireValue(auth&&/^Bearer [A-Za-z0-9_.-]+$/.test(auth),'AUTH_REQUIRED',401);
  const response=await fetchImpl(new URL('/auth/v1/user',origin),{redirect:'manual',signal:AbortSignal.timeout(10_000),
    headers:{Authorization:auth,apikey:publishableKey}});
  if(response.status===401||response.status===403)throw new PaymentError('AUTH_INVALID',401);
  requireValue(response.ok,'AUTH_SERVICE_UNAVAILABLE');
  const user=await readJsonResponse(response);
  requireValue(user.id&&!user.is_anonymous&&user.email_confirmed_at,'VERIFIED_ACCOUNT_REQUIRED',403);return user;
 };
}
async function rawBody(request,max=65536){
 const reader=request.body?.getReader();if(!reader)return '';
 let length=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;
  requireValue(length<=max,'BODY_TOO_LARGE',413);chunks.push(Buffer.from(value));}}
 finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(chunks).toString('utf8');
}
async function body(request,max=65536){
 const text=await rawBody(request,max);
 try{return JSON.parse(text);}catch{throw new PaymentError('INVALID_JSON',400);}
}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const safeSqlErrors={IDEMPOTENCY_CONFLICT:409,EVENT_IDEMPOTENCY_CONFLICT:409,PAYMENT_PROCESSING:409,
 PAYMENT_LEASE_LOST:409,ACCOUNT_UNAVAILABLE:403,PAYMENT_REPLAY_CONFLICT:409};
/** Web-standard Request -> Response. Works in a Node Next.js route or standalone
 * server. Authentication callbacks must resolve server-verified users only. */
export function createPaymentHandler({paypal,x402,pool,authenticate,siteOrigin,onError=()=>{}}){
 return async request=>{
  try {
   const url=new URL(request.url);
   if(request.method==='GET'&&url.pathname==='/health')return json({ok:true,component:'geomacro-payments'});
   if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
   requireValue(request.headers.get('content-type')?.split(';')[0].trim()==='application/json','JSON_CONTENT_TYPE_REQUIRED',415);
   const origin=request.headers.get('origin');if(origin)requireValue(origin===siteOrigin,'ORIGIN_NOT_ALLOWED',403);
   if(url.pathname==='/payments/paypal/webhook'){
    requireValue(paypal,'PAYPAL_NOT_CONFIGURED');
    const raw=await rawBody(request);
    return json(await paypal.webhook(request.headers,raw));
   }
   if(url.pathname==='/v1/risk-gate'){
    requireValue(x402,'X402_NOT_CONFIGURED');
    return await x402.handle(await body(request),request.headers.get('payment-signature'),{signal:request.signal});
   }
   requireValue(paypal,'PAYPAL_NOT_CONFIGURED');
   const creation=url.pathname==='/payments/paypal/orders'?'pack':url.pathname==='/payments/paypal/subscriptions'?'subscription':null;
   const capture=url.pathname.match(/^\/payments\/paypal\/orders\/([A-Za-z0-9-]+)\/capture$/);
   if(!creation&&!capture)return json({error:'NOT_FOUND'},404);
   const user=await authenticate(request);
   await provisionAccount(pool,user);
   if(capture)return json(await paypal.capture({orderId:capture[1],userId:user.id}));
   const input=await body(request);
   return json(await paypal.create({userId:user.id,requestId:input.request_id,sku:input.sku,kind:creation}),201);
  }catch(error){
   const sqlStatus=safeSqlErrors[error.message];
   const code=error instanceof PaymentError?error.code:sqlStatus?error.message:
    error.name==='AbortError'?'REQUEST_ABORTED':'PAYMENT_SERVICE_UNAVAILABLE';
   const status=error instanceof PaymentError?error.status:sqlStatus??503;
   // Callback gets a safe code, never raw payment payloads/auth headers/keys.
   onError({code,status});return json({error:code},status);
  }
 };
}
