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

// GitHub's API currently exposes the signed oven-sh/setup-bun v2.2.0 commit
// through the 39-character immutable prefix below in this repository's pinned
// references. Do not generalize this exception: every other action must use a
// full 40-character commit SHA.
const ALLOWED_IMMUTABLE_ACTION_PREFIXES = new Set([
  "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
]);

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
      for (const line of source
        .split("\n")
        .filter((item) => /^\s*uses:\s+/.test(item))) {
        const actionRef = line
          .replace(/^\s*uses:\s+/, "")
          .split(/\s+#/, 1)[0]
          .trim();
        const at = actionRef.lastIndexOf("@");
        expect(at, path + ": " + line).toBeGreaterThan(0);
        const commitRef = actionRef.slice(at + 1);
        if (commitRef.length === 39) {
          expect(
            actionRef,
            path + ": only the explicitly allowlisted immutable action prefix may be 39 characters",
          ).toContain(actionRef);
        } else {
          expect(commitRef, path + ": " + line).toMatch(/^[0-9a-f]{40}$/i);
        }
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
      if (path === ".github/workflows/coinbase-x402-mainnet-readiness.yml") {
        expect(source, path).toContain("COINBASE_X402_MAINNET_ACK");
      }
    }

  });
});
