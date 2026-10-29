import {describe,expect,it,vi} from "vitest";
import {paidStructuredAnswer,paidStructuredAnswerHandlers} from "./paid-structured-answer.server";
import {interpretMultilingualIntelligenceQuery} from "./multilingual-query-intent";
import {allowPublicDemoRequest} from "./public-demo-rate-limit.server";
import {agentAdaptiveQuerySchema,buildAgentQueryPlan} from "./agent-query-plan";

const endpoint="https://geomacro.live/api/v1/intelligence/structured-answer";
const question="ভারতের মুদ্রাস্ফীতি ও বৈদেশিক মুদ্রার রিজার্ভ";
function request(body:unknown,headers:Record<string,string>={},url=endpoint) {
 return new Request(url,{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body)});
}
describe("single-pass paid user and machine structured answer",()=>{
 it("keeps independent buyers separate while retaining the canonical global quota",async()=>{
   const namespace="adapter-client-isolation-"+crypto.randomUUID();
   const post=async({request:canonical}:{request:Request})=>{
     expect(canonical.headers.has("cookie")).toBe(false);
     const allowed=allowPublicDemoRequest(canonical,{
       namespace,windowMs:60_000,maxPerClient:1,maxGlobal:3,
     });
     return new Response(null,{status:allowed?402:429});
   };
   for(const header of ["cf-connecting-ip","true-client-ip","x-forwarded-for"]){
     const res=await paidStructuredAnswer(request({question},{
       [header]:"192.0.2."+(1+["cf-connecting-ip","true-client-ip","x-forwarded-for"].indexOf(header)),
       cookie:"private-session=not-forwarded",
     }),{rateLimit:()=>true,post});
     expect(res.status).toBe(402);
   }
   // A fourth distinct client still exhausts the shared global budget.
   expect((await paidStructuredAnswer(request({question},{"cf-connecting-ip":"192.0.2.4"}),
     {rateLimit:()=>true,post})).status).toBe(429);
 });
 it.each([
   question,
   "What are the latest geopolitical risks in India?",
   "What are the latest interest rates in the United States?",
   "What are the latest lithium supply developments in Australia?",
 ])("validates the unsigned research fallback with the real query planner: %s",async(question)=>{
   const expected=interpretMultilingualIntelligenceQuery({question});
   let calls=0;
   const res=await paidStructuredAnswer(request({question}),{
     rateLimit:()=>true,post:async ({request:canonical})=>{
       calls++;
       expect(new URL(canonical.url).pathname).toBe("/api/v1/intelligence/query");
       const body=await canonical.json();
       expect(canonical.headers.has("payment-signature")).toBe(false);
       if(calls===1){
         expect(body).toEqual(expected.canonical_request);
         return Response.json({ok:false,chargeable:false,payment_required_now:false,
           error:{code:"INSUFFICIENT_COVERAGE"}},{status:422});
       }
       const {product:_paidProduct,...researchRequest}=expected.canonical_request;
       expect(body).toEqual({...researchRequest,fulfillment_mode:"live_on_demand"});
       // Exercise the real canonical scope validator: a Store selector on
       // live research rejects before discovery, even when the adapter mock
       // would otherwise return a plausible research answer.
       const researchPlan=buildAgentQueryPlan(agentAdaptiveQuerySchema.parse(body));
       expect(researchPlan.fulfillment_mode).toBe("live_on_demand");
       expect(researchPlan.product).toBeUndefined();
       return Response.json({ok:false,chargeable:false,payment_required_now:false,
         structured_answer:{schema:"geomacro.structured-answer.v1",status:"INSUFFICIENT_VERIFIED_EVIDENCE",
           answer:null,delivery:{chargeable:false,execution_authorized:false}}},{status:422});
     },
   });
   expect(res.status).toBe(422);
   expect(calls).toBe(2);
   expect((await res.json()).structured_answer).toMatchObject({
     schema:"geomacro.structured-answer.v1",status:"INSUFFICIENT_VERIFIED_EVIDENCE",
   });
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
 it("does not run live discovery after a buyer has supplied payment proof",async()=>{
   let calls=0;
   const res=await paidStructuredAnswer(request({question},{"payment-signature":"synthetic-payment-token"}),{
     rateLimit:()=>true,post:async()=>{
       calls++;
       return Response.json({ok:false,chargeable:false,payment_required_now:false,
         error:{code:"NOT_AVAILABLE"}},{status:422});
     },
   });
   expect(res.status).toBe(422);
   expect(calls).toBe(1);
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
   const json=await res.json();
   expect(json.canonical_payment_resource).toBe("/api/v1/intelligence/query");
   expect(json.bounded_live_research_fallback).toBe(true);
   expect(json.live_research_never_issues_x402_quote).toBe(true);
 });
});
