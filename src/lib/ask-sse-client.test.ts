import {describe,expect,it} from "vitest";
import {decodeAskEvent} from "./ask-sse-client";
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
  expect(ui).toContain("streamPublicAsk(question, history, setResearchStage)");
  expect(ui).toContain("LegacyAskTransportOnlyError");
  expect(readFileSync("src/lib/ask-legacy-transport.ts","utf8")).toContain('fetch("/api/public-ask"');
  expect(client).toContain("MAX_EVENT_BYTES");
  expect(client).toContain("MAX_TOTAL_BYTES");
  expect(ui).not.toMatch(/localStorage|sessionStorage|indexedDB/);
 });
});
