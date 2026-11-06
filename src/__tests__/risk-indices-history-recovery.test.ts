import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {validateHistoricalRiskIndices} from "../lib/risk-indices-edge.server";
import type {PublicRiskIndices} from "../lib/risk-indices.types";

const observed="2026-10-08T14:00:00.000Z";
const generated="2026-10-08T14:05:00.000Z";
const now=Date.parse("2026-11-06T15:00:00.000Z");
function record():PublicRiskIndices{
 const categories=[
  ["geopolitics","geopolitics"],["macro","macro"],
  ["critical_minerals","rare_earth"]
 ] as const;
 const indices=categories.map(([key,sourceCategory])=>({
  key,name:key,sourceCategory,status:"available" as const,
  readingStatus:"current" as const,score:63,
  readingAsOf:observed,
  series:{"7D":{buckets:[{t:1,avg:60,count:1},{t:2,avg:62,count:1}]},
   "30D":{buckets:[{t:1,avg:60,count:1},{t:2,avg:62,count:1}]}},
 }));
 return {
  contractVersion:"risk-indices-v1.1.0",
  parentMethodologyVersion:"gri-v1.2.0",verificationStatus:"verified",
  proofScope:"verified-category-projection",
  snapshotAsOf:observed,indices,
  proofHash:"a".repeat(64),inputHash:"b".repeat(64),
  calculationHash:"c".repeat(64),
 } as unknown as PublicRiskIndices;
}
describe("historical GRI display is separate from current certified publication",()=>{
 it("accepts a genuinely dated old archive as historical, without source-date rewriting",()=>{
  const r=record();
  expect(validateHistoricalRiskIndices(r,generated,now)).toBe(true);
  expect(r.snapshotAsOf).toBe(observed);
  expect(r.indices.every(i=>i.readingAsOf===observed)).toBe(true);
 });
 it("fails closed for future/relabelled/non-numeric/false-verified archive",()=>{
  const base=record();
  expect(validateHistoricalRiskIndices({...base,proofHash:"invalid"},generated,now)).toBe(false);
  expect(validateHistoricalRiskIndices({...base,verificationStatus:"not-verified" as "verified"},generated,now)).toBe(false);
  expect(validateHistoricalRiskIndices({...base,indices:base.indices.map((x,i)=>i===0?{...x,score:null}:x)},generated,now)).toBe(false);
  expect(validateHistoricalRiskIndices({...base,indices:base.indices.map((x,i)=>i===0?{...x,readingAsOf:"2026-12-01T00:00:00Z"}:x)},generated,now)).toBe(false);
  expect(validateHistoricalRiskIndices(base,"2026-12-01T00:00:00Z",now)).toBe(false);
 });
 it("the original live route, source clocks, certification and billing remain protected",()=>{
  const edge=readFileSync("workers/risk-indices-edge/src/index.mjs","utf8");
  const server=readFileSync("src/lib/risk-indices-edge.server.ts","utf8");
  const api=readFileSync("server/api/public/risk-indices-history.get.ts","utf8");
  const view=readFileSync("src/components/risk-indices/verified-historical-indices.tsx","utf8");
  const original=readFileSync("src/lib/use-risk-indices.ts","utf8");
  expect(edge).toContain('url.pathname !== "/risk-indices"');
  expect(edge).toContain('url.pathname==="/risk-indices/history"');
  expect(edge).toContain("proof?.compressed_sha256!==digest");
  expect(edge).toContain("proof?.full_b2_readback_verified!==true");
  expect(edge).toContain("validatedHistoricalPayload(live)");
  expect(edge).toContain('!originalSourceIsCurrent(data?.snapshotAsOf)');
  expect(server).toContain('mode==="historical"?EDGE_URL+"/history":EDGE_URL');
  expect(api).toContain('readRiskIndicesEdge("historical")');
  expect(api).toContain("customer_chargeable:false");
  expect(view).toContain("Last verified historical snapshot — not live");
  expect(view).toContain("Current certification is unavailable.");
  expect(original).toContain("const pending = readCurrentReviewedSignedIndices().then(data => {");
  expect(original).not.toContain("VERIFIED_HISTORICAL_RISK_INDICES_APP_URL");
 });
});
