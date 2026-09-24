import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const store = readFileSync("src/lib/risk-object-store.server.ts", "utf8");

describe("public demo Risk Object freshness", () => {
  it("filters expired country objects from PUBLIC_DEMO point-in-time reads", () => {
    expect(store).toContain('if (deliveryProfile === "PUBLIC_DEMO")');
    expect(store).toMatch(/query\s*=\s*query\.gt\(\s*"expires_at",\s*boundary\.toISOString\(\),\s*\)/);
  });

  it("filters expired corridor objects from PUBLIC_DEMO point-in-time reads", () => {
    const corridorRead = store.slice(
      store.indexOf("export async function\ngetLatestCompatibleCorridorRiskObjectAtOrBefore"),
    );
    expect(corridorRead).toMatch(
      /applyDeliveryProfileFilter\([\s\S]*?deliveryProfile,\n\s*\);[\s\S]*?if \(deliveryProfile === "PUBLIC_DEMO"\)[\s\S]*?query = query\.gt\(\s*"expires_at",\s*boundary\.toISOString\(\),\s*\)/,
    );
  });
});
