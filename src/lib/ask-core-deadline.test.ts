import {afterEach,describe,expect,it,vi} from "vitest";
vi.mock("./ask-answer.server",()=>({answerAskQuestion:vi.fn(()=>new Promise(()=>{}))}));
vi.mock("./ask-rate-limit.server",()=>({checkAskRateLimit:()=>true,checkAskOriginalBudget:()=>true}));
import {executeAskGeomacro} from "./ask-geomacro-core.server";
afterEach(()=>vi.useRealTimers());
describe("bounded public research latency",()=>{
 it("returns an honest evidence gap before the browser stream expires",async()=>{
  vi.useFakeTimers();
  const result=executeAskGeomacro({question:"Latest macro news"},"deadline-test");
  await vi.advanceTimersByTimeAsync(14000);
  const answer=await result;
  expect(answer.insufficient_evidence).toBe(true);
  expect(answer.evidence).toEqual([]);
  expect(answer.summary).toContain("took too long");
  expect(answer.gri).toBeNull();
 });
});
