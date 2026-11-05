import { afterEach, describe, expect, it, vi } from "vitest";
import { collectAskModelContext } from "./ask-openai-evidence.server";
import { enhanceAskWithOpenAI, safeGroundedOpenAIOutput } from "./ask-openai-grounded.server";
import type { HybridAskAnswer } from "./hybrid-ask-intelligence.server";

const answer={
  answer_kind:"explainer",summary:"Sanctions can change copper access and inflation expectations.",
  what_changed:"No current disruption has been independently established.",
  why_it_matters:"Mineral processing exposure can affect input costs.",
  geomacro_view:"The effect depends on location and verified production changes.",
  evidence:[],insufficient_evidence:false,mean_relevance:null,low_confidence:false,
  gri:null,generatedAt:"2026-11-06T00:00:00.000Z",
  data_mode:"ephemeral_live",cache_status:"bypassed",
  source_identity_exposed:false,durable_live_storage_write:false,
} satisfies HybridAskAnswer;
const original=process.env.GEOMACRO_ASK_OPENAI_ENABLED;
const key=process.env.OPENAI_API_KEY;
afterEach(()=>{
  if(original===undefined)delete process.env.GEOMACRO_ASK_OPENAI_ENABLED;
  else process.env.GEOMACRO_ASK_OPENAI_ENABLED=original;
  if(key===undefined)delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY=key;
});
describe("GeoMacro private research + approved OpenAI composer",()=>{
  it("never calls a paid provider when opt-in or secret is absent",async()=>{
    const request=vi.fn();
    delete process.env.GEOMACRO_ASK_OPENAI_ENABLED;
    expect(await enhanceAskWithOpenAI("How do sanctions affect copper?",answer,"test-1",
      {fetchImpl:request as unknown as typeof fetch})).toBe(answer);
    expect(request).not.toHaveBeenCalled();
  });
  it("retains OSINT activity only as source-neutral counts with no false event proof",async()=>{
    const now=Date.parse("2026-11-06T02:00:00.000Z");
    const rows=[
      {category:"rare_earth",published_at:"2026-11-06T01:00:00.000Z",
       status:"osint_feed_observed_unverified"},
      {category:"rare_earth",published_at:"2026-11-06T01:15:00.000Z",
       status:"official_release_observed_unscored",topic:"mineral supply",
       same_event_corrob_verified:false,severity:null},
    ];
    const ctx=await collectAskModelContext("Latest copper and critical minerals news",answer,{
      now,readEdge:async()=>rows as any,
    });
    expect(ctx.research_activity_by_category).toEqual([{category:"rare_earth",count:1}]);
    expect(JSON.stringify(ctx)).not.toContain("osint_feed_observed_unverified");
    expect(ctx.verified_fact_count).toBe(0);
  });
  it("rejects fabricated figures and internal lane terms rather than changing evidence",()=>{
    const generated=JSON.stringify({
      summary:"Copper rose 32% today.",what_changed:"The supply shock is confirmed.",
      why_it_matters:"Prices increase.",geomacro_view:"Copper stocks declined.",
    });
    expect(safeGroundedOpenAIOutput(generated,answer,"Why copper?")).toBeNull();
    const internal=JSON.stringify({
      summary:"Unverified OSINT indicates copper shocks.",what_changed:"Some news.",
      why_it_matters:"Supply matters.",geomacro_view:"Monitor inputs.",
    });
    expect(safeGroundedOpenAIOutput(internal,answer,"Why copper?")).toBeNull();
  });
  it("accepts bounded explanation but preserves canonical evidence and flags",()=>{
    const content={summary:"Copper availability can change with export policy.",
      what_changed:"The current disruption has not been established.",
      why_it_matters:"Refining capacity affects access.",
      geomacro_view:"Specific exposure depends on location."};
    const got=safeGroundedOpenAIOutput(JSON.stringify(content),answer,"How does copper policy affect prices?");
    expect(got).toMatchObject(content);
    expect(got?.evidence).toBe(answer.evidence);
    expect(got?.gri).toBeNull();
    expect(got?.source_identity_exposed).toBe(false);
  });
  it("uses official endpoint, data-store off and no raw OSINT/URLs on model request",async()=>{
    process.env.GEOMACRO_ASK_OPENAI_ENABLED="true";
    process.env.OPENAI_API_KEY="sk-test-fake-key-not-real-123456";
    const payload=JSON.stringify({summary:"Copper availability can depend on export policy.",
      what_changed:"No disruption has been established.",
      why_it_matters:"Processing location matters.",geomacro_view:"Measure verified supply changes."});
    const response={status:"completed",output:[{content:[{type:"output_text",text:payload}]}]};
    const request=vi.fn(async(_url:string,options:RequestInit)=>
      new Response(JSON.stringify(response),{status:200}));
    const result=await enhanceAskWithOpenAI("Explain sanctions and copper",answer,"user-unique-test",
      {fetchImpl:request as unknown as typeof fetch,
       readContext:async()=>({
         categories:["geopolitics","rare_earth"],verified_fact_count:0,
         research_activity_by_category:[{category:"rare_earth",count:2}],
         official_release_context:[],
       })});
    expect(result.summary).toContain("Copper");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    const sent=JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(sent.store).toBe(false);
    expect(sent.model).toBe("gpt-6-luna");
    expect(sent.input).not.toContain("osint_feed_observed_unverified");
    expect(sent.input).not.toContain("http");
  });
});
