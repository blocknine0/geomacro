import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({
  rpc:vi.fn(),maybeSingle:vi.fn(),verified:vi.fn(),
}));
vi.mock("./paypal-api.server",()=>({
  configuredPayPal:()=>({
    environment:"live",baseUrl:"https://api-m.paypal.com",
    clientId:"client",clientSecret:"never-exposed",webhookId:"WH-EXAMPLE",
  }),
  paypalAccessToken:async()=>"provider-access-token",
  verifyPayPalWebhook:mock.verified,
}));
vi.mock("./risk-supabase.server",()=>({
  requireRiskSupabase:()=>({
    rpc:mock.rpc,
    from:()=>({select:()=>({eq:()=>({maybeSingle:mock.maybeSingle})})}),
  }),
}));
import {handlePayPalPaidWebhook,livePayPalSettlementConfigured,
  reconcileCompletedPayPalCapture} from "./paypal-verified-funding.server";

const original={...process.env};
beforeEach(()=>{
  vi.clearAllMocks();
  process.env.GEOMACRO_PAYPAL_ENVIRONMENT="live";
  process.env.GEOMACRO_PAYPAL_LIVE_SETTLEMENT_APPROVED="true";
  process.env.GEOMACRO_PAYPAL_MERCHANT_ID="MERCHANT123";
  mock.verified.mockResolvedValue({
    verified:true,eventId:"WEBHOOK123",eventType:"PAYMENT.CAPTURE.COMPLETED",
  });
  mock.maybeSingle.mockResolvedValue({data:{
    id:"00000000-0000-4000-8000-000000000001",
    principal_id:"00000000-0000-4000-8000-000000000002",
    usd_cents:900,provider_environment:"live",state:"provider_order_created",
  },error:null});
  mock.rpc.mockResolvedValue({data:{ok:true,credits_issued:1000,idempotent_replay:false},error:null});
});
afterEach(()=>{process.env={...original};});
const provider=(merchant="MERCHANT123",usd="9.00") => vi.fn(async(url:string)=>{
 const value=url.includes("/payments/captures/")?{
  id:"CAPTURE123",status:"COMPLETED",amount:{currency_code:"USD",value:usd},
  supplementary_data:{related_ids:{order_id:"ORDER123"}},
  create_time:"2026-10-31T10:00:00Z",
 }:{
  id:"ORDER123",purchase_units:[{
    custom_id:"00000000-0000-4000-8000-000000000001",
    payee:{merchant_id:merchant},
    amount:{currency_code:"USD",value:"9.00"},
  }],
 };
 return new Response(JSON.stringify(value),{status:200});
}) as unknown as typeof fetch;

describe("PayPal verified-settlement safety",()=>{
 it("is disabled until the owner approves live settlement",()=>{
  delete process.env.GEOMACRO_PAYPAL_LIVE_SETTLEMENT_APPROVED;
  expect(livePayPalSettlementConfigured()).toBe(false);
 });
 it("funds only after signed event plus separate captured-payment and immutable order checks",async()=>{
  const fake=provider();
  const result=await handlePayPalPaidWebhook(JSON.stringify({
    id:"WEBHOOK123",event_type:"PAYMENT.CAPTURE.COMPLETED",
    resource:{id:"CAPTURE123"},
  }),new Headers(),fake);
  expect(result).toMatchObject({ok:true,accepted:true,
    settlement:{credits_issued:1000,idempotent_replay:false}});
  expect(mock.verified).toHaveBeenCalledTimes(1);
  expect(mock.rpc).toHaveBeenCalledWith("settle_commercial_paypal_credits",
    expect.objectContaining({p_order_id:"ORDER123",p_capture_id:"CAPTURE123",
      p_usd_cents:900,p_currency:"USD"}));
 });
 it("blocks incorrect merchant recipient without a credit write",async()=>{
  await expect(reconcileCompletedPayPalCapture("CAPTURE123",provider("OTHERMERCHANT")))
    .rejects.toThrow("PAYPAL_MERCHANT_OR_AMOUNT_MISMATCH");
  expect(mock.rpc).not.toHaveBeenCalled();
 });
 it("blocks partial or changed payment amounts without a credit write",async()=>{
  await expect(reconcileCompletedPayPalCapture("CAPTURE123",provider("MERCHANT123","8.00")))
    .rejects.toThrow("PAYPAL_MERCHANT_OR_AMOUNT_MISMATCH");
  expect(mock.rpc).not.toHaveBeenCalled();
 });
 it("ignores signed but non-capture events",async()=>{
  mock.verified.mockResolvedValueOnce({verified:true,eventId:"WH123",
    eventType:"CHECKOUT.ORDER.APPROVED"});
  const result=await handlePayPalPaidWebhook(JSON.stringify({
    id:"WH123",event_type:"CHECKOUT.ORDER.APPROVED",resource:{id:"ORDER123"},
  }),new Headers(),provider());
  expect(result).toMatchObject({accepted:false,reason:"EVENT_NOT_FUNDABLE"});
  expect(mock.rpc).not.toHaveBeenCalled();
 });
});
