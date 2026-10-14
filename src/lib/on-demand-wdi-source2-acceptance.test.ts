import { describe,it,expect } from "vitest";
import { readPinnedWdiAnnualStructuralPair } from "./on-demand-global-discovery.server";

const now=new Date("2026-10-13T20:00:00Z");
function official(sourceid="2",rows?:unknown[]){
  const observations=rows??[
    {date:"2025",value:0.0595646916565402,countryiso3code:"CHN",
      indicator:{id:"FP.CPI.TOTL.ZG"}},
    {date:"2024",value:0.218128938439177,countryiso3code:"CHN",
      indicator:{id:"FP.CPI.TOTL.ZG"}},
  ];
  const requested:string[]=[];
  const fetchImpl:typeof fetch=async(url)=>{
    requested.push(String(url));
    return new Response(JSON.stringify([{sourceid,lastupdated:"2026-10-08"},observations]),
      {status:200,headers:{"content-type":"application/json"}});
  };
  return {fetchImpl,requested};
}
describe("existing live WDI adapter source=2 strict acceptance — mocked fixtures",()=>{
  it("pins source=2 and retains original metadata/fact fingerprint",async()=>{
    const f=official();
    const result=await readPinnedWdiAnnualStructuralPair("CHN","FP.CPI.TOTL.ZG",{fetchImpl:f.fetchImpl,now});
    expect(f.requested).toHaveLength(1);
    expect(new URL(f.requested[0]).searchParams.get("source")).toBe("2");
    expect(result.status).toBe("VALID_ANNUAL_CHANGE");
    expect(result.source_api_id).toBe("2");
    expect(result.lastupdated).toBe("2026-10-08");
    expect(result.pair?.latest_observation_year).toBe(2025);
    expect(result.pair?.annual_rate_change_percentage_points).toBe(-0.15856);
    expect(result.pair?.source_observation_sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rejects source=3009 catalogue metadata rather than borrowing WDI rights",async()=>{
    const f=official("3009");
    const result=await readPinnedWdiAnnualStructuralPair("CHN","FP.CPI.TOTL.ZG",{fetchImpl:f.fetchImpl,now});
    expect(result.pair).toBe(null);
    expect(result.source_api_id).toBe(null);
  });
  it("rejects wrong-country values and non-consecutive periods",async()=>{
    const f=official("2",[{date:"2025",value:1,countryiso3code:"IND",
      indicator:{id:"FP.CPI.TOTL.ZG"}}]);
    expect((await readPinnedWdiAnnualStructuralPair("CHN","FP.CPI.TOTL.ZG",
      {fetchImpl:f.fetchImpl,now})).pair).toBe(null);
    const g=official("2",[
      {date:"2025",value:1,countryiso3code:"CHN",indicator:{id:"FP.CPI.TOTL.ZG"}},
      {date:"2023",value:2,countryiso3code:"CHN",indicator:{id:"FP.CPI.TOTL.ZG"}},
    ]);
    expect((await readPinnedWdiAnnualStructuralPair("CHN","FP.CPI.TOTL.ZG",
      {fetchImpl:g.fetchImpl,now})).status).toBe("NON_CONSECUTIVE_ANNUAL_YEARS");
  });
  it("rejects conflicting revisions for the same annual reference period",async()=>{
    const g=official("2",[
      {date:"2025",value:1,countryiso3code:"CHN",indicator:{id:"FP.CPI.TOTL.ZG"}},
      {date:"2025",value:2,countryiso3code:"CHN",indicator:{id:"FP.CPI.TOTL.ZG"}},
      {date:"2024",value:3,countryiso3code:"CHN",indicator:{id:"FP.CPI.TOTL.ZG"}},
    ]);
    const r=await readPinnedWdiAnnualStructuralPair("CHN","FP.CPI.TOTL.ZG",{fetchImpl:g.fetchImpl,now});
    expect(r.status).toBe("DUPLICATE_YEAR_CONFLICT");
    expect(r.pair).toBe(null);
  });
});
