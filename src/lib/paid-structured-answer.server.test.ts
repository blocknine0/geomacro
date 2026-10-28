import {describe,expect,it,vi} from "vitest";
import {paidStructuredAnswer,paidStructuredAnswerHandlers} from "./paid-structured-answer.server";
import {interpretMultilingualIntelligenceQuery} from "./multilingual-query-intent";

const endpoint="https://geomacro.live/api/v1/intelligence/structured-answer";
const question="ভারতের মুদ্রাস্ফীতি ও বৈদেশিক মুদ্রার রিজার্ভ";
function request(body:unknown,headers:Record<string,string>={},url=endpoint) {
 return new Request(url,{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body)});
}
describe("single-pass paid user and machine structured answer",()=>{
 it("maps a multilingual question to one identical canonical SKU and no secondary quote",async()=>{
   const expected=interpretMultilingualIntelligenceQuery({question});
   let calls=0;
   const res=await paidStructuredAnswer(request({question}),{
     rateLimit:()=>true,post:async ({request:canonical})=>{
       calls++;
       expect(new URL(canonical.url).pathname).toBe("/api/v1/intelligence/query");
       expect(await canonical.json()).toEqual(expected.canonical_request);
       expect(canonical.headers.has("payment-signature")).toBe(false);
       return Response.json({ok:false,chargeable:false,error:{code:"INSUFFICIENT_COVERAGE"}},{status:422});
     },
   });
   expect(res.status).toBe(422);
   expect(calls).toBe(1);
   expect((await res.json()).chargeable).toBe(false);
 });
 it("preserves canonical 402 challenge without issuing any payment itself",async()=>{
   const wire=JSON.stringify({x402Version:2,resource:{url:"https://geomacro.live/api/v1/intelligence/query"}});
   const res=await paidStructuredAnswer(request({question}),{
     rateLimit:()=>true,post:async()=>new Response(wire,{status:402,headers:{
       "content-type":"application/json","PAYMENT-REQUIRED":"synthetic-challenge",
     }}),
   });
   expect(res.status).toBe(402);
   expect(res.headers.get("PAYMENT-REQUIRED")).toBe("synthetic-challenge");
   expect(await res.text()).toBe(wire);
 });
 it("forwards buyer-supplied proof unchanged and returns frozen settlement body exactly",async()=>{
   const wire=JSON.stringify({schema_version:"geomacro.adaptive-intelligence-response.v1",
     decision_intelligence:[{market_watch:{status:"CONDITIONAL_MARKET_WATCH"}}],
     delivered_product_hash:"a".repeat(64),execution_authorized:false});
   let count=0;
   const res=await paidStructuredAnswer(request({question},{"payment-signature":"synthetic-payment-token"}),{
     rateLimit:()=>true,post:async ({request:canonical})=>{
       count++;
       expect(canonical.headers.get("payment-signature")).toBe("synthetic-payment-token");
       return new Response(wire,{status:200,headers:{
         "content-type":"application/json","X-Geomacro-Delivery-SHA256":"a".repeat(64),
       }});
     },
   });
   expect(count).toBe(1);
   expect(res.status).toBe(200);
   expect(await res.text()).toBe(wire);
 });
 it("blocks Risk Gate before calling canonical settlement handler",async()=>{
   const post=vi.fn(async()=>new Response(null,{status:200}));
   const res=await paidStructuredAnswer(request({
     question:"Risk gate for India",
     risk_gate_context:{action_type:"exposure_review",policy_preset:"balanced"},
   }),{rateLimit:()=>true,post});
   expect(res.status).toBe(422);
   expect((await res.json()).payment_required_now).toBe(false);
   expect(post).not.toHaveBeenCalled();
 });
 it("rejects invalid/unauthorized or oversized inputs before interpretation/payment",async()=>{
   const post=vi.fn(async()=>new Response(null,{status:200}));
   for(const req of [
     request({question},{authorization:"Bearer should-not-be-accepted"}),
     request({question},{},"https://geomacro.live/api/v1/intelligence/structured-answer?preview=1"),
   ]){
     const res=await paidStructuredAnswer(req,{rateLimit:()=>true,post});
     expect(res.status).toBe(400);
   }
   expect(post).not.toHaveBeenCalled();
 });
 it("advertises canonical rather than alternative payment authority",async()=>{
   const res=await paidStructuredAnswerHandlers.GET();
   expect((await res.json()).canonical_payment_resource).toBe("/api/v1/intelligence/query");
 });
});
