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
  const lines = source.split("\n");
  const externalActionLines = lines
    .filter((line) => /\buses:\s+/.test(line))
    .filter((line) => !/\buses:\s+\.\//.test(line));

  expect(source, path).not.toMatch(
    /\buses:\s+[^\s]+@v\d+(?:\.\d+)*\b/,
  );

  for (const line of externalActionLines) {
    expect(line, `${path}: ${line}`).toMatch(/@[0-9a-f]{40}(?:\s|$)/);
  }

  lines.forEach((line, index) => {
    if (!/\buses:\s+actions\/checkout@/.test(line)) return;

    const block = lines.slice(index, Math.min(lines.length, index + 8));
    const nextStep = block.slice(1).findIndex((item) =>
      /^\s*- (?:name:|uses:)/.test(item),
    );
    const checkoutBlock =
      nextStep >= 0 ? block.slice(0, nextStep + 1) : block;

    expect(
      checkoutBlock.some((item) => item.includes("persist-credentials: false")),
      `${path}: checkout at line ${index + 1} must disable credential persistence`,
    ).toBe(true);
  });
}

describe("agentic economy workflow governance", () => {
  it("auto-discovers the complete workflow surface instead of relying on a manually maintained list", () => {
    expect(WORKFLOWS.length).toBeGreaterThan(0);
    expect(WORKFLOWS.every((path) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path))).toBe(true);
  });

  it("applies immutable action provenance and credential hygiene to every dynamically discovered agentic/commercial/testnet workflow", () => {
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
      const checksCandidateByRef = /ref:\s+\$\{\{\s*(?:inputs\.candidate_sha|env\.CANDIDATE_SHA)\s*\}\}/.test(source);
      const checksCandidateAgainstDispatch =
        source.includes("DISPATCH_SHA") &&
        /CANDIDATE_SHA.*DISPATCH_SHA|DISPATCH_SHA.*CANDIDATE_SHA/.test(source);
      expect(
        checksCandidateByRef || checksCandidateAgainstDispatch,
        path,
      ).toBe(true);
      expect(source, path).toContain("persist-credentials: false");
    }
  });

  it("keeps prelaunch/mainnet-readiness payment rails fail-closed", () => {
    for (const path of WORKFLOWS) {
      const source = read(path);
      const haystack = `${path}\n${source}`.toLowerCase();
      if (!PRELAUNCH_MARKERS.some((marker) => haystack.includes(marker))) continue;

      expect(source, path).not.toMatch(
        /^\s*[A-Z0-9_]*(?:MAINNET|REAL_USDC|LAUNCH_ACK)[A-Z0-9_]*\s*[:=]\s*.*I_ACCEPT_REAL_USDC\b/m,
      );
      expect(source, path).toContain("permissions:");
      expect(source, path).toContain("contents: read");
    }
  });

  it("requires explicit target and branch guards when Testnet workflows use privileged production key domains", () => {
    for (const path of WORKFLOWS) {
      const source = read(path);
      const haystack = `${path}\n${source}`.toLowerCase();
      if (!haystack.includes("testnet")) continue;

      const usesPrivilegedKey = PRODUCTION_SECRET_MARKERS.some((marker) =>
        source.includes(`secrets.${marker}`),
      );
      if (!usesPrivilegedKey) continue;

      expect(source, path).toContain("permissions:");
      expect(source, path).toContain("contents: read");

      if (haystack.includes("arc") && haystack.includes("testnet")) {
        expect(source, path).toContain("verify-arc-testnet-target.mjs");
        expect(source, path).toContain("assert-authoritative-supabase.mjs");
        expect(source, path).toContain("if: github.ref == 'refs/heads/main'");
      } else if (source.includes("BASE_SEPOLIA_RPC_URL")) {
        expect(source, path).toContain("environment: geomacro-testnet-e2e");
        expect(source, path).toContain("BASE_SEPOLIA_RPC_URL: https://sepolia.base.org");
        expect(source, path).toContain("cancel-in-progress: false");
        expect(source, path).toContain("if: github.repository == 'blocknine0/geomacro'");
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
