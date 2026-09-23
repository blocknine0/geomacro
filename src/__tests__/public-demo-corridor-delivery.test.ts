import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publisher = readFileSync("src/lib/corridor-risk-publisher.server.ts", "utf8");
const service = readFileSync("src/lib/agentic-demo-service.server.ts", "utf8");

describe("public demo corridor delivery", () => {
  it("uses the requested delivery profile for country endpoints", () => {
    expect(publisher).not.toContain("corridorCountrySourceDeliveryProfile");
    expect(publisher).toContain(
      "getLatestCompatibleCountryRiskObjectAtOrBefore(",
    );
    expect(publisher).toContain(
      "        deliveryProfile,",
    );
  });

  it("verifies corridor endpoint sources as public signed objects in the public sandbox", () => {
    expect(service).toContain("verifyPublicRiskObjectArtifact(endpointObject)");
    expect(service).not.toContain(
      "verifyCommercialRiskObjectArtifact(endpointObject)",
    );
  });
});
