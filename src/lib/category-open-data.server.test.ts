import { describe,it,expect,vi } from "vitest";
import { extractOpenData,readCategoryOpenData,OPEN_DATA_SOURCE_FAMILIES } from "./category-open-data.server";

const now=Date.parse("2026-10-13T18:00:00Z");
describe("no-card original government structured data adapters",()=>{
  it("uses only five fixed provider families across three launch endpoints",()=>{
    expect(OPEN_DATA_SOURCE_FAMILIES).toEqual({
      geopolitics:2,"macro-fx":2,"critical-minerals":1,
    });
  });
  it("separates native seismic occurrence from political conflict and source URL",()=>{
    const payload={type:"FeatureCollection",features:[
      {id:"us7000test",properties:{mag:5.45,time:now-2*3600_000,place:"somewhere",url:"https://example.invalid"}},
      {id:"us7000old",properties:{mag:5.5,time:now-48*3600_000}},
    ]};
    const result=extractOpenData("usgs_earthquakes",payload,now);
    expect(result?.signals).toHaveLength(1);
    expect(result?.signals[0]).toMatchObject({
      observation_type:"seismic_hazard",clock_semantics:"event_occurrence",
      score:null,independent_same_event_verification:false,
    });
    expect(JSON.stringify(result)).not.toContain("us7000test");
    expect(JSON.stringify(result)).not.toContain("5.45");
    expect(JSON.stringify(result)).not.toContain("example.invalid");
  });
  it("CISA dateAdded is a catalog day, not the exploit moment",()=>{
    const payload={catalogVersion:"2026.10",vulnerabilities:[
      {cveID:"CVE-2026-12345",dateAdded:"2026-10-12",vendorProject:"Raw Private Publisher"},
      {cveID:"CVE-2026-99999",dateAdded:"2026-10-13"},
    ]};
    const data=extractOpenData("cisa_kev",payload,now);
    expect(data?.signals).toHaveLength(1);
    expect(data?.signals[0].clock_semantics).toBe("catalog_added_day");
    expect(JSON.stringify(data)).not.toContain("CVE-");
    expect(JSON.stringify(data)).not.toContain("Raw Private");
  });
  it("World Bank annual GDP period stays historical with mandatory CC BY credit",()=>{
    const b=[{page:1},[
      {indicator:{id:"NY.GDP.MKTP.CD"},date:"2025",value:123456789},
      {indicator:{id:"NY.GDP.MKTP.CD"},date:"2026",value:null},
    ]];
    const result=extractOpenData("world_bank_wdi",b,now);
    expect(result?.signals[0]).toMatchObject({
      observation_type:"annual_gdp_reference_period",
      observation_period:"2025",clock_semantics:"reference_year",
    });
    expect(result?.credits).toContain("World Bank (CC BY 4.0)");
    expect(JSON.stringify(result)).not.toContain("123456789");
  });
  it("Treasury monthly series is a dated reference period, never a same-day policy announcement",()=>{
    const x={data:[{record_date:"2026-09-30",avg_interest_rate_amt:"3.429"}]};
    const result=extractOpenData("treasury_fiscaldata",x,now);
    expect(result?.signals[0]).toMatchObject({
      observation_period:"2026-09",clock_semantics:"reference_month",score:null,
    });
    expect(JSON.stringify(result)).not.toContain("3.429");
  });
  it("mineral award must match description and original base-obligation day; modification is not proof",()=>{
    const x={results:[
      {Description:"critical minerals feasibility procurement",
       "Base Obligation Date":"2026-10-08","Last Modified Date":"2026-10-13","Award ID":"SECRET"},
      {Description:"unrelated equipment","Base Obligation Date":"2026-10-08"},
    ]};
    const result=extractOpenData("usaspending",x,now);
    expect(result?.signals).toHaveLength(1);
    expect(result?.signals[0].clock_semantics).toBe("award_obligation_day");
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(JSON.stringify(result)).not.toContain("critical minerals feasibility procurement");
  });
  it("refuses malformed provider JSON rather than fabricating healthy source rows",()=>{
    expect(extractOpenData("usgs_earthquakes",{type:"wrong"},now)).toBeNull();
    expect(extractOpenData("world_bank_wdi",{},now)).toBeNull();
    expect(extractOpenData("cisa_kev",{vulnerabilities:[]},now)).toBeNull();
    expect(extractOpenData("usaspending",{results:"not array"},now)).toBeNull();
  });
  it("on-demand category source readback sends only fixed HTTPS provider requests",async()=>{
    const calls:string[]=[];
    const fake=vi.fn(async (input:RequestInfo|URL,init?:RequestInit)=>{
      const url=String(input);
      calls.push(url);
      expect(new URL(url).protocol).toBe("https:");
      expect(init?.redirect).toBe("error");
      expect(init?.cache).toBe("no-store");
      const body=url.includes("earthquake.usgs.gov")
        ? {type:"FeatureCollection",features:[]}
        : {catalogVersion:"2026.10",vulnerabilities:[]};
      return new Response(JSON.stringify(body),{status:200,headers:{"content-type":"application/json"}});
    }) as typeof fetch;
    const result=await readCategoryOpenData("geopolitics",{now,fetcher:fake});
    expect(calls).toHaveLength(2);
    expect(result.source_families_attempted).toBe(2);
    expect(result.source_families_readable).toBe(2);
    expect(result.signed_gro_generated).toBe(false);
    expect(result.x402_payment_required).toBe(false);
    expect(result.chargeable).toBe(false);
    expect(result.persisted_storage_written).not.toBe(true);
  });
});
