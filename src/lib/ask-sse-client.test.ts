import {afterEach,describe,expect,it,vi} from "vitest";
import {decodeAskEvent,streamPublicAsk,withAskCancellation,LegacyAskTransportOnlyError} from "./ask-sse-client";
import {readFileSync} from "node:fs";
describe("Ask progress-stream security and compatibility",()=>{
 it("strictly parses allowlisted named JSON events, no arbitrary event types",()=>{
  expect(decodeAskEvent('event: stage\ndata: {"stage":"researching"}'))
   .toEqual({event:"stage",payload:{stage:"researching"}});
  expect(decodeAskEvent('event: answer\ndata: {"ok":true}').event).toBe("answer");
  expect(()=>decodeAskEvent('event: system\ndata: {}')).toThrow("ASK_STREAM_EVENT_INVALID");
  expect(()=>decodeAskEvent('event: answer\ndata: bad')).toThrow();
 });
 it("only streams completed governed answers, preserving GET fallback",()=>{
  const route=readFileSync("server/api/ask/v2/turn.post.ts","utf8");
  const ui=readFileSync("src/components/ask/ask-workspace.tsx","utf8");
  const client=readFileSync("src/lib/ask-sse-client.ts","utf8");
  expect(route).toContain("executeHybridChatTurn");
  expect(route).toContain("prepareHybridAgentContext");
  expect(route).toContain('sameOrigin(origin,host)');
  expect(route).toContain('emit("answer"');
  expect(route).not.toContain("settleCoinbaseX402");
  expect(route).not.toContain("signRiskObject");
  expect(ui).toContain("streamPublicAsk(question, history, setResearchStage, controller.signal)");
  expect(ui).toContain("LegacyAskTransportOnlyError");
  expect(readFileSync("src/lib/ask-legacy-transport.ts","utf8")).toContain('fetch("/api/public-ask"');
  expect(client).toContain("MAX_EVENT_BYTES");
  expect(client).toContain("MAX_TOTAL_BYTES");
  expect(ui).not.toMatch(/localStorage|sessionStorage|indexedDB/);
 });
});

describe("Ask Geomacro reliable free public transport with old Lovable edge",()=>{
 afterEach(()=>vi.unstubAllGlobals());
 const ask=()=>streamPublicAsk("What is driving macro risk?",[]);
 it.each([404,405,501,502,503,504])(
   "falls back to existing same-origin GET only on HTTP %i API transport",async status=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response("",{status})));
    await expect(ask()).rejects.toBeInstanceOf(LegacyAskTransportOnlyError);
 });
 it("HTML 200 SPA rewrite is not mistaken for a real SSE answer",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response("<html>SPA</html>",{
   status:200,headers:{"content-type":"text/html; charset=UTF-8"}})));
  await expect(ask()).rejects.toBeInstanceOf(LegacyAskTransportOnlyError);
 });
 it.each([400,401,403,422,429])(
  "never falls back on security/rate-limit HTTP %i",async status=>{
   vi.stubGlobal("fetch",vi.fn(async()=>new Response("",{status})));
   await expect(ask()).rejects.not.toBeInstanceOf(LegacyAskTransportOnlyError);
 });
 it("does not fallback on SSE event:error or manufacture a current answer",async()=>{
   const s='event: stage\ndata: {"stage":"researching"}\n\n'+
     'event: error\ndata: {"ok":false,"error":{"code":"ASK_RATE_LIMITED","message":"Rate limited"}}\n\n';
   vi.stubGlobal("fetch",vi.fn(async()=>new Response(s,{headers:{"content-type":"text/event-stream"}})));
   await expect(ask()).rejects.toThrow("Rate limited");
 });
 it("incomplete SSE stream is a transport failure and uses safe legacy retry",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(
   'event: stage\ndata: {"stage":"researching"}\n\n',
   {headers:{"content-type":"text/event-stream"}})));
  await expect(ask()).rejects.toBeInstanceOf(LegacyAskTransportOnlyError);
 });
 it("bounded valid SSE answer still returns content",async()=>{
  const body={summary:"Verified sources did not establish a fresh event.",
   insufficient_evidence:true,evidence:[],what_changed:"No qualifying release",
   why_it_matters:"Do not infer zero risk.",geomacro_view:"Evidence limited"};
  const data='event: answer\ndata: '+JSON.stringify({ok:true,data:body,
     context:{resolved_question:"What is driving macro risk?"}})+'\n\n';
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(data,
   {headers:{"content-type":"text/event-stream; charset=utf-8"}})));
  const result=await ask();
  expect(result.answer.insufficient_evidence).toBe(true);
  expect(result.answer.summary).toBe(body.summary);
 });
});

describe("explicit cancellation",()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it("does not turn user Stop into a legacy retry",async()=>{
  const controller=new AbortController();
  vi.stubGlobal("fetch",vi.fn(async()=>{controller.abort();throw new DOMException("Stopped","AbortError");}));
  await expect(streamPublicAsk("Explain inflation",[],undefined,controller.signal))
    .rejects.not.toBeInstanceOf(LegacyAskTransportOnlyError);
 });
});

it("Stop settles independently of a buffering network proxy",async()=>{
 const c=new AbortController();
 const pending=withAskCancellation(new Promise<never>(()=>{}),c.signal);
 c.abort();await expect(pending).rejects.toMatchObject({name:"AbortError"});
});
