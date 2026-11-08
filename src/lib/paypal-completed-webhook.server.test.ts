import {afterEach,describe,expect,it,vi} from "vitest";
import {handleVerifiedPayPalCommercialWebhook}
 from "./paypal-completed-webhook.server";

const initial={...process.env};
const orderId="7AB1234567891234C";
const captureId="9CF1234567891234D";
const merchant="MERCHANT123456";
const intentId="gmpi_123e4567-e89b-42d3-a456-426614174000";
const at=new Date().toISOString();
function configure(){
 process.env.GEOMACRO_PAYPAL_ENVIRONMENT="live";
 process.env.GEOMACRO_PAYPAL_CLIENT_ID="test-public-client";
 process.env.GEOMACRO_PAYPAL_CLIENT_SECRET="test-private-client-secret";
 process.env.GEOMACRO_PAYPAL_WEBHOOK_ID="WH-TEST-WEBHOOK";
 process.env.GEOMACRO_PAYPAL_MERCHANT_ID=merchant;
 process.env.GEOMACRO_PAYPAL_FUNDING_ATTESTATION_KEY="S".repeat(64);
 process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK="I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH";
 process.env.GEOMACRO_COMMERCE_EMERGENCY_FREEZE="false";
 process.env.GEOMACRO_COMMERCE_DISABLED_PROVIDERS="";
}
function input(t=at){
 const event={id:"WH-VERIFIED-CAPTURE",event_type:"PAYMENT.CAPTURE.COMPLETED",
  resource:{id:captureId,supplementary_data:{related_ids:{order_id:orderId}}}};
 return new Request("https://geomacro.live/api/v1/payments/paypal",{
  method:"POST",headers:{
   "Content-Type":"application/json",
   "paypal-transmission-time":t,
   "paypal-transmission-id":"trans-1",
   "paypal-cert-url":"https://api-m.paypal.com/v1/notifications/certs/CERT-1",
   "paypal-auth-algo":"SHA256withRSA",
   "paypal-transmission-sig":"provider-signature",
  },body:JSON.stringify(event),
 });
}
function fetcher({valid=true,capture=captureId}:{valid?:boolean,capture?:string}={}){
 const calls:string[]=[];
 const fetchImpl=vi.fn(async(url:string)=>{
  calls.push(url);
  if(url.endsWith("/v1/oauth2/token"))return Response.json({access_token:"test-token"});
  if(url.endsWith("/v1/notifications/verify-webhook-signature"))
   return Response.json({verification_status:valid?"SUCCESS":"FAILURE"});
  if(url.endsWith("/v2/checkout/orders/"+orderId)){
   return Response.json({id:orderId,intent:"CAPTURE",status:"COMPLETED",
    purchase_units:[{custom_id:intentId,invoice_id:intentId,payee:{merchant_id:merchant},
     amount:{currency_code:"USD",value:"5.00"},
     payments:{captures:[{id:capture,status:"COMPLETED",final_capture:true,
      update_time:at,amount:{currency_code:"USD",value:"5.00"}}]}}]});
  }
  throw Error("UNEXPECTED_NETWORK_ACCESS");
 }) as unknown as typeof fetch;
 return {calls,fetchImpl};
}
const worker=()=>vi.fn(async(_request:Request,action:string,payload:Record<string,unknown>)=>{
 if(action==="paypal-webhook-intent"){
  expect(payload).toEqual({order_id:orderId});
  return {ok:true,intentId,orderId,amountMinorUnits:500};
 }
 if(action==="paypal-webhook-fund"){
  expect(payload.proof).toMatchObject({orderId,captureId,merchantId:merchant,
   intentId,amountMinorUnits:500,currency:"USD",environment:"live"});
  expect(payload.attestation).toMatch(/^[a-f0-9]{64}$/);
  return {ok:true,receiptId:"r_paypal_"+captureId,credits:100,
   idempotent_replay:false};
 }
 throw Error("UNEXPECTED_INTERNAL_ACTION");
}) as unknown as Parameters<typeof handleVerifiedPayPalCommercialWebhook>[1] extends
 {workerCall?:infer T}?T:never;
afterEach(()=>{process.env={...initial};vi.restoreAllMocks();});
describe("verified PayPal capture webhook (isolated provider and D1 mocks; NO REAL FUNDS)",()=>{
 it("matches verified signature+live provider GET to durable D1 intent and one funding command",async()=>{
  configure();
  const {fetchImpl,calls}=fetcher();
  const workerCall=worker();
  const response=await handleVerifiedPayPalCommercialWebhook(input(),{fetchImpl,workerCall});
  expect(response.status).toBe(200);
  const data=await response.json();
  expect(data).toMatchObject({ok:true,reconciled:true,credits_funded:100,
    idempotent_replay:false});
  expect(workerCall).toHaveBeenCalledTimes(2);
  expect(calls.filter(x=>x.includes("/v2/checkout/orders/"))).toHaveLength(1);
  expect(calls.every(x=>x.startsWith("https://api-m.paypal.com/"))).toBe(true);
  expect(JSON.stringify(data)).not.toContain("test-private-client-secret");
 });
 it("refuses forged PayPal signatures before any order lookup or credit grant",async()=>{
  configure();const {fetchImpl,calls}=fetcher({valid:false});
  const workerCall=worker();
  const response=await handleVerifiedPayPalCommercialWebhook(input(),{fetchImpl,workerCall});
  expect(response.status).toBe(403);
  expect(workerCall).not.toHaveBeenCalled();
  expect(calls.some(x=>x.includes("/v2/checkout/orders/"))).toBe(false);
 });
 it("rejects mismatched provider capture IDs without calling the ledger",async()=>{
  configure();const {fetchImpl}=fetcher({capture:"DIFFERENT123456"});
  const workerCall=worker();
  const response=await handleVerifiedPayPalCommercialWebhook(input(),{fetchImpl,workerCall});
  expect(response.status).toBe(403);
  expect(workerCall).toHaveBeenCalledTimes(1);
 });
 it("keeps capture reconciliation closed under emergency freeze",async()=>{
  configure();process.env.GEOMACRO_COMMERCE_EMERGENCY_FREEZE="true";
  const {fetchImpl}=fetcher();const workerCall=worker();
  const response=await handleVerifiedPayPalCommercialWebhook(input(),{fetchImpl,workerCall});
  expect(response.status).toBe(503);
  expect(workerCall).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
 });
});
