import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/routes/pricing.tsx", "utf8");
const packageDoc = readFileSync(
  "docs/STRUCTURAL_DATA_COMMERCIAL_PACKAGE.md",
  "utf8",
);

describe("structural data commercial surface", () => {
  it("keeps commercial machine delivery governed with live mainnet access", () => {
    expect(page).toContain("API & Agents");
    expect(page).toContain("Risk Gate returns decision support only.");
    expect(page).toContain("execution_authorized: false");
    expect(page).toContain("<ApiKeysNotice />");
    expect(page).not.toContain("NewsJsonWorkbench");
    expect(page).not.toContain("<CapabilityPriceSchedule />");
    expect(page).not.toContain("bounded public structured-data digest");
  });

  it("keeps structural API/download delivery out of the public free entitlement", () => {
    expect(packageDoc).toContain("Free Explorer is a public website/dashboard experience only");
    expect(packageDoc).toContain("anonymous structured API access");
    expect(packageDoc).toContain("structured-data download/export");
    expect(packageDoc).toContain("full country or corridor structural profile payloads");
  });

  it("keeps the public overview concise and customer-controlled", () => {
    expect(page).not.toContain("ENDPOINT_COMPOSED_V0_1");
    expect(page).not.toContain("ApiEndpointDirectory");
    expect(page).toContain("your system retains all signing, approval, and execution authority");
  });

  it("preserves the methodology and source-rights boundary", () => {
    expect(page).toContain("Pricing by eligible delivery is listed in the catalog below.");
    expect(page).not.toContain("All products deliver structured Geomacro JSON.");
    expect(page).not.toContain("What every delivery includes.");
    expect(packageDoc).toContain("EVIDENCE_ONLY_NOT_IN_GRO_V02");
    expect(packageDoc).toContain("Unknown or review-required source rights fail closed");
  });
});
