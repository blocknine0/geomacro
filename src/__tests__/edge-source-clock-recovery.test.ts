import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {
 originalSourceIsCurrent,intelligenceOriginalSourceTime,validatedCachedLiveResponse,
} from "../../workers/shared/current-source-clock.mjs";
import {assessExistingIndicesBeforeCodeDeploy} from "../../scripts/ops/assess-risk-indices-code-deploy.mjs";

const NOW=Date.parse("2026-10-17T14:00:00Z");
const iso=(minutesAgo:number)=>new Date(NOW-minutesAgo*60_000).toISOString();
const domains=["geopolitics","macro","critical_minerals"];
function payload(kind:string,age=15){
 if(kind==="intelligence")return {schema:"geomacro.public-intelligence-live.v1",
  source_project:"ldpwajisioljyjtojvfx",rows:["geopolitics","macro","rare_earth"].map(
   category=>({category,public_status:"verified_b2",published_at:iso(age)}))};
 return {
  schema:kind==="global-risk"?"geomacro.public-global-risk-live.v1":"geomacro.public-risk-indices-live.v1",
  source_project:"ldpwajisioljyjtojvfx",
  data:{verificationStatus:"verified",snapshotAsOf:iso(age),indices:domains.map(key=>({key,status:"available"}))},
 };
}
function cache(kind:string,age:number,originalHeader=iso(age),authenticated=true){
 const headers:Record<string,string>={"x-geomacro-source-as-of":originalHeader};
 if(authenticated)headers["x-geomacro-continuity"]="d1-b2-readback-verified-hot-snapshot";
 return Response.json(payload(kind,age),{headers});
}
describe("real original-source freshness across B2, POP cache and deployments",()=>{
 it("allows only 60m original clocks, never a generated or redeploy time",()=>{
  expect(originalSourceIsCurrent(iso(60),NOW)).toBe(true);
  expect(originalSourceIsCurrent(iso(61),NOW)).toBe(false);
  expect(originalSourceIsCurrent(iso(120),NOW)).toBe(false);
  expect(originalSourceIsCurrent(iso(-6),NOW)).toBe(false);
  expect(originalSourceIsCurrent(null,NOW)).toBe(false);
 });
 it("rejects cached 200 stale or unverifiable even where B2 hash was historically valid",async()=>{
  for(const product of ["intelligence","global-risk","risk-indices"]){
   expect(await validatedCachedLiveResponse(cache(product,15),product,NOW)).not.toBeNull();
   expect(await validatedCachedLiveResponse(cache(product,75),product,NOW)).toBeNull();
   expect(await validatedCachedLiveResponse(cache(product,15,iso(15),false),product,NOW)).toBeNull();
   expect(await validatedCachedLiveResponse(cache(product,15,iso(14)),product,NOW)).toBeNull();
   expect(await validatedCachedLiveResponse(cache(product,15,iso(15),true),product,NaN)).toBeNull();
  }
 });
 it("uses exact independently scored originals rather than overlay-only rows",()=>{
  const rows=[
    {published_at:iso(20),public_status:"verified_b2"},
    {published_at:iso(3),public_status:"live_observed"},
    {published_at:iso(15),public_status:"verified_b2"},
  ];
  expect(intelligenceOriginalSourceTime(rows)).toBe(iso(15));
  expect(intelligenceOriginalSourceTime([{published_at:iso(5),public_status:"live_observed"}])).toBeNull();
 });
 it("will not overwrite a genuinely fresh verified indices continuity bundle",()=>{
  const body=payload("risk-indices",25);
  const headers="x-geomacro-continuity: github-actions-b2-readback-verified\r\nx-geomacro-source-as-of: "+iso(25);
  expect(assessExistingIndicesBeforeCodeDeploy({status:200,headers,body,now:NOW}).decision)
    .toBe("PRESERVE_VERIFIED_CURRENT_EDGE");
 });
 it("unblocks code-only remediation if legacy 200 is stale, unsupported or has no B2 proof",()=>{
  for(const [age,auth] of [[75,true],[25,false]] as const){
   const headers=auth?"x-geomacro-continuity: github-actions-b2-readback-verified":"";
   expect(assessExistingIndicesBeforeCodeDeploy({
     status:200,headers,body:payload("risk-indices",age),now:NOW,
   }).decision).toBe("SAFE_CODE_ONLY_NULL_CONTINUITY");
  }
  expect(assessExistingIndicesBeforeCodeDeploy({status:503,now:NOW}).decision)
    .toBe("SAFE_CODE_ONLY_NULL_CONTINUITY");
 });
 it("never grants chargeability, source-clock renewal or fake data in Worker code",()=>{
  for(const product of ["intelligence","global-risk","risk-indices"]){
   const worker=readFileSync("workers/"+product+"-edge/src/index.mjs","utf8");
   expect(worker).toContain("originalSourceIsCurrent");
   expect(worker).toContain("validatedCachedLiveResponse");
   expect(worker).toContain('x-geomacro-source-as-of');
  }
  const workflow=readFileSync(".github/workflows/deploy-risk-indices-edge.yml","utf8");
  expect(workflow).toContain("assess-risk-indices-code-deploy.mjs");
  expect(workflow).toContain("SAFE_CODE_ONLY_NULL_CONTINUITY");
  expect(workflow).toContain("PRESERVE_VERIFIED_CURRENT_EDGE");
  expect(workflow).toContain("Require verified package through Risk Indices edge");
  expect(workflow).not.toContain("x402_payment_authorized: true");
 });
});
