import { describe, it, expect } from "vitest";
import { deriveMcsProductionChanges, verifyMcsCc0Metadata,
  loadQualifiedMcsCountryContext, loadQualifiedMcsRelease,
  summarizeQualifiedMcs195StructuralCoverage, MCS_DIGEST_SOURCE_ID }
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
  it("measures 195 real annual source eligibility candidates without fake paid country coverage",()=>{
    const rows=[row("2024","100"),row("2025","125"),
      row("2024","200","India"),row("2025","250","India"),
      row("2024","80","Atlantis"),row("2025","160","Atlantis")];
    const result=summarizeQualifiedMcs195StructuralCoverage(rows,now);
    expect(result.canonical_country_count).toBe(195);
    expect(result.country_coverage).toHaveLength(195);
    expect(result.countries_with_comparable_source).toBe(2);
    expect(result.countries_without_comparable_source).toBe(193);
    expect(result.derived_annual_series_candidates).toBe(2);
    expect(result.country_coverage.find(x=>x.iso3==="CHN")?.derived_series_count).toBe(1);
    expect(result.country_coverage.find(x=>x.iso3==="IND")?.derived_series_count).toBe(1);
    expect(result.country_coverage.find(x=>x.iso3==="USA")?.status).toBe("NO_COMPARABLE_2024_2025_SOURCE");
    expect(result.current_country_mineral_events_verified).toBe(false);
    expect(result.paid_entitlements_or_mainnet_settlements_verified).toBe(false);
    expect(result.canonical_product_preflight_per_country_not_assessed).toBe(true);
    expect(result.source_rights_grant_is_exact_scoped_dataset_only).toBe(true);
    expect(JSON.stringify(result)).not.toContain("Atlantis");
    expect(JSON.stringify(result)).not.toContain("125");
  });
  it("quarantines ambiguous duplicate country mineral rows instead of granting source availability",()=>{
    const rows=[row("2024","100"),row("2025","125"),row("2025","126")];
    const result=summarizeQualifiedMcs195StructuralCoverage(rows,now);
    expect(result.countries_with_ambiguous_rows).toBe(1);
    expect(result.country_coverage.find(x=>x.iso3==="CHN")?.status).toBe("UNVERIFIED_DUPLICATE_OR_AMBIGUOUS_ROWS");
    expect(result.countries_with_comparable_source).toBe(0);
  });

  it("derives only comparable annual changes, never raw production numbers or scores", () => {
    const result = deriveMcsProductionChanges([row("2024", "100"), row("2025", "125")], "CHN", now);
    expect(result).toHaveLength(1);
    expect(result[0].change_pct).toBe(25);
    expect(Object.keys(result[0]).sort()).toEqual(["change_pct", "commodity", "row_hashes", "series_key_hash"]);
    expect(result[0].row_hashes.every(v => /^[a-f0-9]{64}$/.test(v))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('"value":');
  });
  it("supports all 195 routing countries only when exact USGS country rows exist", () => {
    const india = [row("2024", "200", "India"), row("2025", "250", "India")];
    expect(deriveMcsProductionChanges(india, "IND", now)).toHaveLength(1);
    expect(deriveMcsProductionChanges(india, "IND", now)[0].change_pct).toBe(25);
    expect(deriveMcsProductionChanges(india, "CHN", now)).toEqual([]);
    expect(deriveMcsProductionChanges(india, "ZZZ", now)).toEqual([]);
    // Even a geopolitical label/alias in a USGS row cannot be guessed to
    // match another sovereign country without an approved exact source name.
    expect(deriveMcsProductionChanges([
      row("2024", "100", "Congo"), row("2025", "140", "Congo")
    ], "COD", now)).toEqual([]);
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
    expect(await loadQualifiedMcsCountryContext("ZZZ", { fetchImpl, now, noCache: true })).toBeNull();
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
