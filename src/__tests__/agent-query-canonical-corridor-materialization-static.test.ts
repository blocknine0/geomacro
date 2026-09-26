import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  "src/lib/agent-query-external-modules.server.ts",
  "utf8",
);

describe("adaptive agent canonical corridor materialization", () => {
  it("uses cached canonical corridor objects before materializing", () => {
    expect(source).toContain("getLatestCompatibleCorridorRiskObjectAtOrBefore");
    expect(source).toContain("if (cached) return cached");
  });

  it("materializes only CANONICAL signed corridor objects for adaptive delivery", () => {
    expect(source).toContain("publishCorridorRiskObject");
    expect(source).toContain('delivery_profile: "CANONICAL"');
    expect(source).not.toContain('delivery_profile: "PUBLIC_DEMO"');
  });

  it("keeps publication fail-closed and commercially verified", () => {
    expect(source).toContain("verifyCommercialRiskObjectArtifact");
    expect(source).toContain("catch {");
    expect(source).toContain("return null;");
    expect(source).toContain("No payment or execution is performed");
  });
});
