import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const WORKFLOW_DIR = ".github/workflows";
const AGENTIC_MARKERS =
  /(agentic|agent-query|x402|goat|coinbase|circle|nevermined|a2a|commerce|commercial|marketplace|payment|settlement|revenue|candidate|listing|provider|testnet|paid|canary)/i;

const ALL_WORKFLOWS = readdirSync(WORKFLOW_DIR)
  .filter((name) => /\.(?:yml|yaml)$/.test(name))
  .map((name) => `${WORKFLOW_DIR}/${name}`);

const read = (path: string) => readFileSync(path, "utf8");

const WORKFLOWS = ALL_WORKFLOWS.filter((path) =>
  AGENTIC_MARKERS.test(path) || AGENTIC_MARKERS.test(read(path)),
);

describe("agentic economy workflow governance", () => {
  it("automatically covers every current and future agentic/commercial workflow", () => {
    expect(WORKFLOWS.length).toBeGreaterThan(0);

    // The governance surface is discovered from the repository itself instead
    // of a hand-maintained file list, so newly-added agentic workflows cannot
    // silently bypass these invariants.
    for (const path of WORKFLOWS) {
      expect(path).toMatch(/^\.github\/workflows\/[^/]+\.(?:yml|yaml)$/);
    }
  });

  it("pins every GitHub Action used by the agentic/commercial workflow surface", () => {
    for (const path of WORKFLOWS) {
      const source = read(path);
      expect(source, path).not.toMatch(
        /uses:\s+[^\s]+@(?![0-9a-f]{40}(?:\s|$))[^\s]+/,
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
    for (const path of WORKFLOWS) {
      const source = read(path);
      if (source.includes("inputs.candidate_sha")) {
        expect(source, path).toContain("CANDIDATE_SHA");
        expect(source, path).toContain("DISPATCH_SHA");
        if (source.includes("actions/checkout@")) {
          expect(source, path).toContain("persist-credentials: false");
        }
      }
    }
  });

  it("keeps production payment rails explicitly non-authorizing and prelaunch-safe", () => {
    const paymentRails = WORKFLOWS.filter((path) => {
      const source = read(path);
      return /(x402|payment|settlement|coinbase|circle|nevermined)/i.test(path) ||
        /(x402|payment|settlement|coinbase|circle|nevermined)/i.test(source);
    });

    for (const path of paymentRails) {
      const source = read(path);
      const isFinalProductionAcceptance =
        path.endsWith("/final-production-acceptance.yml");

      if (!isFinalProductionAcceptance) {
        expect(source, path).not.toMatch(
          /^(?:\s*(?:export\s+)?)?(?:COINBASE_X402_MAINNET_ACK|GEOMACRO_COMMERCIAL_LAUNCH_ACK)\s*[:=]\s*I_ACCEPT_REAL_USDC\b/m,
        );
      }
    }

    const finalAcceptance = read(
      ".github/workflows/final-production-acceptance.yml",
    );
    expect(finalAcceptance).toContain("GEOMACRO_PRODUCTION_ACCEPTANCE_SHA");
    expect(finalAcceptance).toContain("DISPATCH_SHA");
  });

  it("makes workflow changes invoke Product CI so workflow edits cannot bypass product tests", () => {
    const productCi = read(".github/workflows/product-ci.yml");
    const pullRequestBlock = productCi.split("  push:")[0];
    expect(pullRequestBlock).toContain("'.github/workflows/**'");
    expect(productCi).toContain("uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1");
    expect(productCi).toContain("persist-credentials: false");
  });
});
