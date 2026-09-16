import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const CURRENT_PUBLIC_DOCS = [
  "src/content/docs/03-product-surfaces.md",
  "src/content/docs/23-product-specific-intelligence-policies.md",
  "src/content/docs/24-access-levels-free-to-institutional.md",
  "src/content/docs/37-research-and-experimental-layers.md",
  "src/content/docs/45-current-development-roadmap.md",
  "src/content/docs/49-commercial-availability.md",
  "docs/RISK_GATE.md",
] as const;

const STALE_CURRENT_PRODUCT_MARKERS = [
  "Global Risk Index - Live",
  "Global Risk Index | LIVE",
  "## 3.2 Global Risk Index",
  "Global Risk Index and verification context",
  "## Relationship to the Global Risk Index",
] as const;

describe("public documentation risk-indices alignment", () => {
  it("does not reintroduce the historical combined GRI as a current headline product", () => {
    for (const path of CURRENT_PUBLIC_DOCS) {
      const content = read(path);
      for (const marker of STALE_CURRENT_PRODUCT_MARKERS) {
        expect(content, `${path} reintroduced stale current-product wording: ${marker}`).not.toContain(marker);
      }
    }
  });

  it("keeps the public product surface explicit about all three separate indices", () => {
    const surfaces = read("src/content/docs/03-product-surfaces.md");
    const availability = read("src/content/docs/49-commercial-availability.md");

    for (const name of [
      "Geopolitical Risk Index",
      "Macroeconomic Risk Index",
      "Critical Minerals Risk Index",
    ]) {
      expect(surfaces).toContain(name);
      expect(availability).toContain(name);
    }

    expect(surfaces).toContain("gri-v1.2.0");
    expect(surfaces).toContain("gri-proof-v1.2.0");
    expect(surfaces).toContain("Historical combined-GRI snapshots remain versioned audit records");
  });

  it("keeps Risk Gate separate from public index scores and preserves customer control", () => {
    const riskGate = read("docs/RISK_GATE.md");

    expect(riskGate).toContain("Separate Risk Indices - Live");
    expect(riskGate).toContain("does **not** apply a public Risk Index score, or the historical combined GRI, as a universal transaction rule");
    expect(riskGate).toContain("Risk Gate advisory response: CONTINUE / REDUCE_LIMIT / REQUIRE_APPROVAL / PAUSE");
    expect(riskGate).toContain("Customer identity + permissions + policy enforcement");
    expect(riskGate).toContain("Customer-controlled action");
    expect(riskGate).toContain("execution_authorized=false");
  });

  it("keeps commercialization roadmap terminology on Risk Indices while retaining GRI audit lineage", () => {
    const roadmap = read("src/content/docs/45-current-development-roadmap.md");

    expect(roadmap).toContain("Risk Indices/data reliability, audited GRI v1.2 lineage and provenance controls");
    expect(roadmap).not.toContain("complete GRI/data reliability and provenance controls");
  });
});
