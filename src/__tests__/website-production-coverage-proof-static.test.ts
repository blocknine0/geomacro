import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("public production coverage proof", () => {
  it("publishes the exact current census while preserving the non-authorizing boundary", () => {
    const panel = read("src/components/production-coverage-proof.tsx");

    expect(panel).toContain("const VERIFIED_COUNTRY_COUNT = 114");
    expect(panel).toContain("const ENABLED_SOVEREIGN_DENOMINATOR = 194");
    expect(panel).toContain("const FAIL_CLOSED_COUNTRY_COUNT = 80");
    expect(panel).toContain("const QPSD_ACCEPTED_FISCAL_COUNT = 57");
    expect(panel).toContain("const PPG_ACCEPTED_FISCAL_COUNT = 57");
    expect(panel).toContain("114 sovereign countries passed the current four-module Risk Gate review census");
    expect(panel).toContain("all 194 enabled sovereign countries");
    expect(panel).toContain("80 remained fail-closed");
    expect(panel).toContain("execution_authorized=false");
    expect(panel).toContain("did not activate x402, real-money payments, Base mainnet or autonomous execution");
    expect(panel).toContain("not an all-country product guarantee");
    expect(panel).toContain("production SLA");
    expect(panel).toContain("independent security audit");
    expect(panel).toContain("mainnet-launch claim");
  });

  it("keeps the detailed census on evidence-oriented routes and off the homepage", () => {
    const shell = read("src/components/site-shell.tsx");

    expect(shell).toContain('import { ProductionCoverageProof } from "@/components/production-coverage-proof"');
    expect(shell).toContain('const PRODUCTION_EVIDENCE_ROUTES = new Set(["/risk-gate", "/research"]);');
    expect(shell).toContain("showProductionEvidence ? <ProductionCoverageProof /> : null");
    expect(shell).not.toContain('new Set(["/",');
    expect(shell).toContain("Public product live · Risk Gate controlled Private Pilot · real-money agent access fail-closed until production activation");
  });

  it("keeps machine-readable website context aligned with the same measured claim", () => {
    const llms = read("public/llms.txt");
    const coverage = read("docs/RISK_GATE_MAX_COUNTRY_COVERAGE.md");
    const launch = read("docs/PRODUCTION_GLOBAL_COVERAGE_AND_HOT_TOPICS.md");

    for (const content of [llms, coverage, launch]) {
      expect(content).toContain("114");
      expect(content).toContain("194");
      expect(content).toContain("80");
      expect(content).toContain("execution_authorized=false");
    }

    expect(llms).toContain("Base mainnet disabled pending coordinated launch");
    expect(llms).toContain("During pre-launch, all real-money provider activation remains disabled");
    expect(coverage).toContain("did not activate x402, Base mainnet, real-money settlement or autonomous execution");
    expect(launch).toContain("did not activate x402, real-money settlement or Base mainnet");
  });
});
