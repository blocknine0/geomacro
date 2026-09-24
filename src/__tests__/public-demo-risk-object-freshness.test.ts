import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const store = readFileSync("src/lib/risk-object-store.server.ts", "utf8");

describe("public demo Risk Object freshness", () => {
  it("filters expired country objects from PUBLIC_DEMO point-in-time reads", () => {
    const countryRead = store.slice(
      store.indexOf("export async function\ngetLatestCompatibleCountryRiskObjectAtOrBefore"),
      store.indexOf("export async function\ngetRiskObjectByObjectId"),
    );
    expect(countryRead).toMatch(
      /if \(deliveryProfile === "PUBLIC_DEMO"\)[\s\S]*?query = query\.gt\(\s*"expires_at",\s*boundary\.toISOString\(\),\s*\)/,
    );
  });

  it("does not reference a point-in-time boundary in the non-point-in-time country reader", () => {
    const countryLatestRead = store.slice(
      store.indexOf("export async function\ngetLatestCompatibleCountryRiskObject("),
      store.indexOf("export async function\ngetLatestCompatibleCountryRiskObjectAtOrBefore"),
    );
    expect(countryLatestRead).not.toContain("boundary.toISOString()");
  });

  it("filters expired corridor objects from PUBLIC_DEMO point-in-time reads", () => {
    const corridorRead = store.slice(
      store.indexOf("export async function\ngetLatestCompatibleCorridorRiskObjectAtOrBefore"),
    );
    expect(corridorRead).toMatch(
      /if \(deliveryProfile === "PUBLIC_DEMO"\)[\s\S]*?query = query\.gt\(\s*"expires_at",\s*boundary\.toISOString\(\),\s*\)/,
    );
  });
});
