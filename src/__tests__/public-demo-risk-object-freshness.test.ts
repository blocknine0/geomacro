import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const store = readFileSync("src/lib/risk-object-store.server.ts", "utf8");

describe("public demo Risk Object freshness", () => {
  it("filters expired country objects from PUBLIC_DEMO point-in-time reads", () => {
    expect(store).toContain('if (deliveryProfile === "PUBLIC_DEMO")');
    expect(store).toContain('query = query.gt("expires_at", boundary.toISOString())');
  });

  it("filters expired corridor objects from PUBLIC_DEMO point-in-time reads", () => {
    const occurrences = store.match(/query = query\.gt\(\s*"expires_at",\s*boundary\.toISOString\(\),\s*\)/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});
