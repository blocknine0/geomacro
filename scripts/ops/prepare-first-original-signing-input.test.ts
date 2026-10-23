import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195";
import {countryForThisRun,requireProtectedOriginalArchiveMain,privateOriginalBudgetedFetch,ORIGINAL_REVIEW_GET_BUDGET} from "./prepare-first-original-signing-input";

describe("protected original private B2 archive dispatch context",()=>{
 const approved={
  GITHUB_ACTIONS:"true",
  GITHUB_REPOSITORY:"blocknine0/geomacro",
  GITHUB_REF:"refs/heads/main",
  GITHUB_RUN_ID:"39988425120",
  B2_ACCOUNT_QUOTA_REQUIRED:"1",
  B2_ACCOUNT_QUOTA_WORKFLOW_ID:"original_review_leads",
  B2_REQUEST_BUDGET:"6",
 };
 it("accepts numeric real GitHub Actions run IDs after private lead archival wiring",()=>{
  expect(requireProtectedOriginalArchiveMain(approved)).toBe(true);
  expect(requireProtectedOriginalArchiveMain({...approved,GITHUB_RUN_ID:"1"})).toBe(true);
 });
 it("fails closed for nonnumeric, missing, foreign, PR or ungoverned dispatch",()=>{
  for(const bad of [
   {GITHUB_RUN_ID:""},
   {GITHUB_RUN_ID:"not-a-number"},
   {GITHUB_RUN_ID:"123\\d"},
   {GITHUB_ACTIONS:"false"},
   {GITHUB_REPOSITORY:"other/other"},
   {GITHUB_REF:"refs/pull/1/merge"},
   {B2_REQUEST_BUDGET:"99"},
   {B2_ACCOUNT_QUOTA_REQUIRED:"0"},
  ]){
   expect(()=>requireProtectedOriginalArchiveMain({...approved,...bad}))
    .toThrow("PRIVATE_ORIGINAL_ARCHIVE_PROTECTED_MAIN_ONLY");
  }
 });
});

describe("bounded genuine original review scheduler",()=>{
 it("keeps Bun shebang at byte zero before any import",()=>{
   const s=readFileSync("scripts/ops/prepare-first-original-signing-input.ts","utf8");
   expect(s.startsWith("#!/usr/bin/env bun\n")).toBe(true);
   expect(s.slice(2).includes("#!/usr/bin/env bun")).toBe(false);
 });
 it("samples four DIFFERENT 195-canonical ISO3s on the four existing daily slots",()=>{
   const slots=[2,8,14,20].map(h=>countryForThisRun(new Date(Date.UTC(2026,9,22,h,17))));
   expect(new Set(slots).size).toBe(4);
   expect(slots.every(x=>COUNTRIES_195.some(c=>c.iso3===x))).toBe(true);
 });
 it("covers all 195 unique countries across 195 consecutive six-hour slots without 3-country hardcoding",()=>{
   const start=Date.UTC(2026,9,22,2,0,0),seen=[];
   for(let n=0;n<195;n++)seen.push(countryForThisRun(new Date(start+n*6*3_600_000)));
   expect(new Set(seen).size).toBe(195);
   expect(new Set(seen).has("VAT")).toBe(true);
   expect(new Set(seen).has("PSE")).toBe(true);
   expect(seen.every(x=>COUNTRIES_195.some(c=>c.iso3===x))).toBe(true);
   expect(countryForThisRun(new Date(start+195*6*3_600_000))).toBe(seen[0]);
 });
 it("keeps exact selected ISO3 stable within delayed 6h cron windows",()=>{
   const a=countryForThisRun(new Date("2026-10-22T02:00:00Z"));
   const b=countryForThisRun(new Date("2026-10-22T07:59:59Z"));
   expect(a).toBe(b);
   expect(countryForThisRun(new Date("2026-10-22T08:00:00Z"))).not.toBe(a);
   expect(()=>countryForThisRun(new Date("invalid"))).toThrow();
 });
});

describe("three-domain first-party network capacity",()=>{
 it("admits HTML plus precise issuer API per category in both stages, with a strict 24 GET total",async()=>{
  let actual=0;
  const network=privateOriginalBudgetedFetch(async()=>{actual++;return new Response("fixture");});
  for(const phase of ["discovery","page","bytes"] as const){
   const fetchPhase=network.forPhase(phase);
   for(let i=0;i<ORIGINAL_REVIEW_GET_BUDGET[phase];i++)
    await fetchPhase("https://example.invalid/fixture",{method:"GET",redirect:"error"});
   await expect(fetchPhase("https://example.invalid/overflow",{redirect:"manual"})).rejects.toThrow(/BUDGET_EXCEEDED/);
  }
  expect(network.counts()).toEqual({discovery:12,page:6,bytes:6});
  expect(actual).toBe(24);
  const snapshot=network.counts();snapshot.bytes=0;
  expect(network.counts().bytes).toBe(6);
 });
 it("rejects unsafe transport before making or counting any request",async()=>{
  let actual=0;const network=privateOriginalBudgetedFetch(async()=>{actual++;return new Response();});
  for(const [url,init] of [["http://example.invalid",{redirect:"error"}],
   ["https://user:password@example.invalid",{redirect:"error"}],
   ["https://example.invalid",{method:"POST",redirect:"error"}],
   ["https://example.invalid",{redirect:"follow"}]] as const)
   await expect(network.forPhase("page")(url,init)).rejects.toThrow(/SOURCE_REQUEST_INVALID/);
  expect(actual).toBe(0);expect(network.counts()).toEqual({discovery:0,page:0,bytes:0});
 });
 it("uses canonical current direct publisher discovery and three-domain capacity without new authority",()=>{
  const code=readFileSync("scripts/ops/prepare-first-original-signing-input.ts","utf8");
  expect(code).toContain("await discoverDirectPublisherForPrivateQualification({");
  expect(code).toContain("maxProbes:3");expect(code).toContain("maxRereads:3");
  expect(code).toContain('receipt.signed_machine_input_created!==false');
  expect(code).toContain('receipt.article_specific_commercial_rights_verified!==false');
 });
});
