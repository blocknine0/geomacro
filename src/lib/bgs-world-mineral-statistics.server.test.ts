import { describe, expect, it, vi } from "vitest";
import {
  buildBgsWorldMineralStatisticsUrl,
  deriveBgsMineralProductionHistory,
  fetchBgsMineralProductionHistory,
} from "./bgs-world-mineral-statistics.server";
import { discoverOnDemandForPrivateQualification, requestsHistoricalMineralData } from "./on-demand-global-discovery.server";

const payload = {
  type: "FeatureCollection",
  features: [
    { properties: { country_iso3_code: "GBR", erml_commodity: "Lithium", bgs_statistic_type_trans: "Mine production", bgs_sub_commodity_trans: "Lithium content", quantity: 10, units: "tonnes", year: "2022" } },
    { properties: { country_iso3_code: "GBR", erml_commodity: "Lithium", bgs_statistic_type_trans: "Mine production", bgs_sub_commodity_trans: "Lithium content", quantity: 8, units: "tonnes", year: "2021" } },
    { properties: { country_iso3_code: "GBR", erml_commodity: "Lithium", bgs_statistic_type_trans: "Imports", bgs_sub_commodity_trans: "Lithium content", quantity: 999, units: "tonnes", year: "2022" } },
    { properties: { country_iso3_code: "USA", erml_commodity: "Lithium", bgs_statistic_type_trans: "Mine production", bgs_sub_commodity_trans: "Lithium content", quantity: 100, units: "tonnes", year: "2022" } },
  ],
};

describe("BGS historical mineral data path", () => {
  it("builds only fixed ISO3 and allowlisted commodity queries", () => {
    const url = buildBgsWorldMineralStatisticsUrl("GBR", "lithium");
    expect(url?.origin).toBe("https://ogcapi.bgs.ac.uk");
    expect(url?.pathname).toBe("/collections/world-mineral-statistics/items");
    expect(url?.searchParams.get("limit")).toBe("100");
    expect(url?.searchParams.get("sortby")).toBe("-year");
    expect(url?.searchParams.get("filter")).toBe("country_iso3_code = GBR AND erml_commodity LIKE 'Lithium'");
    expect(buildBgsWorldMineralStatisticsUrl("GBR", "lithium' OR 1=1")).toBeNull();
    expect(buildBgsWorldMineralStatisticsUrl("GBR.evil", "lithium")).toBeNull();
  });

  it("turns raw rows into bounded latest/prior production metrics, without returning the raw table", () => {
    const answer = deriveBgsMineralProductionHistory(payload, "GBR", "lithium");
    expect(answer).toMatchObject({
      schema: "geomacro.mineral-production-history.v1",
      status: "HISTORICAL_DATA_DERIVED",
      country_iso3: "GBR",
      commodity: "lithium",
      observation_period: { first_year: 2021, latest_year: 2022 },
      series: [{
        sub_commodity: "Lithium content",
        unit: "tonnes",
        latest: { year: 2022, value: 10 },
        previous: { year: 2021, value: 8 },
        absolute_change: 2,
        percentage_change: 25,
        direction: "up",
      }],
      delivery: {
        raw_upstream_delivered: false,
        raw_response_persisted: false,
        commercial_rights_verified: false,
        signed: false,
        chargeable: false,
      },
    });
    const serialized = JSON.stringify(answer);
    expect(serialized).not.toContain("FeatureCollection");
    expect(serialized).not.toContain("Imports");
    expect(serialized).not.toContain("999");
    expect(serialized).not.toContain("erml_commodity");
  });

  it("rejects malformed, future, wrong-country, wrong-commodity and non-production rows", () => {
    expect(deriveBgsMineralProductionHistory({ features: [{ properties: { country_iso3_code: "GBR", erml_commodity: "Lithium", bgs_statistic_type_trans: "Imports", year: "2022", quantity: 4, units: "tonnes" } }] }, "GBR", "lithium")).toBeNull();
    expect(deriveBgsMineralProductionHistory({ features: [{ properties: { country_iso3_code: "GBR", erml_commodity: "Lithium", bgs_statistic_type_trans: "Production", year: "2023", quantity: 4, units: "tonnes" } }] }, "GBR", "lithium")).toBeNull();
    expect(deriveBgsMineralProductionHistory({ features: [{ properties: { country_iso3_code: "USA", erml_commodity: "Lithium", bgs_statistic_type_trans: "Production", year: "2022", quantity: 4, units: "tonnes" } }] }, "GBR", "lithium")).toBeNull();
    expect(deriveBgsMineralProductionHistory({ nope: true }, "GBR", "lithium")).toBeNull();
  });

  it("fetches once with manual redirects and enforces the endpoint response contract", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/geo+json" },
      }));
    const answer = await fetchBgsMineralProductionHistory("GBR", "lithium", fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe("manual");
    expect(answer?.series[0]?.percentage_change).toBe(25);
    await expect(fetchBgsMineralProductionHistory("GBR", "lithium", vi.fn(async () =>
      new Response("redirect", { status: 302, headers: { location: "https://example.com" } })) as typeof fetch)).rejects.toThrow("UPSTREAM_REDIRECT_REJECTED");
  });

  it("uses exactly one private BGS request for explicit historical mineral queries", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/geo+json" },
    }));
    const result = await discoverOnDemandForPrivateQualification({
      country_iso3: "GBR",
      categories: ["rare_earth"],
      mineral: "lithium",
      topics: ["critical_minerals"],
      include_historical_mineral_data: true,
    }, { fetchImpl: fetcher as typeof fetch, now: new Date("2026-10-29T12:00:00Z") });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("ogcapi.bgs.ac.uk/collections/world-mineral-statistics/items");
    expect(result.private_mineral_history?.series[0]?.absolute_change).toBe(2);
    expect(result.discovery.source_probes).toContainEqual(expect.objectContaining({
      family: "bgs_world_mineral_statistics",
      category: "rare_earth",
      reachable: true,
    }));
  });

  it("routes only historical/mineral-statistics questions to the annual dataset lane", () => {
    expect(requestsHistoricalMineralData("Show lithium production history")).toBe(true);
    expect(requestsHistoricalMineralData("How much lithium was produced annually?")).toBe(true);
    expect(requestsHistoricalMineralData("What happened to lithium exports this week?")).toBe(false);
  });
});
