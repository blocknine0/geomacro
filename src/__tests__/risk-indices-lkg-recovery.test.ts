import {afterEach,describe,expect,it,vi} from "vitest";
import {readRiskIndicesEdge} from "../lib/risk-indices-edge.server";

const START=Date.parse("2026-11-11T12:00:00.000Z");
const asOf=new Date(START).toISOString();
function snapshot(){
 const series={"7D":{buckets:[{},{},{}]},"30D":{buckets:[{},{},{}]}};
 const indices=["geopolitics","macro","critical_minerals"].map(key=>({
  key,status:"available",readingStatus:"current",readingAsOf:asOf,
  score:45,series
 }));
 return {
  schema:"geomacro.public-risk-indices-live.v1",
  source_project:"ldpwajisioljyjtojvfx",generated_at:asOf,
  data:{contractVersion:"risk-indices-v1.1.0",
   parentMethodologyVersion:"gri-v1.2.0",
   verificationStatus:"verified",snapshotAsOf:asOf,indices}
 };
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()});
describe("Risk Indices source-clock-safe last-known-good",()=>{
 it("serves complete three-domain verified edge package, reuses it for 503, rejects expired",async()=>{
  vi.useFakeTimers();vi.setSystemTime(START);
  const good=()=>new Response(JSON.stringify(snapshot()),{status:200,
   headers:{"x-geomacro-authority":"backblaze-b2-risk-indices-edge"}});
  const fetch=vi.fn().mockImplementationOnce(good)
   .mockImplementation(()=>new Response("unavailable",{status:503}));
  vi.stubGlobal("fetch",fetch);
  const original=await readRiskIndicesEdge();
  expect(original?.indices.map(x=>x.key)).toEqual([
   "geopolitics","macro","critical_minerals"]);
  expect(original?.indices.every(x=>x.series["7D"].buckets.length>=2&&
   x.series["30D"].buckets.length>=2)).toBe(true);
  vi.setSystemTime(START+20_000);
  expect(await readRiskIndicesEdge()).toBe(original);
  expect(fetch).toHaveBeenCalledTimes(2);
  vi.setSystemTime(START+60*60_000+1);
  expect(await readRiskIndicesEdge()).toBeNull();
 });
});
