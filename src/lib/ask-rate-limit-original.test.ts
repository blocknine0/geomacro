import {describe,it,expect} from "vitest";
import {checkAskOriginalBudget} from "./ask-rate-limit.server";
describe("public Ask original publisher free-tier request budget",()=>{
 it("holds each client to three per minute without allowing denied attempts",()=>{
  const t=Date.parse("2026-10-17T10:00:00Z");
  expect(checkAskOriginalBudget("live-budget-client-1",t)).toBe(true);
  expect(checkAskOriginalBudget("live-budget-client-1",t)).toBe(true);
  expect(checkAskOriginalBudget("live-budget-client-1",t)).toBe(true);
  expect(checkAskOriginalBudget("live-budget-client-1",t)).toBe(false);
  expect(checkAskOriginalBudget("live-budget-client-1",t+60001)).toBe(true);
 });
 it("rejects empty identifiers and invalid clocks",()=>{
  expect(checkAskOriginalBudget("",Date.now())).toBe(false);
  expect(checkAskOriginalBudget("client",Number.NaN)).toBe(false);
 });
});
