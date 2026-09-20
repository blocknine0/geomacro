import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const WORKFLOWS = [
  ".github/workflows/product-ci.yml",
  ".github/workflows/agent-query-production-readiness.yml",
  ".github/workflows/coinbase-x402-adaptive-base-sepolia-paid-e2e.yml",
  ".github/workflows/coinbase-x402-base-sepolia-acceptance.yml",
  ".github/workflows/coinbase-x402-mainnet-readiness.yml",
  ".github/workflows/circle-x402-prelaunch-readiness.yml",
  ".github/workflows/nevermined-x402-sandbox-acceptance.yml",
  ".github/workflows/goat-testnet3-provider-dry-run.yml",
  ".github/workflows/goat-testnet3-local-paid-e2e.yml",
  ".github/workflows/goat-testnet3-paid-artifact-replay.yml",
  ".github/workflows/goat-testnet3-reconcile-existing.yml",
  ".github/workflows/goat-testnet3-local-paid-readiness.yml",
  ".github/workflows/goat-acceptance-windows.yml",
  ".github/workflows/commercial-coordinated-launch-preflight.yml",
  ".github/workflows/commercial-release-candidate-evidence.yml",
  ".github/workflows/commercial-release-candidate-freeze.yml",
  ".github/workflows/final-nonmainnet-launch-acceptance.yml",
  ".github/workflows/final-production-acceptance.yml",
  ".github/workflows/marketplace-listing-observation.yml",
  ".github/workflows/marketplace-submission-evidence.yml",
  ".github/workflows/post-listing-health.yml",
  ".github/workflows/production-canary-cohort-acceptance.yml",
  ".github/workflows/production-provider-canary.yml",
  ".github/workflows/external-production-revenue-proof.yml",
  ".github/workflows/commerce-freeze-quarantine-drill.yml",
  ".github/workflows/commerce-safety-drill-acceptance.yml",
  ".github/workflows/public-production-prelisting-health.yml",
];

const read = (path: string) => readFileSync(path, "utf8");

describe("agentic economy workflow governance", () => {
  it("pins every GitHub Action used by the agentic/commercial workflow surface", () => {
    for (const path of WORKFLOWS) {
      const source = read(path);
      expect(source, path).not.toMatch(
        /uses:\s+[^\s]+@v\d+(?:\.\d+)*\b/,
      );
      for (const line of source
        .split("\n")
        .filter((item) => item.includes("uses:"))) {
        expect(line, path).toMatch(/@[0-9a-f]{40}(?:\s|$)/);
      }
    }
  });

  it("never leaves checkout credentials persisted on the agentic/commercial workflow surface", () => {
    for (const path of WORKFLOWS) {
      const source = read(path);
      if (source.includes("actions/checkout@")) {
        expect(source, path).toContain("persist-credentials: false");
      }
    }
  });

  it("keeps the canonical Bun dependency contract on workflows that install the app", () => {
    for (const path of WORKFLOWS) {
      const source = read(path);
      if (source.includes("bun install")) {
        expect(source, path).toContain("bun install --frozen-lockfile");
        expect(source, path).not.toMatch(/\bnpm ci\b|\bnpm install\b/);
      }
    }
  });

  it("requires manual candidate workflows to bind execution to the exact supplied SHA", () => {
    for (const path of [
      ".github/workflows/commerce-freeze-quarantine-drill.yml",
      ".github/workflows/commerce-safety-drill-acceptance.yml",
      ".github/workflows/marketplace-listing-observation.yml",
      ".github/workflows/marketplace-submission-evidence.yml",
      ".github/workflows/final-production-acceptance.yml",
    ]) {
      const source = read(path);
      expect(source, path).toContain("inputs.candidate_sha");
      expect(source, path).toContain("CANDIDATE_SHA");
      expect(source, path).toContain("DISPATCH_SHA");
      expect(source, path).toContain("persist-credentials: false");
    }
  });

  it("keeps every production payment rail explicitly non-authorizing and prelaunch-safe", () => {
    for (const path of [
      ".github/workflows/coinbase-x402-mainnet-readiness.yml",
      ".github/workflows/circle-x402-prelaunch-readiness.yml",
      ".github/workflows/nevermined-x402-sandbox-acceptance.yml",
      ".github/workflows/commercial-coordinated-launch-preflight.yml",
      ".github/workflows/final-nonmainnet-launch-acceptance.yml",
    ]) {
      const source = read(path);
      expect(source, path).toContain("contents: read");
      expect(source, path).not.toContain("I_ACCEPT_REAL_USDC");
    }

    const finalAcceptance = read(
      ".github/workflows/final-production-acceptance.yml",
    );
    expect(finalAcceptance).toContain("production_enabled");
    expect(finalAcceptance).toContain("execution_authorized");
  });
});
