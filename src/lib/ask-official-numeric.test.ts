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
 it("uses the workerd-compatible no-redirect helper for WDI and ECB; blocks 3xx",async()=>{
  const guarded=vi.fn(async(url:string,init?:RequestInit)=>{
    if(init?.redirect==="error")throw TypeError("workerd rejects unsupported redirect:error");
    expect(init?.redirect).toBe("manual");
    if(new URL(url).origin==="https://api.worldbank.org")
      return new Response(wdi("IND","FP.CPI.TOTL.ZG"),{status:200});
    return new Response(csv("USD",1.2),{status:200});
  }) as unknown as typeof fetch;
  const wdiAnswer=await answerOfficialNumeric("India latest inflation rate?",{
    fetchImpl:guarded,noCache:true,now,
  });
  expect(wdiAnswer?.summary).toContain("4.187%");
  const fxAnswer=await answerOfficialNumeric("EUR/USD exchange rate",{
    fetchImpl:guarded,noCache:true,now,
  });
  expect(fxAnswer?.summary).toContain("1.2 USD");
  expect(vi.mocked(guarded).mock.calls).toHaveLength(2);
  const redirect=vi.fn(async()=>new Response(null,{
    status:302,headers:{Location:"https://example.com/unsafe"}
  })) as unknown as typeof fetch;
  const failures:string[]=[];
  const denied=await answerOfficialNumeric("India latest inflation rate?",{
    fetchImpl:redirect,noCache:true,now,onFailure:code=>failures.push(code)
  });
  expect(denied).toBeNull();
  expect(failures).toEqual(["ASK_OFFICIAL_NUMERIC_TRANSPORT_UNAVAILABLE"]);
  expect(vi.mocked(redirect)).toHaveBeenCalledTimes(1);
 });
 it("preserves source-private typed failure codes on official transport errors",async()=>{
  const classes:string[]=[];
  const blocked=vi.fn(async()=>new Response("rate limited",{status:429})) as unknown as typeof fetch;
  const result=await answerOfficialNumeric("India latest inflation rate?",{
    fetchImpl:blocked,noCache:true,now,onFailure:code=>classes.push(code)});
  expect(result).toBeNull();
  expect(classes).toEqual(["ASK_OFFICIAL_NUMERIC_HTTP_429"]);
  const unknown=vi.fn(async()=>{throw Error("Bearer secret should never appear here")}) as unknown as typeof fetch;
  const classes2:string[]=[];
  await answerOfficialNumeric("India latest inflation rate?",{
    fetchImpl:unknown,noCache:true,now,onFailure:code=>classes2.push(code)});
  expect(classes2).toEqual(["ASK_OFFICIAL_NUMERIC_TRANSPORT_UNAVAILABLE"]);
 });
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


describe("official numeric request-local publication windows and WDI timeout",()=>{
 it("passes a bounded 16s budget only to WDI, preserving 6s ECB and one call per source",async()=>{
  const observed:{hostname:string;timeoutIsAbortSignal:boolean}[]=[];
  const impl=vi.fn(async(url:string,init?:RequestInit)=>{
   observed.push({hostname:new URL(url).hostname,
    timeoutIsAbortSignal:init?.signal instanceof AbortSignal});
   if(url.includes("worldbank"))return new Response(wdi("IND","FP.CPI.TOTL.ZG"));
   return new Response(csv("USD",1.2));
  }) as unknown as typeof fetch;
  const w=await answerOfficialNumeric("India latest inflation rate?",{fetchImpl:impl,noCache:true,now});
  const fx=await answerOfficialNumeric("EUR/USD exchange rate",{fetchImpl:impl,noCache:true,now});
  expect(w?.summary).toContain("2025");
  expect(fx?.summary).toContain("1.2 USD");
  expect(observed).toHaveLength(2);
  expect(observed.every(x=>x.timeoutIsAbortSignal)).toBe(true);
 });
 it("does not accept a future official observation against the request-local clock",()=>{
  const year=JSON.parse(wdi("IND","FP.CPI.TOTL.ZG"));
  year[1][0].date="2027";
  expect(parseAnnualWdi(year,"IND","FP.CPI.TOTL.ZG",now)).toEqual([{year:"2024",value:5.22}]);
  const futureCsv=csv("USD",1.2,"2026-10-18");
  expect(parseEcbFix(futureCsv,"USD",now)).toEqual([]);
  expect(parseEcbFix(csv("USD",1.2,"2026-10-16"),"USD",now)).toHaveLength(1);
  expect(parseAnnualWdi(year,"IND","FP.CPI.TOTL.ZG",new Date("invalid"))).toEqual([]);
 });
 it("never retries an upstream 429 or forwards provider content to users",async()=>{
  let count=0;const codes:string[]=[];
  const x=await answerOfficialNumeric("India latest inflation rate?",{
   now,noCache:true,onFailure:code=>codes.push(code),fetchImpl:vi.fn(async()=>{count++;
    return new Response("secret data",{status:429});
   }) as unknown as typeof fetch
  });
  expect(x).toBeNull();
  expect(count).toBe(1);
  expect(codes).toEqual(["ASK_OFFICIAL_NUMERIC_HTTP_429"]);
 });
});
