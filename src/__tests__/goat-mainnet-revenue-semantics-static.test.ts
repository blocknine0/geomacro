import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/api.goat.pilot.order.ts", "utf8");
const service = readFileSync("src/lib/goat-pilot-service.server.ts", "utf8");

describe("GOAT environment-aware commercial metadata", () => {
  it("derives 402 commercial metadata from the selected environment", () => {
    expect(route).toContain('const commercialRevenue = result.body.environment === "mainnet"');
    expect(route).toContain('"X-Geomacro-Commercial-Revenue": commercialRevenue ? "true" : "false"');
    expect(route).toContain("commercial_revenue: commercialRevenue");
  });

  it("keeps delivered evidence environment-aware", () => {
    expect(service).toContain("GOAT_FLOW_ENVIRONMENTS[pilot.environment].commercial_revenue");
    expect(service).toContain("Production settlement evidence; revenue recognition still follows Geomacro accounting/legal policy.");
  });

  it("keeps mainnet behind the explicit production gate", () => {
    expect(service).toContain("GOATX402_MAINNET_COMMERCIAL_ENABLED");
    expect(service).toContain("GOAT_MAINNET_DISABLED");
  });
});
