import { describe, expect, it } from "vitest";
import {inspectAskSse, probeAsk} from "../../scripts/ops/verify-live-ask-sse.mjs";
function completed() {
 return {summary:"India's latest available ANNUAL consumer-price inflation is 4.2% for 2025.",
 what_changed:"Compared with 2024 the annual rate changed -1.0 percentage points.",
 why_it_matters:"ANNUAL observations are not monthly CPI or live market ticks.",
 geomacro_view:"World Bank WDI annual series, source 2. 2025 checked 2026-10-17.",
 source_identity_exposed:false,durable_live_storage_write:false,
 signed_gro_generated:false,insufficient_evidence:false,
 evidence:[{eventId:"live:official:numeric",title:"Official period 2025",relevance:100}]};
}
const sse=(answer=completed())=>
 'event: stage\ndata: {"stage":"researching"}\n\n'+
 'event: stage\ndata: {"stage":"finalizing"}\n\n'+
 'event: answer\ndata: '+JSON.stringify({ok:true,data:answer})+'\n\n';
describe("outside-in official on-demand Ask SSE acceptance",()=>{
 it("accepts research progress and exactly one completed grounded official annual answer",async()=>{
  const fetchImpl=async (url:string,options:RequestInit)=>{
    expect(url).toContain("/api/ask/v2/turn");
    expect(options.method).toBe("POST");
    expect(String(options.body)).toContain("India latest inflation rate");
    expect(String(options.body)).not.toContain("payment");
    return new Response(sse(),{status:200,headers:{"content-type":"text/event-stream"}});
  };
  const r=await probeAsk(fetchImpl as typeof fetch);
  expect(r.ok).toBe(true);
  expect(r.progress_events).toBe(2);
  expect(r.annual_measurement_labeled).toBe(true);
  expect(r.free_research_without_payment).toBe(true);
 });
 it("rejects an error event, missing completed answer and wrong MIME",()=>{
  expect(()=>inspectAskSse('event: error\ndata: {"ok":false}\n\n',"text/event-stream"))
    .toThrow("ASK_LIVE_PROGRESS_NOT_STREAMED");
  expect(()=>inspectAskSse(sse(),"text/html")).toThrow("ASK_LIVE_SSE_CONTENT_TYPE_MISSING");
  expect(()=>inspectAskSse('event: stage\ndata: {"stage":"researching"}\n\n',"text/event-stream"))
    .toThrow("ASK_LIVE_FINAL_EVENT_INVALID");
 });
 it("requires actual official numeric observation and rejects a fake confident source link",async()=>{
  const invalid={...completed(),summary:"Fresh claim with https://example.com and 99% for 2025."};
  const impl=async()=>new Response(sse(invalid),{headers:{"content-type":"text/event-stream"}});
  await expect(probeAsk(impl as typeof fetch)).rejects.toThrow("ASK_LIVE_PRIVATE_UPSTREAM_LEAK");
  const unverified=async()=>new Response(sse({...completed(),insufficient_evidence:true}),
    {headers:{"content-type":"text/event-stream"}});
  await expect(probeAsk(unverified as typeof fetch)).rejects.toThrow("ASK_LIVE_OFFICIAL_NUMBER_NOT_VERIFIED");
 });
});
