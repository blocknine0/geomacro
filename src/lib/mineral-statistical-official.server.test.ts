import {describe,expect,it,vi} from "vitest";
import {fetchOfficialMineralStatisticalObservations} from "./mineral-statistical-official.server";
const catalog={results:[{reporterCodeIsoAlpha3:"CHL",reporterCode:152,isGroup:false}]};
const mock=(row:Record<string,unknown>|null)=>(async(url:RequestInfo|URL)=>{
 const u=String(url);
 if(u.includes("sciencebase.gov"))return new Response("unavailable",{status:404});
 if(u.includes("Reporters.json"))return Response.json(catalog);
 if(u.includes("/preview/C/A/HS")){
  const qs=new URL(u).searchParams;
  if(qs.get("flowCode")==="M")return Response.json({data:[]});
  if(!row)return Response.json({data:[]});
  return Response.json({data:[row]});
 }
 throw Error("UNEXPECTED_EXTERNAL_URL");
}) as typeof fetch;
describe("real official mineral reference fetch and source validation",()=>{
 const when=new Date("2026-10-31T12:00:00Z");
 it("queries only pinned official providers with exact reporter, commodity and year",async()=>{
  const f=vi.fn(mock({reporterCode:152,period:2025,cmdCode:"260300",flowCode:"X",partnerCode:0,primaryValue:7500}));
  const r=await fetchOfficialMineralStatisticalObservations({country_iso3:"CHL",mineral:"copper",now:when,fetchImpl:f});
  expect(r).toMatchObject([{source:"UN_COMTRADE",country_iso3:"CHL",commodity:"copper",
   reference_year:2025,metric:"EXPORT_VALUE",value:7500,unit:"usd"}]);
  expect(f.mock.calls.length).toBe(5);
  expect(f.mock.calls.every(([u])=>new URL(String(u)).protocol==="https:")).toBe(true);
 });
 it("never fills missing preview rows with zero or fabricated import reliance",async()=>{
  const r=await fetchOfficialMineralStatisticalObservations({
   country_iso3:"CHL",mineral:"copper",now:when,fetchImpl:mock(null)});
  expect(r).toEqual([]);
 });
 it("rejects mismatched UN Comtrade row country, commodity, period or flow",async()=>{
  const r=await fetchOfficialMineralStatisticalObservations({
   country_iso3:"CHL",mineral:"copper",now:when,
   fetchImpl:mock({reporterCode:999,period:2025,cmdCode:"260300",flowCode:"X",partnerCode:0,primaryValue:800})});
  expect(r).toEqual([]);
 });
 it("does not make any network call for unrecognized country or mineral",async()=>{
  const f=vi.fn(mock(null));
  expect(await fetchOfficialMineralStatisticalObservations({country_iso3:"ZZZ",mineral:"copper",fetchImpl:f})).toEqual([]);
  expect(await fetchOfficialMineralStatisticalObservations({country_iso3:"USA",mineral:"random text",fetchImpl:f})).toEqual([]);
  expect(f).not.toHaveBeenCalled();
 });
});
