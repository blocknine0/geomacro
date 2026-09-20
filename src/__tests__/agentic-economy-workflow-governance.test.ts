import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
function filesUnder(path: string): string[] {
  const absolute = join(ROOT, path);
  return readdirSync(absolute).flatMap((name) => {
    const child = join(path, name);
    return statSync(join(ROOT, child)).isDirectory()
      ? filesUnder(child)
      : /\.ya?ml$/i.test(name)
        ? [child]
        : [];
  });
}

const WORKFLOWS = filesUnder(".github/workflows").sort();

const AGENTIC_MARKERS = [
  "agentic",
  "agent-query",
  "x402",
  "goat",
  "a2a",
  "commerce",
  "coinbase",
  "circle",
  "nevermined",
  "pay-per-call",
  "marketplace",
  "testnet",
  "execution_authorized",
];

const PRELAUNCH_MARKERS = [
  "prelaunch",
  "mainnet-readiness",
  "final-nonmainnet",
  "nonmainnet",
];

const PRODUCTION_SECRET_MARKERS = [
  "OWNER_PRIVATE_KEY",
  "TREASURY_PRIVATE_KEY",
  "LIQUIDITY_PRIVATE_KEY",
  "DEPLOYER_PRIVATE_KEY",
  "GUARDIAN_PRIVATE_KEY",
  "JURY_PRIVATE_KEY",
];

function read(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

function isAgenticWorkflow(path: string, source: string) {
  const haystack = `${path}\n${source}`.toLowerCase();
  return AGENTIC_MARKERS.some((marker) => haystack.includes(marker));
}

function expectPinnedActions(path: string, source: string) {
  const externalActionLines = source
    .split("\n")
    .filter((line) => /\buses:\s+/.test(line))
    .filter((line) => !/\buses:\s+\.\//.test(line));

  expect(source, path).not.toMatch(
    /\buses:\s+[^\s]+@v\d+(?:\.\d+)*\b/,
  );

  for (const line of externalActionLines) {
    expect(line, `${path}: ${line}`).toMatch(/@[0-9a-f]{40}(?:\s|$)/);
  }
}

describe("agentic economy workflow governance", () => {
  it("auto-discovers the complete workflow surface instead of relying on a manually maintained list", () => {
    expect(WORKFLOWS.length).toBeGreaterThan(0);
    expect(WORKFLOWS.every((path) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path))).toBe(true);
  });

  it("applies immutable action provenance and credential hygiene to every agentic/commercial/testnet workflow", () => {
    for (const path of WORKFLOWS) {
      const source = read(path);
      if (!isAgenticWorkflow(path, source)) continue;

      expectPinnedActions(path, source);

      if (source.includes("actions/checkout@")) {
        expect(source, path).toContain("persist-credentials: false");
      }

      if (source.includes("bun install")) {
        expect(source, path).toContain("bun install --frozen-lockfile");
        expect(source, path).not.toMatch(/\bnpm ci\b|\bnpm install\b/);
      }
    }
  });

  it("automatically hardens newly added candidate workflows without a scope-list update", () => {
    for (const path of WORKFLOWS) {
      const source = read(path);
      if (!/inputs\.candidate_sha\b/.test(source)) continue;

      expect(source, path).toContain("CANDIDATE_SHA");
      expect(source, path).toContain("DISPATCH_SHA");
      expect(source, path).toContain("persist-credentials: false");
    }
  });

  it("keeps prelaunch/mainnet-readiness payment rails fail-closed", () => {
    for (const path of WORKFLOWS) {
      const source = read(path);
      const haystack = `${path}\n${source}`.toLowerCase();
      if (!PRELAUNCH_MARKERS.some((marker) => haystack.includes(marker))) continue;

      expect(source, path).not.toContain("I_ACCEPT_REAL_USDC");
      expect(source, path).toContain("permissions:");
      expect(source, path).toContain("contents: read");
    }
  });

  it("prevents production signing keys from entering Testnet workflow definitions", () => {
    for (const path of WORKFLOWS) {
      const source = read(path);
      const haystack = `${path}\n${source}`.toLowerCase();
      if (!haystack.includes("testnet")) continue;

      for (const marker of PRODUCTION_SECRET_MARKERS) {
        expect(source, path).not.toContain(`secrets.${marker}`);
      }
    }
  });

  it("keeps Product CI itself unable to bypass workflow-change coverage and preserves workflow ownership", () => {
    const productCi = read(".github/workflows/product-ci.yml");
    expect(productCi).toContain("'.github/workflows/**'");
    expect(productCi).toContain("src/__tests__/agentic-economy-workflow-governance.test.ts");

    const codeowners = read(".github/CODEOWNERS");
    expect(codeowners).toMatch(/^\/\.github\/workflows\/\s+@blocknine0$/m);
    expect(codeowners).toMatch(/^\/\.github\/CODEOWNERS\s+@blocknine0$/m);
  });
});
