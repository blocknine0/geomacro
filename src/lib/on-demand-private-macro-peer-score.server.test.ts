import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { scorePrivateOnDemandMacroPeers } from "./on-demand-private-macro-peer-score.server";
import type { PrivateOfficialMacroChange } from "./on-demand-global-discovery.server";
import type { PrivateOnDemandMacroRightsProof } from "./on-demand-private-macro-rights.server";

const now=new Date("2026-10-11T12:00:00Z");
const indicators=["FP.CPI.TOTL.ZG","NY.GDP.MKTP.KD.ZG"] as const;
const peers=Array.from({length:110},(_,i)=>
  "A"+String.fromCharCode(65+Math.floor(i/26))+
  String.fromCharCode(65+i%26)).concat(["IND"]);
function change(indicator:PrivateOfficialMacroChange["indicator"],latest=3.2,prior=4.1):PrivateOfficialMacroChange {
  return {
    country_iso3:"IND",indicator,latest_observation_year:2025,
    previous_observation_year:2024,latest_annual_pct:latest,
    previous_annual_pct:prior,
    annual_rate_change_percentage_points:Math.round((latest-prior)*1e5)/1e5,
    source_observation_sha256:createHash("sha256")
      .update(JSON.stringify(["IND",indicator,2025,latest,2024,prior])).digest("hex"),
    observation_type:"ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS",
    publisher_original_release_date_verified:false,
    derived_commercial_rights_verified:false,
    risk_score_verified:false,paid_delivery_allowed:false,
  };
}
const rights:PrivateOnDemandMacroRightsProof={
  status:"DERIVED_SOURCE_RIGHTS_VERIFIED_NOT_A_PAID_PRODUCT",
  checked_driver_count:2,rights_verified_driver_count:2,
  signed_intelligence_verified:false,payment_eligible:false,
};
function network(options:{
  countryCount?:number;wrongCountryValue?:boolean;duplicate?:boolean;
  observationYear?:number;aggregateOnly?:boolean;error?:boolean;
}={}){
  const calls:string[]=[];
  const iso=peers.slice(0,options.countryCount??peers.length);
  const fetchImpl=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const u=new URL(String(input));calls.push(u.href);
    expect(u.origin).toBe("https://api.worldbank.org");
    expect(init?.redirect).toBe("error");
    expect(init?.method).toBe("GET");
    if(options.error)return new Response("temporary outage",{status:429});
    if(u.pathname==="/v2/country"){
      const rows=iso.map(id=>({id,region:{
        id:options.aggregateOnly?"NA":"SAS",
        value:options.aggregateOnly?"Aggregates":"South Asia",
      }}));
      return Response.json([{page:1,total:rows.length},rows]);
    }
    const indicator=u.pathname.split("/").at(-1)!;
    const year=options.observationYear??2025;
    const rows=iso.map((id,i)=>({
      countryiso3code:id,date:String(year),
      indicator:{id:indicator},
      value:id==="IND"?(options.wrongCountryValue?99:3.2):i/10,
    }));
    if(options.duplicate)rows.push({...rows[0]});
    return Response.json([{page:1,total:rows.length},rows]);
  }) as unknown as typeof fetch;
  return {fetchImpl,calls};
}

describe("bounded first-party peer normalization using existing country macro methodology",()=>{
  it("refuses uncertified rights without calling any provider",async()=>{
    const {fetchImpl,calls}=network();
    const proof=await scorePrivateOnDemandMacroPeers(
      [change(indicators[0])],{...rights,status:"RIGHTS_RECEIPT_UNAVAILABLE",
        rights_verified_driver_count:0},{fetchImpl,now});
    expect(proof.status).toBe("NO_CERTIFIED_MACRO_RIGHTS");
    expect(calls).toHaveLength(0);
    expect(proof.payment_eligible).toBe(false);
  });

  it("uses the same-year country registry and >=100 peers to build only a PRIVATE partial pilot score",async()=>{
    const {fetchImpl,calls}=network();
    const output=await scorePrivateOnDemandMacroPeers(indicators.map(x=>change(x)),
      rights,{fetchImpl,now});
    expect(calls).toHaveLength(3);
    expect(output.status).toBe("PARTIAL_PEER_NORMALIZED_MACRO_SCORE_NOT_SIGNED");
    expect(output.peer_normalized_dimension_count).toBe(2);
    expect(output.coverage_ratio).toBe(0.5);
    expect(output.private_component?.available_dimension_count).toBe(2);
    expect(output.private_component?.dimensions.filter(x=>x.available).map(x=>x.key))
      .toEqual(["inflation","growth"]);
    expect(output.private_component?.weighted_observed_risk).toBeGreaterThanOrEqual(0);
    expect(output.private_component?.weighted_observed_risk).toBeLessThanOrEqual(100);
    expect(output.private_component?.calculation_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(output.commercially_signed).toBe(false);
    expect(output.payment_eligible).toBe(false);
    const again=await scorePrivateOnDemandMacroPeers(indicators.map(x=>change(x)),
      rights,{fetchImpl,now});
    expect(again.private_component?.calculation_hash)
      .toBe(output.private_component?.calculation_hash);
  });

  it("fails closed on a wrong country value or incomplete country registry",async()=>{
    const fake=network({wrongCountryValue:true});
    const v=await scorePrivateOnDemandMacroPeers([change(indicators[0])],
      {...rights,rights_verified_driver_count:1},{fetchImpl:fake.fetchImpl,now});
    expect(v.status).toBe("TARGET_OFFICIAL_VALUE_MISMATCH");
    expect(v.payment_eligible).toBe(false);

    const short=network({countryCount:50});
    const s=await scorePrivateOnDemandMacroPeers([change(indicators[0])],
      {...rights,rights_verified_driver_count:1},{fetchImpl:short.fetchImpl,now});
    expect(s.status).toBe("INSUFFICIENT_SAME_YEAR_PEERS");
    expect(short.calls).toHaveLength(1);
  });

  it("does not normalize fake aggregate peers, duplicate records, stale years or network failures",async()=>{
    for(const [opts,status] of [
      [{aggregateOnly:true},"INSUFFICIENT_SAME_YEAR_PEERS"],
      [{duplicate:true},"INSUFFICIENT_SAME_YEAR_PEERS"],
      [{observationYear:2024},"INSUFFICIENT_SAME_YEAR_PEERS"],
      [{error:true},"OFFICIAL_PEERS_UNAVAILABLE"],
    ] as const){
      const api=network(opts);
      const v=await scorePrivateOnDemandMacroPeers([change(indicators[0])],
        {...rights,rights_verified_driver_count:1},{fetchImpl:api.fetchImpl,now});
      expect(v.status).toBe(status);
      expect(v.peer_normalized_dimension_count).toBe(0);
      expect(v.private_component).toBeNull();
    }
  });

  it("rejects tampered annual evidence, conflicting country and unfinished annual periods before HTTP",async()=>{
    const original=change(indicators[0]);
    const {fetchImpl,calls}=network();
    for(const bad of [
      {...original,latest_annual_pct:700},
      {...original,source_observation_sha256:"a".repeat(64)},
      {...original,latest_observation_year:2026},
      {...original,country_iso3:"CHN"},
      {...original,paid_delivery_allowed:true as false},
    ]){
      const z=await scorePrivateOnDemandMacroPeers([bad],
        {...rights,rights_verified_driver_count:1},{fetchImpl,now});
      expect(z.status).toBe("INVALID_OFFICIAL_ANNUAL_EVIDENCE");
      expect(z.payment_eligible).toBe(false);
    }
    expect(calls).toHaveLength(0);
  });
});
