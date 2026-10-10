import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  governedMetricCategory,
  governedSourceNativeSpan,
  noaaRollingNativeWindow,
  sourceNativeMeasurementTime,
} from "../../scripts/lib/governed-source-native-time.mjs";

const UTC = new Date("2026-10-10T04:00:00.000Z");

describe("#1827 authoritative statistical source clocks, domain and zero-cost admission", () => {
  it("uses a bounded provider-native NOAA rolling window instead of September 2026 replay", () => {
    expect(noaaRollingNativeWindow({now:UTC})).toMatchObject({
      startdate:"2026-09-24", enddate:"2026-10-08",
      lookback_days:14,availability_lag_days:2,
      latest_source_native_date_is_not_published_at:true,
    });
    expect(noaaRollingNativeWindow({
      now:new Date("2027-01-02T23:55:00.000Z"),
    })).toMatchObject({startdate:"2026-12-17",enddate:"2026-12-31"});
    expect(noaaRollingNativeWindow({
      now:new Date("2028-03-02T02:00:00.000Z"),
    })).toMatchObject({startdate:"2028-02-15",enddate:"2028-02-29"});
    expect(() => noaaRollingNativeWindow({now:new Date(NaN)}))
      .toThrow("GOVERNED_NOAA_WINDOW_CLOCK_INVALID");
  });

  it("keeps source measurement timestamps native and rejects future/unparseable dates", () => {
    expect(sourceNativeMeasurementTime("2026-09-01T00:00:00.000Z",
      "noaa_ncei_cdo_api",{now:UTC})).toBe("2026-09-01T00:00:00.000Z");
    expect(sourceNativeMeasurementTime("2026-07-01T00:00:00.000Z",
      "eia_api_v2",{now:UTC})).toBe("2026-07-01T00:00:00.000Z");
    for (const nativeDate of ["",null,"today","2026-11-01T00:00:00Z",
      "2026-09-01Tnot-a-time"]) {
      expect(() => sourceNativeMeasurementTime(nativeDate,
        "noaa_ncei_cdo_api",{now:UTC}))
        .toThrow("GOVERNED_SOURCE_NATIVE_TIMESTAMP_INVALID");
    }
  });

  it("labels EIA electricity pricing MACRO context not critical-minerals disclosure", () => {
    expect(governedMetricCategory("eia_api_v2","electricity_retail_price"))
      .toBe("MACRO");
    expect(governedMetricCategory("noaa_ncei_cdo_api","noaa_tmax"))
      .toBe("MULTI_DOMAIN");
    expect(() => governedMetricCategory("eia_api_v2","critical_mineral_reserves"))
      .toThrow("GOVERNED_SOURCE_DATASET_CATEGORY_NOT_CERTIFIED");
    expect(() => governedMetricCategory("noaa_ncei_cdo_api","critical_mineral_scarcity"))
      .toThrow("GOVERNED_SOURCE_DATASET_CATEGORY_NOT_CERTIFIED");
  });

  it("keeps previously archived native July EIA measurements explicitly historical, not fresh mineral risk", () => {
    const rows=[
      {source_id:"eia_api_v2",category:"MACRO",
        signal_type:"EXTERNAL_STATISTIC",metric:"electricity_retail_price",
        observed_at:"2026-07-01T00:00:00.000Z",published_at:null,
        commercial_eligibility_status:"UNVERIFIED"},
      {source_id:"eia_api_v2",category:"MACRO",
        signal_type:"EXTERNAL_STATISTIC",metric:"electricity_retail_price",
        observed_at:"2026-06-01T00:00:00.000Z",published_at:null,
        commercial_eligibility_status:"UNVERIFIED"},
    ];
    const metadata=governedSourceNativeSpan(rows,{sourceId:"eia_api_v2",now:UTC});
    expect(metadata.earliest_source_observed_at).toBe("2026-06-01T00:00:00.000Z");
    expect(metadata.latest_source_observed_at).toBe("2026-07-01T00:00:00.000Z");
    expect(metadata.latest_native_observation_lag_days).toBeGreaterThan(90);
    expect(metadata.data_categories).toEqual(["MACRO"]);
    expect(metadata).toMatchObject({
      publisher_article_published_at_verified:false,
      current_intelligence_available:false,
      current_commercial_signal_eligible:false,
      source_data_role:"historical_or_latest_native_statistical_measurements_only",
      checked_at_is_not_source_observed_at:true,
    });
    expect(JSON.stringify(metadata)).not.toContain("CRITICAL_MINERALS");
    expect(() => governedSourceNativeSpan([
      {...rows[0],category:"CRITICAL_MINERALS"},
    ],{sourceId:"eia_api_v2",now:UTC})).toThrow(
      "GOVERNED_SOURCE_MEASUREMENT_SPAN_INVALID");
    expect(() => governedSourceNativeSpan([
      {...rows[0],published_at:UTC.toISOString()},
    ],{sourceId:"eia_api_v2",now:UTC})).toThrow(
      "GOVERNED_SOURCE_MEASUREMENT_SPAN_INVALID");
    expect(() => governedSourceNativeSpan([
      {...rows[0],commercial_eligibility_status:"COMMERCIAL_OK"},
    ],{sourceId:"eia_api_v2",now:UTC})).toThrow(
      "GOVERNED_SOURCE_MEASUREMENT_SPAN_INVALID");
  });

  it("still treats NOAA native observation as context, never new original news or a risk object", () => {
    const rows=[{
      source_id:"noaa_ncei_cdo_api",category:"MULTI_DOMAIN",
      signal_type:"EXTERNAL_STATISTIC",metric:"noaa_tmin",
      observed_at:"2026-10-07T00:00:00.000Z",published_at:null,
      commercial_eligibility_status:"UNVERIFIED",
    }];
    const m=governedSourceNativeSpan(rows,{
      sourceId:"noaa_ncei_cdo_api",now:UTC,
    });
    expect(m.latest_native_observation_lag_days).toBe(3);
    expect(m.data_categories).toEqual(["MULTI_DOMAIN"]);
    expect(m.current_intelligence_available).toBe(false);
    expect(m.current_commercial_signal_eligible).toBe(false);
    expect(m.checked_at_is_not_source_observed_at).toBe(true);
  });

  it("production preflights BOTH provider batches before B2 PUT, with no fabricated published-at", () => {
    const script=readFileSync("scripts/ingest-certified-sources.mjs","utf8");
    const workflow=readFileSync(".github/workflows/governed-source-ingestion.yml","utf8");
    const testScript=readFileSync("scripts/test-governed-source-ingestion.mjs","utf8");
    expect(script).toContain("noaaRollingNativeWindow({ now: new Date(now) })");
    expect(script).not.toContain("startdate=2026-09-01");
    expect(script).not.toContain("enddate=2026-09-02");
    expect(script).toContain('category: governedMetricCategory(source.source_id, "electricity_retail_price")');
    expect(script).toContain("GOVERNED_STATISTIC_VALUE_INVALID");
    expect(script).toContain("GOVERNED_STATISTIC_CATEGORY_MISMATCH");
    expect(script).toContain("governedSourceNativeSpan(rows, { sourceId, now: new Date(now) })");
    expect(script).toContain("GOVERNED_SOURCE_MINIMUM_B2_BUDGET_INSUFFICIENT");
    expect(script.indexOf("const sourceBatches = []"))
      .toBeLessThan(script.indexOf("const summaries = []"));
    expect(script.indexOf("const summaries = []"))
      .toBeLessThan(script.indexOf("archiveSourceBatch(sourceId, rows);"));
    expect(script).toContain("published_at: null");
    expect(script).not.toContain("published_at: now");
    expect(script).toContain("latest_source_observed_at: summary.latest_source_observed_at");
    expect(workflow).toContain("GOVERNED_NATIVE_STATISTIC_NOT_PAID_OR_CURRENT");
    expect(workflow).toContain("GOVERNED_D1_STATISTIC_SOURCE_CLOCK_OR_CATEGORY_MISMATCH");
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(testScript).toContain("GOVERNED_SOURCE_CONTRACTS");
  });
});
