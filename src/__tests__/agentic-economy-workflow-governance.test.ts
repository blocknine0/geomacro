import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const WORKFLOW_DIR = ".github/workflows";
const AGENTIC_PATH_RE = /agent|x402|goat|coinbase|circle|nevermined|a2a|commerce|commercial|marketplace|risk-gate|risk.?object|testnet/i;
const read = (path: string) => readFileSync(path, "utf8");

function workflowFiles(): string[] {
  return readdirSync(WORKFLOW_DIR)
    .filter((name) => /\.ya?ml$/i.test(name))
    .map((name) => `${WORKFLOW_DIR}/${name}`);
}

function changedWorkflowFiles(): string[] {
  const base = process.env.WORKFLOW_GOVERNANCE_BASE_SHA?.trim();
  if (!base || !/^[0-9a-f]{40}$/i.test(base)) return [];

  const output = execFileSync(
    "git",
    ["diff", "--name-only", `${base}...HEAD`, "--", WORKFLOW_DIR],
    { encoding: "utf8" },
  );

  return output
    .split("\n")
    .map((path) => path.trim())
    .filter((path) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path));
}

function governanceTargets(): string[] {
  const all = workflowFiles();
  const changed = new Set(changedWorkflowFiles());
  return all.filter((path) => changed.has(path) || AGENTIC_PATH_RE.test(path));
}

function expectPinnedActions(path: string) {
  const source = read(path);
  const usesLines = source
    .split("\n")
    .filter((line) => /^\s*uses:\s*\S+/.test(line));

  for (const line of usesLines) {
    const target = line.match(/^\s*uses:\s*(\S+)/)?.[1] ?? "";
    if (target.startsWith("./")) continue;
    expect(line, `${path}: ${line}`).toMatch(/@[0-9a-f]{40}(?:\s|$)/i);
  }

  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*uses:\s*actions\/checkout@/i.test(lines[i])) continue;
    const window = lines.slice(i, Math.min(lines.length, i + 10)).join("\n");
    expect(window, path).toContain("persist-credentials: false");
  }
}

describe("agentic economy recurrence prevention", () => {
  it("governs every agentic/commercial workflow and every workflow changed by the current revision", () => {
    const targets = governanceTargets();
    expect(targets.length, "workflow governance must never run with an empty target set").toBeGreaterThan(0);

    for (const path of targets) {
      expectPinnedActions(path);

      const source = read(path);
      if (/\bbun install\b/.test(source)) {
        expect(source, path).toContain("bun install --frozen-lockfile");
        expect(source, path).not.toMatch(/\bnpm ci\b|\bnpm install\b/);
      }
    }
  });

  it("keeps Product CI itself inside the workflow-change protection path", () => {
    const source = read(".github/workflows/product-ci.yml");
    expect(source).toContain("'.github/workflows/**'");
    expectPinnedActions(".github/workflows/product-ci.yml");
  });

  it("keeps the known manual acceptance path bound to the exact candidate SHA", () => {
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

  it("keeps production payment rails explicitly prelaunch and non-authorizing", () => {
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
