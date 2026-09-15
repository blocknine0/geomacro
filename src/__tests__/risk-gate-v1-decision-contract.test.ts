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

describe("Risk Gate v1 decision contract", () => {
  it("keeps the machine contract to the four implemented v1 decisions", () => {
    const contract = read("src/lib/risk-gate-contract.ts");

    for (const decision of V1_DECISIONS) {
      expect(contract).toContain(`| \"${decision}\"`);
    }
    expect(contract).not.toContain('| "REROUTE"');
  });

  it("keeps the current Risk Gate product page aligned with the v1 machine contract", () => {
    const route = read("src/routes/risk-gate.tsx");

    for (const decision of V1_DECISIONS) {
      expect(route).toContain(`\"${decision}\"`);
    }
    expect(route).not.toContain('\"REROUTE\"');
    expect(route).toContain("execution_authorized = false");
  });

  it("keeps rerouting as a future/advisory v2 alternative rather than a v1 decision", () => {
    const v2Spec = read("docs/RISK_GATE_V2_COMMERCIAL_SPEC.md");

    expect(v2Spec).toContain("`REROUTE` is a recommendation candidate, not a separate authorization state");
    expect(v2Spec).toContain("the canonical decision remains one of the four states above");
  });
});
