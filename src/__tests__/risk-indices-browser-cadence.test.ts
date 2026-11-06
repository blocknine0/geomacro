import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {
  RISK_INDICES_VISIBLE_REFRESH_MS,
  RISK_INDICES_UNAVAILABLE_REFRESH_MS,
  RISK_INDICES_REQUEST_TIMEOUT_MS,
  RISK_INDICES_VERIFIED_CACHE_MS,
  riskIndicesRefreshDelay,
  riskIndicesResumeDelay,
  riskIndicesSignedSourceRemainingMs,
} from "../lib/risk-indices-browser-cadence";

describe("GeoMacro public Risk Indices budget-aware browser reading",()=>{
 it("fixes 5m active, 10m unavailable, 8s timeout and 60s verified-only cache",()=>{
  expect(RISK_INDICES_VISIBLE_REFRESH_MS).toBe(300_000);
  expect(RISK_INDICES_UNAVAILABLE_REFRESH_MS).toBe(600_000);
  expect(RISK_INDICES_REQUEST_TIMEOUT_MS).toBe(8_000);
  expect(RISK_INDICES_VERIFIED_CACHE_MS).toBe(60_000);
  // Successful reads cannot be forced into a rapid poll by a rogue caller.
  expect(riskIndicesRefreshDelay(true,500)).toBe(300_000);
  expect(riskIndicesRefreshDelay(false,500)).toBe(600_000);
 });
 it("bounds corrupted timer inputs and permits only slower caller schedules",()=>{
  expect(riskIndicesRefreshDelay(true,NaN)).toBe(300_000);
  expect(riskIndicesRefreshDelay(false,-1)).toBe(600_000);
  expect(riskIndicesRefreshDelay(true,Infinity)).toBe(300_000);
  expect(riskIndicesRefreshDelay(true,900_000)).toBe(900_000);
  expect(riskIndicesRefreshDelay(false,900_000)).toBe(900_000);
  expect(riskIndicesRefreshDelay(true,99_999_999)).toBe(86_400_000);
 });
 it("reactivates only if visible-tab interval elapsed and resists clock rollback",()=>{
  const first=1_700_000_000_000;
  expect(riskIndicesResumeDelay(0,first,300_000)).toBe(0);
  expect(riskIndicesResumeDelay(first,first+60_000,300_000)).toBe(240_000);
  expect(riskIndicesResumeDelay(first,first+300_000,300_000)).toBe(0);
  expect(riskIndicesResumeDelay(first,first+3_600_000,600_000)).toBe(0);
  expect(riskIndicesResumeDelay(first,first-5_000,300_000)).toBe(300_000);
  expect(riskIndicesResumeDelay(first,NaN,300_000)).toBe(300_000);
 });
 it("expires real signed-source clocks before the next 5m/10m browser poll",()=>{
  const now=Date.parse("2026-11-06T17:00:00.000Z");
  const oneMinuteBeforeNow="2026-11-06T16:01:00.000Z";
  const recent="2026-11-06T16:55:00.000Z";
  expect(riskIndicesSignedSourceRemainingMs(recent,
    [oneMinuteBeforeNow,recent,recent],now)).toBe(60_000);
  expect(riskIndicesSignedSourceRemainingMs(recent,
    [oneMinuteBeforeNow,recent,recent],now+60_000)).toBe(0);
  expect(riskIndicesSignedSourceRemainingMs(recent,
    [null,recent,recent],now)).toBe(0);
  expect(riskIndicesSignedSourceRemainingMs(recent,
    [recent,recent],now)).toBe(0);
  expect(riskIndicesSignedSourceRemainingMs("2026-12-01T00:00:00.000Z",
    [recent,recent,recent],now)).toBe(0);
 });
 it("holds browser budget, coalescing, hidden-page pause and signed-source clock guards",()=>{
  const hook=readFileSync("src/lib/use-risk-indices.ts","utf8");
  const server=readFileSync("server/api/public/reviewed-risk-indices.get.ts","utf8");
  expect(hook).toContain("document.addEventListener(\"visibilitychange\", resumeVisibleBrowser)");
  expect(hook).toContain("window.addEventListener(\"focus\", resumeVisibleBrowser)");
  expect(hook).toContain('document.visibilityState === "hidden"');
  expect(hook).toContain("riskIndicesResumeDelay(lastStartedAt, Date.now(), nextCadenceMs)");
  expect(hook).toContain("riskIndicesRefreshDelay(false, refreshMs)");
  expect(hook).toContain("riskIndicesRefreshDelay(true, refreshMs)");
  expect(hook).toContain("function revokeExpiredCurrent()");
  expect(hook).toContain("riskIndicesSignedSourceRemainingMs(");
  expect(hook).toContain("const boundedDelay = sourceRemaining === null");
  expect(hook).toContain("const justExpired = revokeExpiredCurrent()");
  expect(hook).toContain("if (cancelled || inFlight || document.visibilityState === \"hidden\") return;");
  expect(hook).toContain("if (inFlightCertifiedRead) return inFlightCertifiedRead;");
  expect(hook).not.toContain("CERTIFIED_RETRY_DELAYS_MS");
  expect(hook).not.toContain("window.setInterval(");
  expect(hook).toContain("Date.now()-Date.parse(previous.snapshotAsOf)<=60*60000");
  expect(hook).toContain('body.meta?.authority!=="geomacro-reviewed-gri-ed25519-delivery"');
  expect(server).toContain("now-clock>60*60000");
  expect(server).toContain("Date.now()-clock>60*60000");
 });
});
