import { describe, it, expect } from "vitest";
import { deriveMcsProductionChanges, verifyMcsCc0Metadata,
  loadQualifiedMcsCountryContext, loadQualifiedMcsRelease, MCS_DIGEST_SOURCE_ID }
  from "./qualified-mcs-country-digest.server";

const now = new Date("2026-10-18T00:00:00Z");
const row = (year: string, value: string, country = "China") => ({ Country: country,
  Commodity: "Lithium", Year: year, Value: value, Statistics: "Mine production",
  Statistics_detail: "Lithium content", Unit: "tons", Section: "World production",
  "Is critical mineral 2025": "Yes" });
const rights = () => ({ data: { attributes: { doi: "10.5066/p1wkq63t", publicationYear: 2026,
  publisher: "U.S. Geological Survey", state: "findable", isActive: true,
  url: "https://www.sciencebase.gov/catalog/item/696a75d5d4be0228872d3bf8",
  rightsList: [{ rightsIdentifier: "cc0-1.0", rightsIdentifierScheme: "SPDX",
    rightsUri: "https://creativecommons.org/publicdomain/zero/1.0/legalcode" }] } } });

describe("scoped original CC0 mineral structural digest", () => {
  it("derives only comparable annual changes, never raw production numbers or scores", () => {
    const result = deriveMcsProductionChanges([row("2024", "100"), row("2025", "125")], "CHN", now);
    expect(result).toHaveLength(1);
    expect(result[0].change_pct).toBe(25);
    expect(Object.keys(result[0]).sort()).toEqual(["change_pct", "commodity", "row_hashes", "series_key_hash"]);
    expect(result[0].row_hashes.every(v => /^[a-f0-9]{64}$/.test(v))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('"value":');
  });
  it("rejects foreign country, absent comparable year, zero denominator and stale annual periods", () => {
    expect(deriveMcsProductionChanges([row("2024", "100"), row("2025", "125")], "USA", now)).toEqual([]);
    expect(deriveMcsProductionChanges([row("2025", "125")], "CHN", now)).toEqual([]);
    expect(deriveMcsProductionChanges([row("2024", "0"), row("2025", "125")], "CHN", now)).toEqual([]);
    expect(deriveMcsProductionChanges([row("2024", "100"), row("2025", "125")], "CHN", new Date("2028-01-01"))).toEqual([]);
    expect(deriveMcsProductionChanges([row("2024", "100"), row("2025", "125")], "CHN", new Date("2025-01-01"))).toEqual([]);
    for (const invalid of ["", "NA", "125e", "0x10", "Infinity", "-1"])
      expect(deriveMcsProductionChanges([row("2024", "100"), row("2025", invalid)], "CHN", now)).toEqual([]);
  });
  it("does not mix units/sections or silently pick duplicate records", () => {
    expect(deriveMcsProductionChanges([row("2024", "100"), { ...row("2025", "125"), Unit: "kg" }], "CHN", now)).toEqual([]);
    expect(() => deriveMcsProductionChanges([row("2024", "100"), row("2025", "125"), row("2025", "126")], "CHN", now)).toThrow(/DUPLICATE/);
  });
  it("requires exact publisher DOI, active release and CC0 instead of broad government status", () => {
    expect(() => verifyMcsCc0Metadata(rights())).not.toThrow();
    for (const change of [{ doi: "10.5066/other" }, { publisher: "third party" }, { isActive: false },
      { rightsList: [{ rightsIdentifier: "cc-by-4.0" }] }, { rightsList: [] }, { publicationYear: 2025 }]) {
      const r = rights(); Object.assign(r.data.attributes, change);
      expect(() => verifyMcsCc0Metadata(r)).toThrow(/CC0_NOT_VERIFIED/);
    }
    expect(MCS_DIGEST_SOURCE_ID).not.toBe("usgs_mcs");
  });
  it("access denial never creates evidence, source rights or an AVAILABLE context", async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return new Response("denied", { status: 403 }); }) as typeof fetch;
    expect(await loadQualifiedMcsCountryContext("GBR", { fetchImpl, now, noCache: true })).toBeNull();
    expect(calls).toBe(0);
    expect(await loadQualifiedMcsCountryContext("USA", { fetchImpl, now, noCache: true })).toBeNull();
    expect(calls).toBe(1);
  });
  it("an authentic-looking metadata receipt cannot qualify unpinned fixture CSV bytes", async () => {
    const fetchImpl = (async (url: any) => {
      if (String(url).includes("datacite")) return Response.json(rights());
      if (String(url).includes("?format=json")) {
        const item = String(url).match(/item\/([a-f0-9]+)/)?.[1];
        return Response.json({ id: item, files: [{ name: "MCS2026_Commodities_Data.csv",
          url: "https://www.sciencebase.gov/catalog/file/get/" + item + "/MCS2026_Commodities_Data.csv" }] });
      }
      return new Response("Country,Commodity,Year,Value\nChina,Lithium,2025,125\n");
    }) as typeof fetch;
    expect(await loadQualifiedMcsRelease({ fetchImpl, now, noCache: true })).toBeNull();
  });
});
