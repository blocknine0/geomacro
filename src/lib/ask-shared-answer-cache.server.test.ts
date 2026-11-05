import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {askAnswerTtlMs,cachedCanonicalAsk,cachedGroqAnswer} from "./ask-shared-answer-cache.server";
import type {HybridAskAnswer} from "./hybrid-ask-intelligence.server";
const answer=(fields:Partial<HybridAskAnswer>={}):HybridAskAnswer=>({
  summary:"Mineral processing changes may affect supply.",
  what_changed:"No live event claim.",
  why_it_matters:"Processing capacity matters.",
  geomacro_view:"Validate affected inputs.",
  evidence:[],insufficient_evidence:false,low_confidence:false,
  mean_relevance:null,gri:null,generatedAt:"2026-11-06T00:00:00.000Z",
  data_mode:"ephemeral_live",cache_status:"bypassed",
  source_identity_exposed:false,durable_live_storage_write:false,
  answer_kind:"explainer",...fields,
});
beforeEach(()=>vi.useFakeTimers().setSystemTime(new Date("2026-11-06T10:00:00Z")));
afterEach(()=>vi.useRealTimers());
describe("public GeoMacro Ask answer reuse without source/AI rereads",()=>{
 it("uses one canonical computation for duplicate questions across callers and returns independent copies",async()=>{
   const compute=vi.fn(async()=>answer());
   const q="What is critical minerals supply risk? Example 1507";
   const [a,b]=await Promise.all([
     cachedCanonicalAsk(q,compute),cachedCanonicalAsk(q,compute)]);
   expect(compute).toHaveBeenCalledTimes(1);
   a.evidence.push({eventId:"mutated",title:"",relevance:0});
   expect(b.evidence).toHaveLength(0);
   const hit=await cachedCanonicalAsk(q,compute);
   expect(hit.evidence).toHaveLength(0);
   expect(compute).toHaveBeenCalledTimes(1);
 });
 it("expires fresh-news entries in seconds and does not claim future freshness",async()=>{
   const q="What is today's latest copper news in Peru? Example 1508";
   const fn=vi.fn(async()=>answer({answer_kind:undefined}));
   await cachedCanonicalAsk(q,fn);
   await cachedCanonicalAsk(q,fn);
   expect(fn).toHaveBeenCalledTimes(1);
   await vi.advanceTimersByTimeAsync(16_000);
   await cachedCanonicalAsk(q,fn);
   expect(fn).toHaveBeenCalledTimes(2);
 });
 it("fails open to retrieval for personal prompts and never caches missing proof or signed index",async()=>{
   const personal="What did my team learn about lithium today?";
   const p=vi.fn(async()=>answer());
   await cachedCanonicalAsk(personal,p);await cachedCanonicalAsk(personal,p);
   expect(p).toHaveBeenCalledTimes(2);
   expect(askAnswerTtlMs("What is latest inflation in Canada?",
     answer({insufficient_evidence:true}))).toBe(0);
   expect(askAnswerTtlMs("What is a current GRI score?",answer())).toBe(0);
 });
 it("drops duplicate model calls only when canonical source revision and user language match",async()=>{
   const q="Explain how copper mining affects inflation Example 1510";
   const source=answer(),composer=vi.fn(async()=>answer({summary:"Copper supply affects prices."}));
   const [x,y]=await Promise.all([
     cachedGroqAnswer(q,source,composer),cachedGroqAnswer(q,source,composer)]);
   expect(x.summary).toEqual(y.summary);
   await cachedGroqAnswer(q,source,composer);
   expect(composer).toHaveBeenCalledTimes(1);
   await cachedGroqAnswer(q,answer({generatedAt:"2026-11-06T00:01:00Z"}),composer);
   expect(composer).toHaveBeenCalledTimes(2);
 });
 it("does not cache failure or unchanged model answer",async()=>{
   const q="Explain why sanctions can affect graphite Example 1511";
   const baseline=answer();
   const f=vi.fn().mockRejectedValueOnce(new Error("SOURCE_DOWN")).mockResolvedValueOnce(baseline);
   await expect(cachedCanonicalAsk(q,f)).rejects.toThrow("SOURCE_DOWN");
   await cachedCanonicalAsk(q,f);expect(f).toHaveBeenCalledTimes(2);
   const echo=vi.fn(async()=>baseline);
   await cachedGroqAnswer(q,baseline,echo);await cachedGroqAnswer(q,baseline,echo);
   expect(echo).toHaveBeenCalledTimes(2);
 });
 it("caps midnight freshness for news",()=>{
   vi.setSystemTime(new Date("2026-11-06T23:59:55Z"));
   expect(askAnswerTtlMs("Latest geopolitical developments today?",answer())).toBe(5_000);
 });
});
