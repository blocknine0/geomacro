import {afterEach,describe,expect,it,vi} from "vitest";
import {enhanceAskWithFreeGroq} from "./ask-free-groq-grounded.server";
import type {HybridAskAnswer} from "./hybrid-ask-intelligence.server";
const a={
 summary:"Sanctions may affect copper refining and transport.",
 what_changed:"A real-world shortage has not been established.",
 why_it_matters:"Refining access affects supply conditions.",
 geomacro_view:"The scope of policy matters.",
 evidence:[],insufficient_evidence:false,mean_relevance:null,low_confidence:false,gri:null,
 generatedAt:"2026-11-06T00:00:00Z",data_mode:"ephemeral_live",cache_status:"bypassed",
 source_identity_exposed:false,durable_live_storage_write:false,answer_kind:"explainer",
} satisfies HybridAskAnswer;
const key=process.env.GROQ_API_KEY,enabled=process.env.GEOMACRO_ASK_FREE_GROQ_ENABLED;
afterEach(()=>{
 if(key===undefined)delete process.env.GROQ_API_KEY;
 else process.env.GROQ_API_KEY=key;
 if(enabled===undefined)delete process.env.GEOMACRO_ASK_FREE_GROQ_ENABLED;
 else process.env.GEOMACRO_ASK_FREE_GROQ_ENABLED=enabled;
});
describe("opt-in Groq Free Plan Ask model with source-private canonical proofs",()=>{
 it("never calls a model without explicit zero-cost activation",async()=>{
   delete process.env.GEOMACRO_ASK_FREE_GROQ_ENABLED;
   process.env.GROQ_API_KEY="gsk-synthetic-test-not-valid-000000";
   const req=vi.fn();
   expect(await enhanceAskWithFreeGroq("Why does nickel matter?",a,"client",{fetchImpl:req as any})).toBe(a);
   expect(req).not.toHaveBeenCalled();
 });
 it("converses only through free Groq endpoint with no original source metadata",async()=>{
   process.env.GEOMACRO_ASK_FREE_GROQ_ENABLED="true";
   process.env.GROQ_API_KEY="gsk-synthetic-test-not-valid-000000";
   const reply={summary:"Copper refining can be affected by sanctions.",
     what_changed:"No shortage has been established.",
     why_it_matters:"Supply access depends on location.",
     geomacro_view:"The specific restriction determines exposure."};
   const mock=vi.fn(async (_url:string,_opts:RequestInit)=>new Response(JSON.stringify({
     choices:[{message:{content:JSON.stringify(reply)}}],
   }),{status:200}));
   const q="Explain sanctions affecting copper refining Example 2499";
   const got=await enhanceAskWithFreeGroq(q,a,"other-client-2499",{
     fetchImpl:mock as unknown as typeof fetch,
     readContext:async()=>({categories:["geopolitics","rare_earth"],canonical_evidence_items:0,
       research_activity_by_category:[{category:"geopolitics",count:1}],
       official_release_context:[]}),
   });
   expect(got.summary).toBe(reply.summary);
   expect(got.evidence).toStrictEqual(a.evidence);
   expect(mock).toHaveBeenCalledTimes(1);
   const sent=JSON.parse(String(mock.mock.calls[0][1].body));
   expect(mock.mock.calls[0][0]).toBe("https://api.groq.com/openai/v1/chat/completions");
   expect(sent.model).toBe("openai/gpt-oss-20b");
   expect(sent.response_format).toEqual({type:"json_object"});
   expect(JSON.stringify(sent)).not.toMatch(/osint_feed_observed_unverified|api\.openai\.com|source_url/);
   await enhanceAskWithFreeGroq(q,a,"other-client-2499",{fetchImpl:mock as any});
   expect(mock).toHaveBeenCalledTimes(1);
 });
 it("cannot turn insufficient research into a confirmed fact or signed score",async()=>{
   process.env.GEOMACRO_ASK_FREE_GROQ_ENABLED="true";
   process.env.GROQ_API_KEY="gsk-synthetic-test-not-valid-000000";
   const req=vi.fn();
   const none={...a,insufficient_evidence:true,answer_kind:undefined};
   expect(await enhanceAskWithFreeGroq("Latest sanctions news today? Example 2498",none,"client",{fetchImpl:req as any})).toBe(none);
   expect(req).not.toHaveBeenCalled();
 });
});
