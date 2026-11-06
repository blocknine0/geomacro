import {afterEach,describe,expect,it,vi} from "vitest";
import {globalAskCacheKey,readGlobalAskModelCache,writeGlobalAskModelCache}
  from "./ask-global-public-model-cache.server";
import type {HybridAskAnswer} from "./hybrid-ask-intelligence.server";
const original=process.env.GROQ_API_KEY;
afterEach(()=>{if(original===undefined)delete process.env.GROQ_API_KEY;
 else process.env.GROQ_API_KEY=original;});
const answer={
 summary:"Inflation is a broad rise in prices.",
 what_changed:"This is a general explanation; no new event was established.",
 why_it_matters:"Purchasing power declines when prices rise.",
 geomacro_view:"Compare changes across periods and purchasing power.",
 answer_kind:"explainer",evidence:[],insufficient_evidence:false,low_confidence:false,
 gri:null,mean_relevance:null,data_mode:"permanent",generatedAt:"2026-11-06T00:00:00Z",
 cache_status:"miss",source_identity_exposed:false,durable_live_storage_write:false,
} satisfies HybridAskAnswer;
const edited={
 summary:"Inflation means prices increase broadly across the economy.",
 what_changed:answer.what_changed,why_it_matters:answer.why_it_matters,
 geomacro_view:answer.geomacro_view,
};
describe("source-neutral, bounded and shared public Groq answer cache",()=>{
 it("keys timeless public revision stably across serverless timestamps",()=>{
   const key=globalAskCacheKey("What is inflation?",answer);
   expect(key).toMatch(/^[a-f0-9]{64}$/);
   expect(globalAskCacheKey("What is inflation?",{...answer,generatedAt:"2032-01-01T00:00:00Z"})).toBe(key);
   expect(globalAskCacheKey("Latest inflation news",answer)).toBeNull();
   expect(globalAskCacheKey("What is my inflation?",answer)).toBeNull();
   expect(globalAskCacheKey("What is inflation?",{...answer,evidence:[{eventId:"private",timestamp:"2026-11-06"}] as any})).toBeNull();
   expect(globalAskCacheKey("What is inflation?",{...answer,gri:5 as any})).toBeNull();
 });
 it("never reaches D1 when server-only Groq secret is absent",async()=>{
   delete process.env.GROQ_API_KEY;
   const fetchImpl=vi.fn();
   expect(await readGlobalAskModelCache("What is inflation?",answer,fetchImpl as any)).toBeNull();
   expect(await writeGlobalAskModelCache("What is inflation?",answer,
     {...answer,...edited,model_rendering:"assisted"},fetchImpl as any)).toBe(false);
   expect(fetchImpl).not.toHaveBeenCalled();
 });
 it("accepts only valid fresh public text, revalidates against canonical and preserves evidence",async()=>{
   process.env.GROQ_API_KEY="gsk-synthetic-groq-secret-for-d1-cache-only-93401";
   const fetchImpl=vi.fn(async(url:string,options:RequestInit)=>{
      expect(url).toMatch(/^https:\/\/geomacro-control-plane\.daspallab202391\.workers\.dev\/v1\/internal\/ask\/public-model-cache\?key=/);
      expect(options.redirect).toBe("manual");
      expect(options.headers).toHaveProperty("Authorization");
      return new Response(JSON.stringify({ok:true,hit:true,fields:edited}),{status:200});
   });
   const hit=await readGlobalAskModelCache("What is inflation?",answer,fetchImpl as any);
   expect(hit).toMatchObject({summary:edited.summary,model_rendering:"assisted",
     model_render_cache:"hit",model_render_cache_scope:"distributed"});
   expect(hit?.evidence).toEqual([]);
   expect(JSON.stringify(hit)).not.toContain("gsk-synthetic-groq-secret");
   const unsafe=vi.fn(async()=>new Response(JSON.stringify({ok:true,hit:true,
     fields:{...edited,summary:"Inflation jumped 987% today."}}),{status:200}));
   expect(await readGlobalAskModelCache("What is inflation?",answer,unsafe as any)).toBeNull();
 });
 it("writes approved fields only, not sources, users, identities or conversation",async()=>{
   process.env.GROQ_API_KEY="gsk-synthetic-groq-secret-for-d1-cache-only-93401";
   let outgoing:any=null;
   const fetchImpl=vi.fn(async (_url:string,options:RequestInit)=>{
      outgoing=JSON.parse(String(options.body));
      expect(options.method).toBe("PUT");
      expect(options.redirect).toBe("manual");
      return new Response(JSON.stringify({ok:true,stored:true}),{status:200});
   });
   expect(await writeGlobalAskModelCache("What is inflation?",answer,
     {...answer,...edited,model_rendering:"assisted"},fetchImpl as any)).toBe(true);
   expect(Object.keys(outgoing.fields).sort()).toEqual(
     ["summary","what_changed","why_it_matters","geomacro_view"].sort());
   expect(Object.keys(outgoing).sort()).toEqual(["expires_at","fields","key"]);
   expect(JSON.stringify(outgoing)).not.toMatch(/gri|evidence|source_id|generatedAt|user_id|request_id/);
   expect(await writeGlobalAskModelCache("What is inflation?",answer,
     {...answer,model_rendering:"canonical"},fetchImpl as any)).toBe(false);
   expect(fetchImpl).toHaveBeenCalledTimes(1);
 });
});
