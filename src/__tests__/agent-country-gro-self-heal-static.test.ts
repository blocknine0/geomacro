import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/agent-query-external-modules.server.ts", "utf8");
const resolver = source.slice(
  source.indexOf("export async function loadCommercialRiskObjectForAgentQuery("),
  source.indexOf("function hasPreviousPublicationChange("),
);

describe("#1827 paid and no-funds country GRO availability is strictly read-only", () => {
  it("uses previously signed canonical country objects, with independent commercial verification", () => {
    expect(resolver).toContain("resolveCountryGroAtOrBefore(");
    expect(resolver).toContain("commerciallyDeliverable(");
    expect(source).toContain("verifyCommercialRiskObjectArtifact(object");
    expect(resolver).not.toContain("delivery_profile: \"PUBLIC_DEMO\"");
  });

  it("forbids live, future and historic GRO regeneration by any external request", () => {
    expect(source).not.toContain('from "./country-risk-publisher.server"');
    expect(source).not.toContain('from "./corridor-risk-publisher.server"');
    expect(source).not.toContain("publishCountryRiskObject");
    expect(source).not.toContain("publishCorridorRiskObject");
    expect(source).not.toContain("liveSelfHealAllowed");
    expect(source).not.toContain("LIVE_COUNTRY_SELF_HEAL_MAX_CLOCK_SKEW_MS");
    expect(resolver).not.toContain(".insert(");
    expect(resolver).not.toContain(".upsert(");
  });

  it("does not create or settle payments in an availability probe", () => {
    expect(resolver).not.toContain("payment_signature");
    expect(resolver).not.toContain("execution_authorized");
    expect(resolver).not.toContain("settlement");
    expect(source).toContain("No payment or execution is performed here");
    expect(resolver).toContain("return commerciallyDeliverable(");
  });

  it("reads only existing corridor GROs, never materializing a new one", () => {
    expect(resolver).toContain("corridorSubjectId(");
    expect(resolver).toContain("getLatestCompatibleCorridorRiskObjectAtOrBefore(");
    expect(resolver).not.toContain("publishCorridorRiskObject(");
  });
});
