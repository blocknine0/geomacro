import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195";
import {countryForThisRun} from "./prepare-first-original-signing-input";

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
