import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {
  probeOperatorOfficialIntake,OPERATOR_PUBLIC_PROBES,
} from "../../scripts/ops/probe-operator-official-intake.mjs";
import {
  mandatoryDerivedSourceCredits,registeredSourceDisplayName,
} from "../../scripts/lib/operator-source-attribution.mjs";

const date=new Date("2026-10-12T12:00:00Z");
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{
  status,headers:{"content-type":"application/json"},
});}

describe("operator 76-source three-domain and attribution reconciliation",()=>{
  const config=JSON.parse(readFileSync("config/operator-76-source-attribution-intake.v1.json","utf8"));
  it("registers each of 76 separately without altering the canonical registry or claiming activation",()=>{
    expect(config.entries).toHaveLength(76);
    expect(new Set(config.entries.map((x:{id:string})=>x.id)).size).toBe(76);
    expect(config.launch_domains).toEqual(["geopolitics","macro","rare_earth"]);
    expect(config.entries.every((x:{domains:string[],attribution:{source_name:string},commercial_rights_rereview_required:boolean})=>
      x.domains.length>0&&x.domains.every(d=>config.launch_domains.includes(d))&&!!x.attribution.source_name
    )).toBe(true);
    expect(config.entries.find((x:{id:string})=>x.id==="opensanctions").runtime_state).toBe("HOLD_PAID_OR_NONCOMMERCIAL");
    expect(config.entries.find((x:{id:string})=>x.id==="re_price_paid").runtime_state).toBe("HOLD_PAID_OR_NONCOMMERCIAL");
    expect(config.entries.find((x:{id:string})=>x.id==="re_smm").runtime_state).toBe("HOLD_RIGHTS_OR_AUTH_REVIEW");
    expect(config.entries.find((x:{id:string})=>x.id==="market_prices").runtime_state).toBe("DEFER_MARKETS");
  });
  it("credits only the exact rights-verified datasets used, deduping provider labels",()=>{
    expect(registeredSourceDisplayName("re_usgs")).toBe("U.S. Geological Survey");
    expect(registeredSourceDisplayName("news_bbc")).toBe("BBC World");
    expect(registeredSourceDisplayName("nonexistent")).toBeNull();
    const credits=mandatoryDerivedSourceCredits([
      "worldbank","gdelt_events","usgs_quakes","re_usgs","ucdp","usgs_quakes"
    ]);
    expect(credits).toEqual([
      "World Bank","GDELT Project","U.S. Geological Survey",
      "Uppsala Conflict Data Program (UCDP)",
    ]);
    expect(mandatoryDerivedSourceCredits([])).toEqual([]);
  });
  it("cannot imply permission for unreviewed datasets or partner-republished ReliefWeb",()=>{
    for(const id of ["acled","reliefweb","gdelt_doc_api","news_bbc","re_smm","re_eurostat_comext"]){
      expect(()=>mandatoryDerivedSourceCredits([id])).toThrow("SOURCE_CREDIT_RIGHTS_NOT_VERIFIED");
    }
  });
  it("probes three specific read-only official endpoints with one HTTP request each",async()=>{
    const mock=vi.fn(async(url:string)=>{
      if(new URL(url).hostname==="earthquake.usgs.gov")return json({
        type:"FeatureCollection",
        features:[{properties:{time:Date.parse("2026-10-12T11:40:00Z")}}],
      });
      if(new URL(url).hostname==="api.fiscaldata.treasury.gov")return json({
        data:[{record_date:"2026-09-30",avg_interest_rate_amt:"3.8"}],
      });
      return json({results:[{publication_date:"2026-10-12"}]});
    });
    const proof=await probeOperatorOfficialIntake({now:date,fetchImpl:mock as typeof fetch});
    expect(proof.state).toBe("ALL_THREE_CONTEXT_TRANSPORTS_LIVE");
    expect(proof.total_http_requests).toBe(3);
    expect(mock).toHaveBeenCalledTimes(3);
    expect(proof.sources.map(x=>x.domain)).toEqual(["geopolitics","macro","rare_earth"]);
    expect(proof.sources.every(x=>!x.commercial_eligible&&!x.signed_gro)).toBe(true);
    expect(proof.sources[0].native_reference_dates_in_24h).toBe(1);
    expect(proof.sources[1].native_reference_dates_in_24h).toBeNull();
    expect(proof.sources[2].published_on_utc_calendar_date).toBe(1);
    expect(proof.raw_data_stored).toBe(false);
    expect(proof.b2_requests+proof.d1_requests+proof.supabase_requests).toBe(0);
    expect(JSON.stringify(proof)).not.toContain("avg_interest_rate_amt");
    expect(OPERATOR_PUBLIC_PROBES).toHaveLength(3);
  });
  it("never retries an upstream quota/authorization denial",async()=>{
    const mock=vi.fn(async()=>new Response(null,{status:429}));
    const proof=await probeOperatorOfficialIntake({now:date,fetchImpl:mock as typeof fetch});
    expect(mock).toHaveBeenCalledTimes(3);
    expect(proof.state).toBe("CONTEXT_TRANSPORTS_DEGRADED");
    expect(proof.sources.every(x=>x.state==="AUTH_OR_QUOTA_DENIED")).toBe(true);
    expect(proof.total_http_requests).toBe(3);
  });
});
