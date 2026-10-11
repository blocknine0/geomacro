import { describe, expect, it, vi } from "vitest";
import { discoverOnDemandGlobal } from "./on-demand-global-discovery.server";
import { buildAgentQueryPlan } from "./agent-query-plan";

const now = new Date("2026-10-11T12:00:00.000Z");
function upstream(url: string) {
  const address = new URL(url);
  if (address.hostname === "api.worldbank.org" && address.pathname === "/v2/country/IND") {
    return Response.json([{page:1,total:1},[{id:"IND",name:"India"}]]);
  }
  if (address.hostname === "api.worldbank.org") {
    return Response.json([{page:1,total:1},[
      {countryiso3code:"IND",date:"2025",value:3.2},
      {countryiso3code:"IND",date:"2024",value:4.1},
    ]]);
  }
  if (address.hostname === "api.gdeltproject.org") {
    return Response.json({articles:[{
      title:"Indian government reports critical minerals review",
      url:"https://publisher.example.gov/india-minerals",
      seendate:"20261011110000",
    }]});
  }
  if (address.hostname === "api.reliefweb.int") {
    return Response.json({data:[{fields:{date:{original:"2026-10-11T06:00:00Z"}}}]});
  }
  if (address.hostname === "www.gov.uk") {
    return new Response('<feed><entry><title>India lithium critical minerals agreement</title>'+
      '<published>2026-10-11T07:00:00Z</published></entry></feed>',
      {headers:{"content-type":"application/atom+xml"}});
  }
  throw Error("UNKNOWN_TEST_SOURCE");
}
const fetchImpl=vi.fn(async (input: RequestInfo | URL) => upstream(String(input))) as unknown as typeof fetch;

describe("Global on-demand private retrieval, not pre-generated GRO",()=>{
  it("searches geopolitical, macro and minerals provider families concurrently and redacts original raw data",async()=>{
    const result=await discoverOnDemandGlobal({
      country_iso3:"IND",categories:["geopolitics","macro","rare_earth"],
    },{fetchImpl,now});
    expect(result.categories).toEqual(["geopolitics","macro","rare_earth"]);
    expect(result.reached_source_families).toBe(7);
    expect(result.network_attempts).toBe(8);
    expect(result.source_probes.some(x=>x.family==="world_bank_official_FP.CPI.TOTL.ZG" &&
      x.observed_record_count===2)).toBe(true);
    expect(result.source_probes.find(x=>x.family==="gdelt_doc_discovery")?.publication_clock_verified)
      .toBe(false);
    expect(result.source_probes.every(x=>x.independent_claim_verified===false &&
      x.derived_commercial_rights_verified===false)).toBe(true);
    expect(result.payable).toBe(false);
    expect(result.signed_derived_intelligence_created).toBe(false);
    expect(result.settlement_attempted).toBe(false);
    expect(result.supabase_requests).toBe(0);
    expect(result.b2_requests).toBe(0);
    const publicText=JSON.stringify(result);
    expect(publicText).not.toContain("publisher.example.gov");
    expect(publicText).not.toContain("agreement");
    expect(publicText).not.toContain("3.2");
    expect(result.query_fingerprint_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("rejects invalid country, duplicate family scope and oversized category fanout",async()=>{
    await expect(discoverOnDemandGlobal({country_iso3:"IND/path",categories:["macro"]},{fetchImpl,now}))
      .rejects.toThrow("ON_DEMAND_ISO3_INVALID");
    await expect(discoverOnDemandGlobal({country_iso3:"IND",categories:["macro","macro"]},{fetchImpl,now}))
      .rejects.toThrow("ON_DEMAND_CATEGORIES_INVALID");
    await expect(discoverOnDemandGlobal({country_iso3:"IND",categories:["unknown" as never]},{fetchImpl,now}))
      .rejects.toThrow("ON_DEMAND_CATEGORIES_INVALID");
  });
  it("makes source/metadata outages a no-charge degraded result, never a fake signed item",async()=>{
    const failing=vi.fn(async () => {throw Error("provider blocked");}) as unknown as typeof fetch;
    const result=await discoverOnDemandGlobal({
      country_iso3:"IND",categories:["geopolitics","rare_earth"],
    },{fetchImpl:failing,now});
    expect(result.network_attempts).toBe(1);
    expect(result.status).toBe("DISCOVERY_DEGRADED");
    expect(result.payable).toBe(false);
    expect(result.reached_source_families).toBe(0);
  });
  it("hash-binds explicit live discovery without disabling explicit GRO/risk gate requirements",()=>{
    const base={
      subjects:[{type:"country",country_iso3:"IND"}],
      question:"What is the current macroeconomic risk in India?",
    };
    const published=buildAgentQueryPlan(base);
    const live=buildAgentQueryPlan({...base,fulfillment_mode:"live_on_demand"});
    expect(published.required_modules).toContain("signed_risk_object");
    expect(published.required_modules).toContain("hot_topics");
    expect(live.required_modules).not.toContain("signed_risk_object");
    expect(live.required_modules).not.toContain("hot_topics");
    expect(live.required_modules).toContain("macro_monetary");
    expect(live.query_plan_hash).not.toBe(published.query_plan_hash);
    const explicit=buildAgentQueryPlan({
      subjects:[{type:"country",country_iso3:"IND"}],
      topics:["risk_object"],fulfillment_mode:"live_on_demand",
    });
    expect(explicit.required_modules).toContain("signed_risk_object");
  });
});
