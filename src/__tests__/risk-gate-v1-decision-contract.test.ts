import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const V1_DECISIONS = [
  "CONTINUE",
  "REDUCE_LIMIT",
  "REQUIRE_APPROVAL",
  "PAUSE",
] as const;

const CURRENT_V1_SURFACES = [
  "README.md",
  "src/routes/risk-gate.tsx",
  "src/routes/institutional.tsx",
  "src/content/docs/03-product-surfaces.md",
  "src/content/docs/26-agent-intelligence.md",
] as const;

describe("Risk Gate v1 decision contract", () => {
  it("keeps the machine contract to the four implemented v1 decisions", () => {
    const contract = read("src/lib/risk-gate-contract.ts");

    for (const decision of V1_DECISIONS) {
      expect(contract).toContain(`| \"${decision}\"`);
    }
    expect(contract).not.toContain('| "REROUTE"');
  });

  it("keeps current v1 product surfaces aligned with the machine contract", () => {
    for (const path of CURRENT_V1_SURFACES) {
      const content = read(path);
      for (const decision of V1_DECISIONS) {
        expect(content, `${path} must expose ${decision}`).toContain(decision);
      }
    }

    const route = read("src/routes/risk-gate.tsx");
    expect(route).not.toContain('\"REROUTE\"');
    expect(route).toContain("execution_authorized = false");

    const readme = read("README.md");
    const institutional = read("src/routes/institutional.tsx");
    const surfaces = read("src/content/docs/03-product-surfaces.md");
    const agentDocs = read("src/content/docs/26-agent-intelligence.md");
    expect(readme).toContain("`REROUTE` is reserved as a future/advisory alternative");
    expect(institutional).not.toContain("PAUSE or REROUTE");
    expect(surfaces).toContain("`REROUTE` is not a current v1 machine decision");
    expect(agentDocs).toContain("`REROUTE` is not a current Risk Gate v1 machine decision");
  });

  it("keeps rerouting as a future/advisory v2 alternative rather than a v1 decision", () => {
    const v2Spec = read("docs/RISK_GATE_V2_COMMERCIAL_SPEC.md");

    expect(v2Spec).toContain("`REROUTE` is a recommendation candidate, not a separate authorization state");
    expect(v2Spec).toContain("the canonical decision remains one of the four states above");
  });
});
