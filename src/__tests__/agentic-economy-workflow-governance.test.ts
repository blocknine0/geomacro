import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const WORKFLOW_ROOT = ".github/workflows";

const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function workflowFiles(path: string): string[] {
  return readdirSync(join(ROOT, path)).flatMap((name) => {
    const relative = join(path, name);
    const absolute = join(ROOT, relative);
    if (statSync(absolute).isDirectory()) return workflowFiles(relative);
    return /\.(?:yml|yaml)$/.test(name) ? [relative] : [];
  });
}

const ALL_WORKFLOWS = workflowFiles(WORKFLOW_ROOT);

describe("agentic economy workflow governance", () => {
  it("governs every workflow file, including future workflow additions, instead of a fixed allowlist", () => {
    expect(ALL_WORKFLOWS.length).toBeGreaterThan(0);
    for (const path of ALL_WORKFLOWS) {
      const source = read(path);
      for (const line of source.split("\n").filter((item) => /\buses:\s*/.test(item))) {
        expect(line, path + ": " + line).toMatch(/@[0-9a-f]{40}(?:\s|$)/);
      }
    }
  });

  it("never leaves checkout credentials persisted on any workflow", () => {
    for (const path of ALL_WORKFLOWS) {
      const source = read(path);
      if (source.includes("actions/checkout@")) {
        expect(source, path).toContain("persist-credentials: false");
      }
    }
  });

  it("keeps the canonical Bun dependency contract on workflows that install the app", () => {
    for (const path of ALL_WORKFLOWS) {
      const source = read(path);
      if (source.includes("bun install")) {
        expect(source, path).toContain("bun install --frozen-lockfile");
        expect(source, path).not.toMatch(/\bnpm ci\b|\bnpm install\b/);
      }
    }
  });

  it("requires manual candidate workflows to bind execution to the exact supplied SHA", () => {
    for (const path of ALL_WORKFLOWS) {
      const source = read(path);
      if (source.includes("inputs.candidate_sha")) {
        expect(source, path).toContain("CANDIDATE_SHA");
        expect(source, path).toContain("DISPATCH_SHA");
        expect(source, path).toContain("persist-credentials: false");
      }
    }
  });

  it("keeps known production payment rails explicitly non-authorizing and prelaunch-safe", () => {
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

    const finalAcceptance = read(".github/workflows/final-production-acceptance.yml");
    expect(finalAcceptance).toContain("production_enabled");
    expect(finalAcceptance).toContain("execution_authorized");
  });
});
