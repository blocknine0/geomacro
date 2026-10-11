import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildPrivateOnDemandMacroDrivers } from "./on-demand-private-macro-drivers.server";
import type { PrivateOfficialMacroChange } from "./on-demand-global-discovery.server";

const now=new Date("2026-10-11T12:00:00Z");
function make(indicator: PrivateOfficialMacroChange["indicator"],
    latest=3.2,prior=4.1):PrivateOfficialMacroChange {
  const country="IND",year=2025,previous=2024;
  const hash=createHash("sha256")
    .update(JSON.stringify([country,indicator,year,latest,previous,prior]),"utf8")
    .digest("hex");
  return {
    country_iso3:country,indicator,latest_observation_year:year,
    previous_observation_year:previous,
    latest_annual_pct:latest,previous_annual_pct:prior,
    annual_rate_change_percentage_points:Math.round((latest-prior)*1e5)/1e5,
    source_observation_sha256:hash,
    observation_type:"ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS",
    publisher_original_release_date_verified:false,
    derived_commercial_rights_verified:false,
    risk_score_verified:false,paid_delivery_allowed:false,
  };
}
describe("private directional macro drivers from official annual change observations",()=>{
  it("turns both macro indicator histories into deterministic, explainable structural drivers without a risk score",()=>{
    const latest=buildPrivateOnDemandMacroDrivers([
      make("FP.CPI.TOTL.ZG",3.2,4.1),
      make("NY.GDP.MKTP.KD.ZG",6.0,4.0),
    ],{now});
    expect(latest).toHaveLength(2);
    expect(latest.map(x=>x.driver)).toEqual(["inflation","real_gdp_growth"]);
    expect(latest.map(x=>x.direction)).toEqual(["DECREASING","INCREASING"]);
    for (const d of latest) {
      expect(d.country_iso3).toBe("IND");
      expect(d.latest_observation_year).toBe(2025);
      expect(d.previous_observation_year).toBe(2024);
      expect(d.cause).toContain("2024 and 2025");
      expect(d.methodology_status).toBe("DIRECTIONAL_ONLY_NOT_A_CALIBRATED_RISK_SCORE");
      expect(d.observation_type).toBe("ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS");
      expect(d.source_commercial_rights_verified).toBe(false);
      expect(d.publisher_release_date_verified).toBe(false);
      expect(d.confidence_calibrated).toBe(false);
      expect(d.score_verified).toBe(false);
      expect(d.signed).toBe(false);
      expect(d.payment_eligible).toBe(false);
    }
    expect(buildPrivateOnDemandMacroDrivers([
      make("NY.GDP.MKTP.KD.ZG",6,4),make("FP.CPI.TOTL.ZG",3.2,4.1),
    ],{now})).toEqual(latest);
  });

  it("does not equate unchanged annual rate with fresh current intelligence",()=>{
    const [d]=buildPrivateOnDemandMacroDrivers([make("FP.CPI.TOTL.ZG",4.1,4.1)],{now});
    expect(d.direction).toBe("UNCHANGED");
    expect(d.change_percentage_points).toBe(0);
    expect(d.cause).toContain("does not establish today's risk level");
    expect(d.payment_eligible).toBe(false);
  });

  it("fails closed on tampered evidence hashes or rate changes",()=>{
    const base=make("FP.CPI.TOTL.ZG");
    expect(buildPrivateOnDemandMacroDrivers([
      {...base,latest_annual_pct:99},
    ],{now})).toEqual([]);
    expect(buildPrivateOnDemandMacroDrivers([
      {...base,annual_rate_change_percentage_points:88},
    ],{now})).toEqual([]);
    expect(buildPrivateOnDemandMacroDrivers([
      {...base,source_observation_sha256:"a".repeat(64)},
    ],{now})).toEqual([]);
  });

  it("fails closed on forged commercial rights or signed/payment flags",()=>{
    const base=make("FP.CPI.TOTL.ZG");
    for(const field of ["derived_commercial_rights_verified","risk_score_verified","paid_delivery_allowed"] as const) {
      expect(buildPrivateOnDemandMacroDrivers([
        {...base,[field]:true},
      ] as PrivateOfficialMacroChange[],{now})).toEqual([]);
    }
  });

  it("rejects cross-country, duplicate, future, nonconsecutive or oversized bundles",()=>{
    const x=make("FP.CPI.TOTL.ZG"), y=make("NY.GDP.MKTP.KD.ZG");
    expect(buildPrivateOnDemandMacroDrivers([x,x],{now})).toEqual([]);
    expect(buildPrivateOnDemandMacroDrivers([x,y,x],{now})).toEqual([]);
    expect(buildPrivateOnDemandMacroDrivers([
      x,{...y,country_iso3:"CHN"},
    ],{now})).toEqual([]);
    expect(buildPrivateOnDemandMacroDrivers([
      {...x,latest_observation_year:2027},
    ],{now})).toEqual([]);
    expect(buildPrivateOnDemandMacroDrivers([
      {...x,previous_observation_year:2023},
    ],{now})).toEqual([]);
    expect(buildPrivateOnDemandMacroDrivers([
      {...x,latest_annual_pct:Number.POSITIVE_INFINITY},
    ],{now})).toEqual([]);
    expect(buildPrivateOnDemandMacroDrivers([],{now})).toEqual([]);
  });
});
