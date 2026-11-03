import {afterEach,describe,expect,it,vi} from "vitest";
import {createCustomerPayPalOrder,captureCustomerPayPalOrder} from "./paypal-customer-checkout.server";
const env={...process.env};
afterEach(()=>{process.env={...env};vi.restoreAllMocks();});
const req=(path:string,body:unknown,origin="https://geomacro.live")=>new Request(
  "https://geomacro.live"+path,{method:"POST",
    headers:{"Content-Type":"application/json",Origin:origin},
    body:JSON.stringify(body),
  });
describe("PayPal authenticated checkout never bypasses freeze or real-funds readiness",()=>{
 it("returns 423 during master emergency OFF before touching PayPal/D1",async()=>{
   process.env.GEOMACRO_COMMERCE_EMERGENCY_FREEZE="true";
   process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK="I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH";
   const fetcher=vi.spyOn(globalThis,"fetch");
   const response=await createCustomerPayPalOrder(req(
     "/api/v1/payments/paypal/create-order",{sku:"starter_pack"}));
   expect(response.status).toBe(423);
   expect(await response.json()).toMatchObject({ok:false,
     code:"CUSTOMER_PAYPAL_EMERGENCY_FREEZE_ACTIVE"});
   expect(fetcher).not.toHaveBeenCalled();
 });
 it("rejects missing origin, arbitrary SKU fields and absent merchant readiness",async()=>{
   process.env.GEOMACRO_COMMERCE_EMERGENCY_FREEZE="false";
   delete process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK;
   expect((await createCustomerPayPalOrder(req(
     "/api/v1/payments/paypal/create-order",{sku:"starter_pack"},"https://evil.test")))
     .status).toBe(403);
   expect((await createCustomerPayPalOrder(req(
     "/api/v1/payments/paypal/create-order",{sku:"starter_pack",amount:1})))
     .status).toBe(400);
   expect((await createCustomerPayPalOrder(req(
     "/api/v1/payments/paypal/create-order",{sku:"starter_pack"})))
     .status).toBe(503);
 });
 it("does not capture without a strict authenticated live buyer order",async()=>{
   process.env.GEOMACRO_COMMERCE_EMERGENCY_FREEZE="true";
   const fetcher=vi.spyOn(globalThis,"fetch");
   const res=await captureCustomerPayPalOrder(req(
     "/api/v1/payments/paypal/capture-order",{order_id:"INVALID"}));
   expect(res.status).toBe(400);
   const valid=await captureCustomerPayPalOrder(req(
     "/api/v1/payments/paypal/capture-order",
     {order_id:"8AB1234567891234C"}));
   expect(valid.status).toBe(423);
   expect(fetcher).not.toHaveBeenCalled();
 });
});
