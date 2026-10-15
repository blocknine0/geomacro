import { describe, expect, it } from "vitest";
import { verifiedStructuralCountryProfileRows } from "./b2-structural.server";

const row = (country_iso3: string | null) => ({
  observation_id: "original-row-1",
  source_id: "certified_official_structural_source",
  dimension: "macro_monetary",
  metric: "official_annual_metric",
  normalized_hash: "a".repeat(64),
  country_iso3,
  partner_country_iso3: null,
});

describe("B2 governed structural profile exact country binding", () => {
  it("accepts real-shape observations only under the correct ISO3", () => {
    expect(verifiedStructuralCountryProfileRows("USA", [row("USA")])).toBe(true);
  });
  it("rejects foreign-country observations in an otherwise signed-looking country profile", () => {
    expect(verifiedStructuralCountryProfileRows("USA", [row("USA"), row("CHN")])).toBe(false);
    expect(verifiedStructuralCountryProfileRows("USA", [row("CHN")])).toBe(false);
  });
  it("rejects countryless, malformed and invalid-hash observations", () => {
    expect(verifiedStructuralCountryProfileRows("USA", [row(null)])).toBe(false);
    expect(verifiedStructuralCountryProfileRows("US", [row("USA")])).toBe(false);
    expect(verifiedStructuralCountryProfileRows("USA", [{...row("USA"), normalized_hash: "a"}])).toBe(false);
    expect(verifiedStructuralCountryProfileRows("USA", null)).toBe(false);
    expect(verifiedStructuralCountryProfileRows("USA", Array.from({length:251},()=>row("USA")))).toBe(false);
  });
});
