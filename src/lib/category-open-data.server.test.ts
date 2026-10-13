import { describe,it,expect,vi } from "vitest";
import { extractOpenData,readCategoryOpenData,OPEN_DATA_SOURCE_FAMILIES } from "./category-open-data.server";

const now=Date.parse("2026-10-13T18:00:00Z");
describe("no-card original government structured data adapters",()=>{
  it("uses seven pinned no-card official sources across three launch endpoints",()=>{
    expect(OPEN_DATA_SOURCE_FAMILIES).toEqual({
      geopolitics:4,"macro-fx":4,"critical-minerals":1,
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
  it("Federal Register requires original publication day and sanctions-related title",()=>{
    const body={count:2,results:[
      {title:"New sanctions actions authorized by federal rule",publication_date:"2026-10-11"},
      {title:"New parking regulation",publication_date:"2026-10-11"},
    ]};
    const x=extractOpenData("federal_register",body,now);
    expect(x?.signals).toHaveLength(1);
    expect(x?.signals[0]).toMatchObject({
      observation_type:"sanctions_federal_publication",
      clock_semantics:"catalog_added_day",score:null,
    });
    expect(JSON.stringify(x)).not.toContain("New sanctions actions");
    expect(extractOpenData("federal_register",{count:1,results:"wrong"},now)).toBeNull();
  });
  it("BLS monthly reference period cannot be mistaken for live original CPI publication",()=>{
    const body={status:"REQUEST_SUCCEEDED",Results:{series:[{
      seriesID:"CUUR0000SA0",data:[
        {year:"2026",period:"M09",value:"324.390"},
        {year:"2026",period:"M13",value:"333"},
      ],
    }]}};
    const data=extractOpenData("bls_cpi",body,now);
    expect(data?.signals).toHaveLength(1);
    expect(data?.signals[0]).toMatchObject({
      observation_period:"2026-09",clock_semantics:"reference_month",
    });
    expect(JSON.stringify(data)).not.toContain("324.390");
  });
  it("NOAA current storm snapshot is not a publication or damage confirmation",()=>{
    const empty=extractOpenData("noaa_nhc",{activeStorms:[]},now);
    expect(empty?.signals).toHaveLength(0);
    const active=extractOpenData("noaa_nhc",{
      activeStorms:[{stormId:"TEST",stormName:"DO NOT DISCLOSE",privateUrl:"https://example.invalid"}],
    },now);
    expect(active?.signals).toHaveLength(1);
    expect(active?.signals[0]).toMatchObject({
      observation_type:"noaa_tropical_cyclone_listing",
      clock_semantics:"retrieval_snapshot",score:null,
      independent_same_event_verification:false,
    });
    expect(JSON.stringify(active)).not.toContain("DO NOT DISCLOSE");
    expect(JSON.stringify(active)).not.toContain("example.invalid");
    expect(extractOpenData("noaa_nhc",{activeStorms:"invalid"},now)).toBeNull();
  });
  it("ECB daily XML must have native date and does not leak FX raw rate",async()=>{
    const urls:string[]=[];
    const fixture=`<?xml version="1.0" encoding="UTF-8"?>
      <gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01"
        xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
        <Cube><Cube time="2026-10-13"><Cube currency="USD" rate="1.11991"/></Cube></Cube>
      </gesmes:Envelope>`;
    const fake=vi.fn(async (input:RequestInfo|URL,init?:RequestInit)=>{
      const u=new URL(String(input));
      urls.push(u.hostname);
      const isXml=u.hostname==="www.ecb.europa.eu";
      return new Response(isXml?fixture:JSON.stringify({data:[]}),{
        headers:{"content-type":isXml?"text/xml":"application/json"},status:200,
      });
    }) as typeof fetch;
    const result=await readCategoryOpenData("macro-fx",{now,fetcher:fake});
    expect(urls).toContain("www.ecb.europa.eu");
    expect(result.source_families_attempted).toBe(4);
    const ecb=result.findings.find(x=>x.observation_type==="ecb_daily_fx_reference");
    expect(ecb).toMatchObject({
      observation_period:"2026-10-13",
      clock_semantics:"reference_day",score:null,
    });
    expect(JSON.stringify(result)).not.toContain("1.11991");
    expect(result.licensed_source_credits).toContain("European Central Bank");
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
      const host=new URL(url).hostname;
      const body=host==="earthquake.usgs.gov"
        ? {type:"FeatureCollection",features:[]}
        : host==="www.nhc.noaa.gov"
          ? {activeStorms:[]}
        : host==="www.federalregister.gov"
          ? {count:0,results:[]}
          : {catalogVersion:"2026.10",vulnerabilities:[]};
      return new Response(JSON.stringify(body),{status:200,headers:{"content-type":"application/json"}});
    }) as typeof fetch;
    const result=await readCategoryOpenData("geopolitics",{now,fetcher:fake});
    expect(calls).toHaveLength(4);
    expect(result.source_families_attempted).toBe(4);
    expect(result.source_families_readable).toBe(4);
    expect(result.signed_gro_generated).toBe(false);
    expect(result.x402_payment_required).toBe(false);
    expect(result.chargeable).toBe(false);
    expect(result.persisted_storage_written).not.toBe(true);
  });
});
