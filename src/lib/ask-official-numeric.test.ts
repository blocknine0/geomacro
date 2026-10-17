import {describe,expect,it,vi} from "vitest";
import {answerOfficialNumeric,parseAnnualWdi,parseEcbFix,planAskOfficialNumeric} from "./ask-official-numeric.server";
const now=new Date("2026-10-17T12:00:00.000Z");
function fetchText(text:string):typeof fetch {
 return vi.fn(async()=>new Response(text,{status:200})) as unknown as typeof fetch;
}
const wdi=(country:string,series:string)=>JSON.stringify([{lastupdated:"2026-10-16"},[
  {countryiso3code:country,indicator:{id:series},date:"2025",value:4.187},
  {countryiso3code:country,indicator:{id:series},date:"2024",value:5.22},
]]);
const csv=(code:string,value:number,day="2026-10-16")=>
 "FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE\n"+
 "D,"+code+",EUR,SP00,A,"+day+","+value+"\n";
describe("official question-time numerical answers",()=>{
 it("requires an unambiguous country or explicit currency pair",()=>{
  expect(planAskOfficialNumeric("India latest inflation rate?")).toMatchObject({
   kind:"wdi",iso3:"IND",indicator:"FP.CPI.TOTL.ZG"});
  expect(planAskOfficialNumeric("China GDP growth latest?")).toMatchObject({kind:"wdi",iso3:"CHN"});
  expect(planAskOfficialNumeric("USD/INR exchange rate")).toEqual({kind:"fx",base:"USD",quote:"INR"});
  expect(planAskOfficialNumeric("India latest FX?")).toBeNull();
  expect(planAskOfficialNumeric("India and China latest CPI")).toBeNull();
  expect(planAskOfficialNumeric("Forecast USD/INR exchange rate")).toBeNull();
 });
 it("reads exact WDI source=2 annual period and rate without calling it monthly",async()=>{
  const impl=fetchText(wdi("IND","FP.CPI.TOTL.ZG"));
  const out=await answerOfficialNumeric("India latest inflation rate?",{fetchImpl:impl,noCache:true,now});
  expect(out?.summary).toContain("2025");
  expect(out?.summary).toContain("4.187%");
  expect(out?.what_changed).toContain("-1.033");
  expect(out?.why_it_matters).toContain("not today's/monthly CPI");
  expect(out?.geomacro_view).toContain("World Bank");
  expect(out?.gri).toBeNull();
  expect(JSON.stringify(out)).not.toContain("api.worldbank.org");
  expect(String(vi.mocked(impl).mock.calls[0][0])).toContain("source=2");
  expect(parseAnnualWdi(JSON.parse(wdi("CHN","FP.CPI.TOTL.ZG")),
    "IND","FP.CPI.TOTL.ZG")).toEqual([]);
 });
 it("derives ECB crosses from two official series with identical dates only",async()=>{
  const impl=vi.fn(async(url:string)=>new Response(
    url.includes("D.USD.")?csv("USD",1.2):csv("INR",100),{status:200})) as unknown as typeof fetch;
  const out=await answerOfficialNumeric("USD/INR exchange rate",{fetchImpl:impl,noCache:true,now});
  expect(out?.summary).toContain("83.333333");
  expect(out?.summary).toContain("2026-10-16");
  expect(out?.why_it_matters).toContain("not live executable FX prices");
  expect(parseEcbFix(csv("USD",1.2),"INR")).toEqual([]);
  const mismatch=vi.fn(async(url:string)=>new Response(
   url.includes("D.USD.")?csv("USD",1.2):csv("INR",100,"2026-10-15"),
   {status:200})) as unknown as typeof fetch;
  expect(await answerOfficialNumeric("USD/INR exchange rate",{
    fetchImpl:mismatch,noCache:true,now})).toBeNull();
 });
 it("fails closed on wrong country or transport 429; never hallucinates a number",async()=>{
  expect(await answerOfficialNumeric("India latest inflation rate?",{fetchImpl:fetchText(
    wdi("CHN","FP.CPI.TOTL.ZG")),noCache:true,now})).toBeNull();
  const bad=vi.fn(async()=>new Response("rate limited",{status:429})) as unknown as typeof fetch;
  expect(await answerOfficialNumeric("India latest inflation rate?",{
    fetchImpl:bad,noCache:true,now})).toBeNull();
 });
});
