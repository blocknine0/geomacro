import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function sourceFilesUnder(relativeDir: string): string[] {
  const absoluteDir = join(ROOT, relativeDir);
  const files: string[] = [];

  for (const entry of readdirSync(absoluteDir)) {
    const absolute = join(absoluteDir, entry);
    const relative = join(relativeDir, entry);
    if (statSync(absolute).isDirectory()) {
      files.push(...sourceFilesUnder(relative));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(relative);
    }
  }

  return files;
}

const CURRENT_DELIVERY_SERVICES = [
  "src/lib/risk-gate-api.server.ts",
  "src/lib/risk-gate-idempotency.server.ts",
  "src/lib/risk-gate-execution-preflight.server.ts",
  "src/lib/risk-gate-service.server.ts",
  "src/lib/corridor-risk-gate-service.server.ts",
  "src/lib/agentic-demo-service.server.ts",
  "src/lib/testnet-intelligence-capability.server.ts",
  "src/lib/a2a-service.server.ts",
  "src/lib/goat-pilot-service.server.ts",
] as const;

describe("Risk Gate v2 runtime isolation", () => {
  it("keeps current public/API routes free of experimental v2 imports", () => {
    const routeFiles = [
      ...sourceFilesUnder("src/routes"),
      ...sourceFilesUnder("server/api"),
    ];

    for (const path of routeFiles) {
      const content = read(path);
      expect(content, `${path} must not import the experimental Risk Gate v2 runtime`).not.toContain("risk-gate-v2");
      expect(content, `${path} must not execute Risk Gate v2`).not.toContain("evaluateRiskGateV2");
    }
  });

  it("keeps current machine-delivery services on the implemented v1 country/corridor boundary", () => {
    for (const path of CURRENT_DELIVERY_SERVICES) {
      const content = read(path);
      expect(content, `${path} must not import the experimental Risk Gate v2 runtime`).not.toContain("risk-gate-v2");
      expect(content, `${path} must not execute Risk Gate v2`).not.toContain("evaluateRiskGateV2");
    }

    const api = read("src/lib/risk-gate-api.server.ts");
    const machine = read("src/lib/testnet-intelligence-capability.server.ts");
    const agentic = read("src/lib/agentic-demo-service.server.ts");

    for (const content of [api, machine, agentic]) {
      expect(content).toContain("evaluateCountryRiskGate");
      expect(content).toContain("evaluateCorridorRiskGate");
    }
  });

  it("keeps v2 explicitly documented as a target build specification rather than current product truth", () => {
    const spec = read("docs/RISK_GATE_V2_COMMERCIAL_SPEC.md");

    expect(spec).toContain("This document defines the target commercial architecture for the next Risk Gate iteration");
    expect(spec).toContain("It is a build specification, not a claim that every item below is already live");
    expect(spec).toContain("Risk Gate v1 remains the current implemented Private Pilot contract");
  });
});
