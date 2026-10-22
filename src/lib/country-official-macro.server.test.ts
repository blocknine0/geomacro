import {describe,it,expect,vi} from "vitest";
import {countryWdiQueryUrl,parseCountryWdiRows,readCountryOfficialMacro} from "./country-official-macro.server";
import {COUNTRIES_195} from "./canonical-country-registry-195";
const now=new Date("2026-10-22T12:00:00Z");
const sample=(rows:unknown[])=>[{page:1,pages:1,total:rows.length},rows];
const obs=(iso3:string,id:string,year:string,value:number|null)=>({
 countryiso3code:iso3,indicator:{id},date:year,value,
});
const INFLATION="FP.CPI.TOTL.ZG",GDP="NY.GDP.MKTP.KD.ZG";
describe("actual 195-country request-time World Bank reference observations",()=>{
 it("builds exact source-2 two-indicator one-request URLs for all 195 countries",()=>{
  for(const country of COUNTRIES_195){
   const url=new URL(countryWdiQueryUrl(country.iso3));
   expect(url.hostname).toBe("api.worldbank.org");
   expect(url.pathname).toContain(country.iso3.toLowerCase());
   expect(url.pathname).toContain("FP.CPI.TOTL.ZG;NY.GDP.MKTP.KD.ZG");
   expect(url.searchParams.get("source")).toBe("2");
   expect(url.searchParams.get("mrnev")).toBe("2");
   expect(url.searchParams.get("format")).toBe("json");
  }
  expect(()=>countryWdiQueryUrl("TWN")).toThrow();
  expect(()=>countryWdiQueryUrl("ZZZ")).toThrow();
 });
 it("accepts real scoped annual GDP/CPI, retains exact periods and derives percentage-point deltas",()=>{
  const rows=[obs("IND",INFLATION,"2025",4.2),
    obs("IND",INFLATION,"2024",5.1),
    obs("IND",GDP,"2025",6.7),
    obs("IND",GDP,"2024",6.5),
    obs("CHN",INFLATION,"2025",19.2),
    obs("IND",GDP,"2027",80),
    obs("IND",GDP,"2023",null)];
  const result=parseCountryWdiRows(sample(rows),"IND",now);
  expect(result.country_iso3).toBe("IND");
  expect(result.observations).toHaveLength(2);
  expect(result.observations[0].observation_period).toBe("2025");
  expect(result.observations[0].finding).toContain("4.2%");
  expect(result.observations[0].finding).toContain("-0.9 percentage points");
  expect(result.observations[1].finding).toContain("6.7%");
  expect(result.observations[1].finding).toContain("0.2 percentage points");
  expect(result.observations[0].clock_semantics).toBe("reference_year");
  expect(result.source_native_statistical_release_time_verified).toBe(false);
  expect(result.actual_current_macro_news_verified).toBe(false);
  expect(result.customer_chargeable).toBe(false);
  expect(JSON.stringify(result)).not.toContain("api.worldbank.org");
  expect(JSON.stringify(result)).not.toContain("https://");
 });
 it("leaves legitimate missing countries empty; no average or made-up zero",()=>{
  const empty=parseCountryWdiRows(sample([
   obs("PSE",INFLATION,"2025",null),obs("VAT",GDP,"2025",null)
  ]),"VAT",now);
  expect(empty.observations).toEqual([]);
  const wrong=parseCountryWdiRows(sample([obs("CHN",GDP,"2025",2.2)]),"IND",now);
  expect(wrong.observations).toEqual([]);
 });
 it("rejects pagination and conflicting same-year values",()=>{
  expect(()=>parseCountryWdiRows([{page:1,pages:2,total:2},
    [obs("IND",GDP,"2025",6.2)]],"IND",now)).toThrow("SCOPE_INVALID");
  expect(()=>parseCountryWdiRows(sample([
    obs("IND",GDP,"2025",6.2),obs("IND",GDP,"2025",6.3)
  ]),"IND",now)).toThrow("CONFLICTING_OFFICIAL_ROWS");
 });
 it("makes exactly one bounded fetch; never follows redirect or accepts 429",async()=>{
  const good=sample([obs("IND",GDP,"2025",6.7)]);
  const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{
    expect(init?.redirect).toBe("manual");
    return Response.json(good);
  }) as unknown as typeof fetch;
  const result=await readCountryOfficialMacro("IND",{now,fetchImpl:fetcher});
  expect(result.observations).toHaveLength(1);
  expect(vi.mocked(fetcher)).toHaveBeenCalledTimes(1);
  const denied=vi.fn(async()=>new Response("denied",{status:429})) as unknown as typeof fetch;
  await expect(readCountryOfficialMacro("IND",{now,fetchImpl:denied})).rejects.toThrow();
  expect(vi.mocked(denied)).toHaveBeenCalledTimes(1);
  const redirect=vi.fn(async()=>new Response(null,{status:302,
    headers:{Location:"https://example.net/"}})) as unknown as typeof fetch;
  await expect(readCountryOfficialMacro("IND",{now,fetchImpl:redirect})).rejects.toThrow();
  expect(vi.mocked(redirect)).toHaveBeenCalledTimes(1);
 });
});
