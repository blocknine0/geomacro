import {describe, expect, it, vi} from "vitest";
import {
  discoverOnDemandForPrivateQualification, discoverOnDemandGlobal,
} from "./on-demand-global-discovery.server";

const now=new Date("2026-10-11T12:00:00Z");

function api(override?:Record<string,unknown>[]) {
  const urls:string[]=[];
  const rows=override ?? [
    {countryiso3code:"IND",date:"2025",value:3.2},
    {countryiso3code:"IND",date:"2024",value:4.1},
  ];
  const fetchImpl=vi.fn(async(input:RequestInfo|URL,opts?:RequestInit)=>{
    const u=new URL(String(input));
    urls.push(u.href);
    expect(u.protocol).toBe("https:");
    expect(opts?.redirect).toBe("error");
    if(u.hostname==="api.worldbank.org" && u.pathname==="/v2/country/IND")
      return Response.json([{page:1,total:1},[{id:"IND",name:"India"}]]);
    if(u.hostname==="api.worldbank.org" && u.pathname.includes("/indicator/"))
      return Response.json([{page:1,total:rows.length},rows]);
    if(u.hostname==="api.gdeltproject.org")return Response.json({articles:[]});
    if(u.hostname==="www.federalreserve.gov")
      return new Response("<rss><channel></channel></rss>");
    throw Error("UNEXPECTED_ORIGIN");
  }) as unknown as typeof fetch;
  return {fetchImpl,urls};
}

describe("private official annual change evidence — NOT live scored news",()=>{
  it("derives two consecutive-year macro changes privately while public discovery stays raw-free",async()=>{
    const {fetchImpl,urls}=api();
    const input={country_iso3:"IND",categories:["macro" as const]};
    const privateProof=await discoverOnDemandForPrivateQualification(input,{fetchImpl,now});
    expect(privateProof.discovery.network_attempts).toBe(4);
    expect(privateProof.private_macro_changes).toHaveLength(2);
    for(const x of privateProof.private_macro_changes){
      expect(x.country_iso3).toBe("IND");
      expect(x.latest_observation_year).toBe(2025);
      expect(x.previous_observation_year).toBe(2024);
      expect(x.latest_annual_pct).toBe(3.2);
      expect(x.previous_annual_pct).toBe(4.1);
      expect(x.annual_rate_change_percentage_points).toBeCloseTo(-0.9);
      expect(x.observation_type).toBe("ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS");
      expect(x.source_observation_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(x.publisher_original_release_date_verified).toBe(false);
      expect(x.derived_commercial_rights_verified).toBe(false);
      expect(x.risk_score_verified).toBe(false);
      expect(x.paid_delivery_allowed).toBe(false);
    }
    expect(urls.every(x=>!x.includes("current%20macro"))).toBe(true);
    const publicProof=await discoverOnDemandGlobal(input,{fetchImpl,now});
    const serialized=JSON.stringify(publicProof);
    expect(publicProof.payable).toBe(false);
    expect(publicProof.signed_derived_intelligence_created).toBe(false);
    expect(publicProof.supabase_requests).toBe(0);
    expect(publicProof.b2_requests).toBe(0);
    for(const x of privateProof.private_macro_changes){
      expect(serialized).not.toContain(x.source_observation_sha256);
      expect(serialized).not.toContain(String(x.annual_rate_change_percentage_points));
    }
    expect(serialized).not.toContain("latest_annual_pct");
  });

  it.each([
    ["country spoof",[
      {countryiso3code:"CHN",date:"2025",value:3.2},
      {countryiso3code:"CHN",date:"2024",value:4.1},
    ]],
    ["future observations",[
      {countryiso3code:"IND",date:"2029",value:3.2},
      {countryiso3code:"IND",date:"2028",value:4.1},
    ]],
    ["nonconsecutive observations",[
      {countryiso3code:"IND",date:"2025",value:3.2},
      {countryiso3code:"IND",date:"2023",value:4.1},
    ]],
    ["conflicting same-year originals",[
      {countryiso3code:"IND",date:"2025",value:3.2},
      {countryiso3code:"IND",date:"2025",value:77},
      {countryiso3code:"IND",date:"2024",value:4.1},
    ]],
    ["invalid numerical data",[
      {countryiso3code:"IND",date:"2025",value:"3.2"},
      {countryiso3code:"IND",date:"2024",value:null},
    ]],
  ])("fails closed on %s",async(_name,rows)=>{
    const {fetchImpl}=api(rows);
    const proof=await discoverOnDemandForPrivateQualification({
      country_iso3:"IND",categories:["macro"],
    },{fetchImpl,now});
    expect(proof.private_macro_changes).toEqual([]);
    expect(proof.discovery.payable).toBe(false);
    expect(proof.discovery.settlement_attempted).toBe(false);
  });
});
