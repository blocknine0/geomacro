import {describe,it,expect} from "vitest";
import {canonicalStructuralEvidence} from "./canonical-structural-evidence";
import {loadQualifiedBlsCountryContext,parseBlsUsCpiRelease,
  BLS_CPI_URL,BLS_US_CPI_SOURCE_ID} from "./qualified-bls-us-cpi.server";

const NOW=new Date("2026-10-29T12:00:00.000Z");
const valid={status:"REQUEST_SUCCEEDED",Results:{series:[{seriesID:"CUUR0000SA0",data:[
  {year:"2026",period:"M09",value:"327.310",footnotes:[{}]},
  {year:"2026",period:"M08",value:"327.150",footnotes:[{}]},
  {year:"2026",period:"M13",value:"326.000",footnotes:[{}]},
]}]}};
function source(body:unknown,status=200):typeof fetch{
  return (async(url:unknown,init?:RequestInit)=>{
    expect(url).toBe(BLS_CPI_URL);
    expect(init?.method).toBe("GET");
    return Response.json(body,{status});
  }) as typeof fetch;
}
describe("BLS official U.S. CPI-U public-domain monthly Store baseline",()=>{
  it("pins exact BLS series and source-native September 2026 monthly index",()=>{
    const row=parseBlsUsCpiRelease(valid,NOW);
    expect(row).toMatchObject({year:2026,month:9,value:327.31});
    expect(parseBlsUsCpiRelease({...valid,status:"REQUEST_NOT_PROCESSED"},NOW)).toBeNull();
    expect(parseBlsUsCpiRelease({...valid,Results:{series:[{seriesID:"OTHER",data:[]}]}},NOW)).toBeNull();
  });
  it("never accepts aggregate M13, a future month, prelim data or duplicates",()=>{
    const future={...valid,Results:{series:[{seriesID:"CUUR0000SA0",data:[
      {year:"2026",period:"M11",value:"400",footnotes:[]},
    ]}]}};
    expect(parseBlsUsCpiRelease(future,NOW)).toBeNull();
    const preliminary={...valid,Results:{series:[{seriesID:"CUUR0000SA0",data:[
      {year:"2026",period:"M09",value:"327",footnotes:[{code:"P"}]},
    ]}]}};
    expect(parseBlsUsCpiRelease(preliminary,NOW)).toBeNull();
    const duplicated={...valid,Results:{series:[{seriesID:"CUUR0000SA0",data:[
      {year:"2026",period:"M09",value:"327.3"},{year:"2026",period:"M09",value:"320.2"},
    ]}]}};
    expect(parseBlsUsCpiRelease(duplicated,NOW)).toBeNull();
  });
  it("returns one USA only eligible structural observation, no current/signed news",async()=>{
    const usa=await loadQualifiedBlsCountryContext("USA",{now:NOW,noCache:true,fetcher:source(valid)});
    expect(usa?.status).toBe("AVAILABLE");
    const row=usa!.observations[0];
    expect(row.dimension).toBe("macro_monetary");
    expect(row.source_id).toBe(BLS_US_CPI_SOURCE_ID);
    expect(row.observed_at).toBe("2026-09-30T23:59:59.000Z");
    expect(row.published_at).toBeNull();
    expect(row.provenance).toMatchObject({measurement_period:"2026-09",original_measurement_month:true});
    expect(row.quality_status).toBe("VERIFIED");
    expect(canonicalStructuralEvidence(row,NOW.toISOString())?.measurement_period.granularity).toBe("month");
    expect(usa?.note).toContain("Does not establish current breaking news");
    expect(await loadQualifiedBlsCountryContext("IND",{now:NOW,noCache:true,fetcher:source(valid)})).toBeNull();
  });
  it("rejects unavailable, HTML, oversized, stale, and malformed upstream without paid data",async()=>{
    expect(await loadQualifiedBlsCountryContext("USA",{now:NOW,noCache:true,fetcher:source(null,503)})).toBeNull();
    expect(await loadQualifiedBlsCountryContext("USA",{now:NOW,noCache:true,fetcher:source({invalid:true})})).toBeNull();
    const old=new Date("2027-12-05T12:00:00.000Z");
    expect(await loadQualifiedBlsCountryContext("USA",{now:old,noCache:true,fetcher:source(valid)})).toBeNull();
  });
});
