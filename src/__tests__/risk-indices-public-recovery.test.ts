import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {GRI_CURRENT_READING_WINDOW_HOURS} from "../lib/gri-current-contract";
import {ageVerifiedRiskIndices,verifiedRiskIndicesShape} from "../lib/risk-indices-public-validation";
import {summarizePublicRiskResearch} from "../lib/risk-indices-public-research";
import type {PublicRiskIndices,PublicRiskIndex} from "../lib/risk-indices.types";

const now=Date.parse("2026-10-28T14:00:00Z");
const asOf=new Date(now-2*3600_000).toISOString();
const series={
 "24H":{timeframe:"24H" as const,buckets:null,low:null,high:null},
 "7D":{timeframe:"7D" as const,buckets:null,low:null,high:null},
 "30D":{timeframe:"30D" as const,buckets:null,low:null,high:null}
};
function category(key:PublicRiskIndex["key"],valid=true):PublicRiskIndex{
 const sourceCategory=key==="critical_minerals"?"rare_earth":key;
 return {key,name:key,sourceCategory,status:valid?"available":"unavailable",
  readingStatus:valid?"current":"last_verified",
  readingSnapshotId:valid?"signed-001":null,readingAsOf:valid?asOf:null,
  readingAgeHours:valid?2:null,score:valid?64:null,rawScore:valid?64:null,
  previousScore:null,changePoints:null,confidence:null,
  eventCount:valid?3:0,sourceCount:valid?2:0,independentStoryCount:valid?2:0,
  series,topEvent:null};
}
function packageOf(indices:PublicRiskIndex[]):PublicRiskIndices{
 return {contractVersion:"risk-indices-v1.1.0",
  parentMethodologyVersion:"gri-v1.2.0",proofVersion:"gri-proof-v1.2.0",
  proofScope:"verified-category-projection",snapshotId:"signed-001",
  snapshotAsOf:asOf,verificationStatus:"verified",proofHash:"a".repeat(64),
  evidenceHash:"b".repeat(64),calculationHash:"c".repeat(64),
  dispositionHash:"d".repeat(64),inputHash:"e".repeat(64),
  methodologyHash:"f".repeat(64),changeHash:null,candidateEventCount:3,
  reconciliationResidual:0,changeResidual:0,indices};
}
const some=()=>packageOf([category("geopolitics"),category("macro",false),category("critical_minerals",false)]);
describe("partial public Risk Indices must not turn private scores into GRI",()=>{
 it("preserves an independently certified geopolitical domain even when two domain scores and histories are missing",()=>{
  expect(verifiedRiskIndicesShape(some(),now)).toBe(true);
  expect(verifiedRiskIndicesShape(packageOf([
   category("geopolitics",false),category("macro",false),category("critical_minerals",false)]),now)).toBe(true);
 });
 it("rejects a forged zero, duplicate category, missing publication clock or non-certified private score",()=>{
  const falsified=some();
  falsified.indices[1].score=0;
  expect(verifiedRiskIndicesShape(falsified,now)).toBe(false);
  const duplicate=some();
  duplicate.indices[1]={...duplicate.indices[0]};
  expect(verifiedRiskIndicesShape(duplicate,now)).toBe(false);
  const wrong=some();wrong.proofHash="not-a-real-proof";
  expect(verifiedRiskIndicesShape(wrong,now)).toBe(false);
  const privateScore={...some(),verificationStatus:"internally_scored"} as unknown as PublicRiskIndices;
  expect(verifiedRiskIndicesShape(privateScore,now)).toBe(false);
 });
 it("never upgrades historical to current and expires cached current values after six hours",()=>{
  const v=some();
  expect(ageVerifiedRiskIndices(v,now).indices[0].readingStatus).toBe("current");
  const old=ageVerifiedRiskIndices(v,now+(GRI_CURRENT_READING_WINDOW_HOURS+1)*3600_000);
  expect(old.indices[0].readingStatus).toBe("last_verified");
  expect(old.indices[0].readingAsOf).toBe(asOf);
  expect(old.indices[1].score).toBe(null);
  const historical=some();historical.indices[0].readingStatus="last_verified";
  expect(ageVerifiedRiskIndices(historical,now).indices[0].readingStatus).toBe("last_verified");
 });
});
describe("public research context only",()=>{
 const observed=(category:string,id:string,status:string,minutes:number)=>({
  id,category,status,published_at:new Date(now-minutes*60_000).toISOString()
 });
 it("counts only genuine public Finds with source-native 72h clock, never feed candidates or private scores",()=>{
  const rows=summarizePublicRiskResearch([
   observed("geopolitics","geopolitics-12345678","official_release_observed_unscored",30),
   observed("geopolitics","geopolitics-12345678","official_release_observed_unscored",30),
   observed("macro","macro-12345678","official_feed_candidate_unscored",20),
   observed("rare_earth","rare_earth-12345678","official_release_observed_unscored",100),
   observed("macro","macro-87654321","official_release_observed_unscored",80*60),
  ] as any,now);
  expect(rows.map(r=>r.count)).toEqual([1,0,1]);
  expect(rows[1].lastNativePublishedAt).toBe(null);
 });
 it("does not interpret unknown source read failure as zero; UI keeps boundaries without private endpoint",()=>{
  const workspace=readFileSync("src/components/risk-indices/risk-indices-workspace.tsx","utf8");
  const hook=readFileSync("src/lib/use-public-risk-research-activity.ts","utf8");
  expect(workspace).toContain("No recent qualifying public Finds; not a zero-risk reading");
  expect(workspace).toContain("Certified numerical reading unavailable");
  expect(workspace).toContain("PublicResearchActivityPanel");
  expect(hook).toContain('status:"unavailable",rows:null');
  expect(hook).toContain("fetchDirectDerivedNews");
  for(const p of [workspace,hook])for(const forbidden of [
   "/v1/internal/signed-news-scores","GEOMACRO_COMMERCE_LEDGER_TOKEN",
   "PREDGE_RISK_GATE_TOKEN","RISK_OBJECT_SIGNING_PRIVATE_KEY"])
   expect(p).not.toContain(forbidden);
 });
});
