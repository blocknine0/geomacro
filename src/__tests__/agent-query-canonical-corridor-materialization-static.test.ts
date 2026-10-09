import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  "src/lib/agent-query-external-modules.server.ts",
  "utf8",
);
const resolver = source.slice(
  source.indexOf("export async function loadCommercialRiskObjectForAgentQuery("),
  source.indexOf("function hasPreviousPublicationChange("),
);

describe("#1827 adaptive agent canonical corridor is read-only before x402", () => {
  it("only resolves previously published canonical corridor signed objects", () => {
    expect(resolver).toContain("getLatestCompatibleCorridorRiskObjectAtOrBefore");
    expect(resolver).toContain("corridorSubjectId(");
    expect(resolver).toContain("commerciallyDeliverable(");
    expect(source).toContain("verifyCommercialRiskObjectArtifact");
  });

  it("never creates or materializes country/corridor GRO on paid availability", () => {
    expect(source).not.toContain('from "./country-risk-publisher.server"');
    expect(source).not.toContain('from "./corridor-risk-publisher.server"');
    expect(source).not.toContain("publishCountryRiskObject");
    expect(source).not.toContain("publishCorridorRiskObject");
    expect(resolver).not.toContain('delivery_profile: "PUBLIC_DEMO"');
    expect(resolver).not.toContain(".insert(");
    expect(resolver).not.toContain(".upsert(");
  });

  it("missing, expired, unsigned or unauthorized data remains a no-charge failure", () => {
    expect(resolver).toContain("return commerciallyDeliverable(");
    expect(source).toContain("verifyCommercialRiskObjectArtifact(object");
    expect(source).toContain("No payment or execution is performed here");
    expect(source).not.toContain("execution_authorized = true");
  });
});
