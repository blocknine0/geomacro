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

function stepBlock(lines: string[], index: number): string[] {
  const stepIndent = (lines[index].match(/^\s*/) ?? [""])[0].length;
  const block = [lines[index]];
  for (let i = index + 1; i < lines.length; i += 1) {
    const indent = (lines[i].match(/^\s*/) ?? [""])[0].length;
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("- ") && indent <= stepIndent) break;
    block.push(lines[i]);
  }
  return block;
}

describe("agentic economy workflow governance", () => {
  it("governs every workflow file, including future workflow additions", () => {
    expect(ALL_WORKFLOWS.length).toBeGreaterThan(0);
    for (const path of ALL_WORKFLOWS) {
      const source = read(path);
      for (const line of source.split("\n").filter((item) => /\buses:\s*/.test(item))) {
        expect(line, path + ": " + line).toMatch(/@[0-9a-f]{40}(?:\s+#.*)?\s*$/);
      }
    }
  });

  it("requires every checkout step to disable persisted Git credentials", () => {
    for (const path of ALL_WORKFLOWS) {
      const lines = read(path).split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        if (!/\buses:\s+actions\/checkout@/.test(lines[i])) continue;
        expect(
          stepBlock(lines, i).some((line) =>
            /\bpersist-credentials:\s*false\b/.test(line),
          ),
          path + ": checkout step at line " + (i + 1),
        ).toBe(true);
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
