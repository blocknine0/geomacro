import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {discoverOnDemandForPrivateQualification,discoverOnDemandGlobal} from "./on-demand-global-discovery.server";

const now=new Date("2026-10-11T15:00:00.000Z");
const chn={country_iso3:"CHN",categories:["macro" as const]};
const annual=(date:string,value:number|null,id="CHN")=>({
  date,value,countryiso3code:id,indicator:{id:"FP.CPI.TOTL.ZG"},
});
const caseFetch=(inflation:unknown,asText=false)=>{
  const seen:string[]=[];
  const fn=vi.fn(async(input:RequestInfo|URL,options?:RequestInit)=>{
    const url=new URL(String(input));
    seen.push(url.href);
    expect(url.protocol).toBe("https:");
    expect(options?.redirect).toBe("manual");
    expect(options?.method).toBe("GET");
    if(url.pathname==="/v2/country/CHN")
      return Response.json([{page:1,total:1},[{id:"CHN",name:"China"}]]);
    if(url.pathname.includes("FP.CPI.TOTL.ZG"))
      return asText
        ?new Response(String(inflation),{headers:{"content-type":"text/html"}})
        :Response.json(inflation);
    if(url.pathname.includes("NY.GDP.MKTP.KD.ZG"))
      return Response.json([{page:1,total:0},[]]);
    throw Error("TEST_ORIGIN_NOT_APPROVED");
  }) as unknown as typeof fetch;
  return {fn,seen};
};
async function proof(inflation:unknown,asText=false) {
  const transport=caseFetch(inflation,asText);
  const v=await discoverOnDemandForPrivateQualification(chn,{now,fetchImpl:transport.fn});
// Macro also includes one GDELT discovery and one Federal Reserve publisher
  // probe; do not silently undercount requests just because WDI is the focus.
  expect(v.discovery.network_attempts).toBe(4);
  expect(transport.seen).toHaveLength(4);
  expect(v.private_macro_qualifications).toHaveLength(2);
  return v;
}

describe("World Bank CHN official 2xx != verified annual intelligence",()=>{
  it("recognizes two truly consecutive official country-specific years without exposing raw numbers",async()=>{
    const v=await proof([{page:1,total:2},[annual("2025",3.4),annual("2024",2.8)]]);
    const inflation=v.private_macro_qualifications.find(x=>x.indicator==="FP.CPI.TOTL.ZG");
    expect(inflation).toEqual({
      indicator:"FP.CPI.TOTL.ZG",status:"VALID_ANNUAL_CHANGE",
      accepted_annual_values:2,latest_observation_year:2025,
      previous_observation_year:2024,
    });
    expect(v.private_macro_changes).toHaveLength(1);
    const publicProof=await discoverOnDemandGlobal(chn,{now,fetchImpl:caseFetch(
      [{page:1,total:2},[annual("2025",3.4),annual("2024",2.8)]]).fn});
    expect(JSON.stringify(publicProof)).not.toContain("private_macro_qualifications");
    expect(JSON.stringify(publicProof)).not.toContain("3.4");
  });
  it("rejects an HTTP 200 HTML/body instead of quietly calling it valid WDI",async()=>{
    const v=await proof("<html>maintenance proxy</html>",true);
    expect(v.private_macro_qualifications.find(x=>x.indicator==="FP.CPI.TOTL.ZG")?.status)
      .toBe("INVALID_JSON_BODY");
    expect(v.discovery.source_probes.find(x=>x.family==="world_bank_official_FP.CPI.TOTL.ZG")?.reachable)
      .toBe(false);
    expect(v.private_macro_changes).toHaveLength(0);
  });
  it("rejects an official JSON 2xx API error envelope without inventing values",async()=>{
    const v=await proof([{message:[{id:"120",value:"Invalid value"}]}]);
    expect(v.private_macro_qualifications.find(x=>x.indicator==="FP.CPI.TOTL.ZG")?.status)
      .toBe("UNEXPECTED_JSON_SHAPE");
    expect(v.private_macro_changes).toHaveLength(0);
  });
  it("rejects nulls and other country rows, even with HTTP 200",async()=>{
    const v=await proof([{page:1,total:3},[
      annual("2025",null),annual("2024",null),annual("2023",4.7,"IND"),
    ]]);
    expect(v.private_macro_qualifications.find(x=>x.indicator==="FP.CPI.TOTL.ZG")?.status)
      .toBe("NO_NON_NULL_COUNTRY_VALUES");
    expect(v.private_macro_changes).toHaveLength(0);
  });
  it("keeps verified observation years truthful and refuses to bridge a missing year",async()=>{
    const v=await proof([{page:1,total:2},[annual("2025",3.4),annual("2023",2.6)]]);
    expect(v.private_macro_qualifications.find(x=>x.indicator==="FP.CPI.TOTL.ZG")).toMatchObject({
      status:"NON_CONSECUTIVE_ANNUAL_YEARS",latest_observation_year:2025,
      previous_observation_year:2023,
    });
    expect(v.private_macro_changes).toHaveLength(0);
  });
  it("refuses conflicting duplicate official year values, no silent selection",async()=>{
    const v=await proof([{page:1,total:3},[
      annual("2025",3.4),annual("2025",99),annual("2024",2.8),
    ]]);
    expect(v.private_macro_qualifications.find(x=>x.indicator==="FP.CPI.TOTL.ZG")?.status)
      .toBe("DUPLICATE_YEAR_CONFLICT");
    expect(v.private_macro_changes).toHaveLength(0);
  });
  it("no extra upstream requests, source/rights/signing/payment activation",()=>{
    const script=readFileSync("scripts/ops/verify-live-on-demand-real-apis.ts","utf8");
    expect(script).toContain("private_world_bank_annual_qualification:privateEvidence.private_macro_qualifications");
    expect(script).toContain("proof.network_attempts>12");
    expect(script).toContain("proof.total_bounded_network_attempts>17");
    expect(script).toContain("current_lithium_risk_answer_verified:false");
    expect(script).toContain("x402_commercial_release_authorized:false");
    expect(script).not.toContain("signRiskObject(");
    expect(script).not.toContain("settleCoinbaseX402(");
  });
});