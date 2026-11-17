import {afterEach,describe,expect,it,vi} from "vitest";
vi.mock("./ask-answer.server",()=>({answerAskQuestion:vi.fn(()=>new Promise(()=>{}))}));
vi.mock("./ask-rate-limit.server",()=>({checkAskRateLimit:()=>true,checkAskOriginalBudget:()=>true}));
import {executeAskGeomacro} from "./ask-geomacro-core.server";
import {answerAskQuestion} from "./ask-answer.server";
afterEach(()=>vi.useRealTimers());
describe("bounded public research latency",()=>{
 it("returns an honest evidence gap before the browser stream expires",async()=>{
  vi.useFakeTimers();
  const result=executeAskGeomacro({question:"Latest macro news"},"deadline-test");
  await vi.advanceTimersByTimeAsync(14000);
  const answer=await result;
  expect(answer.insufficient_evidence).toBe(true);
  expect(answer.evidence).toEqual([]);
  expect(answer.summary).toContain("couldn't finish");
  expect(answer.gri).toBeNull();
 });
 it("returns a complete safe answer instead of propagating a retrieval failure as HTTP 500",async()=>{
  vi.mocked(answerAskQuestion).mockRejectedValueOnce(new Error("private provider detail"));
  const answer=await executeAskGeomacro({question:"Explain geopolitical risk outage 741"},"failure-test");
  expect(answer.insufficient_evidence).toBe(true);
  expect(answer.summary).toContain("couldn't complete a verified Geopolitics answer");
  expect(JSON.stringify(answer)).not.toContain("private provider detail");
  expect(answer.source_identity_exposed).toBe(false);
 });
});
