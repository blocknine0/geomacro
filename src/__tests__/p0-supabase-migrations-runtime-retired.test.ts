import { describe,expect,it } from "vitest";
import {readFileSync} from "node:fs";
const jobs={
  "apply-ucdp-production-migrations.yml":["migrate"],
  "apply-risk-gate-production-migrations.yml":["migrate"],
  "deploy-telegram-signal-supabase.yml":["keepalive","deploy"],
  "historical-supabase-keepalive.yml":["keepalive"],
  "sync-source-secrets-to-supabase.yml":["sync"],
  "private-supabase-runtime-audit.yml":["audit"],
  "global-realtime-source-proof.yml":["exact-head-production-realtime-acceptance"],
};
const read=(path:string)=>readFileSync(path,"utf8");
describe("Supabase-free P0: legacy migrations, signal deployment and private auditor frozen",()=>{
 for(const [file,ids] of Object.entries(jobs))it(file+" has no reachable Supabase runtime",()=>{
   const flow=read(".github/workflows/"+file);
   for(const id of ids){
     const start=flow.indexOf("  "+id+":\n");
     expect(start).toBeGreaterThan(-1);
     const body=flow.slice(start,start+250);
     expect(body).toContain("    if: ${{ false }}");
   }
 });
 it("retains original-source public PR tests and reviewed signed D1 publishers",()=>{
  const proof=read(".github/workflows/global-realtime-source-proof.yml");
  expect(proof).toContain("  official-native-rss-live-proof:");
  expect(proof).toContain("  proof:");
  const source=read(".github/workflows/three-domain-30m-original-publisher-pulse.yml");
  expect(source).toContain("  original-publisher-pulse:");
  const gri=read(".github/workflows/gri-v12-supabase-free-reviewed-current.yml");
  const idx=read(".github/workflows/risk-indices-verified-d1-parent.yml");
  expect(gri).toContain("publish-supabase-free-global-risk.mjs --verified-current");
  expect(idx).toContain("publish-risk-indices-from-verified-global-risk.mjs --verified-d1-parent-only");
 });
});
