import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const STATE_CHANGING = [
  ".github/workflows/security-monitor.yml",
  ".github/workflows/auto-create-markets.yml",
  ".github/workflows/market-lifecycle.yml",
  ".github/workflows/auto-recovery.yml",
];

const READ_WRITE_INDEXERS = [
  ".github/workflows/market-lifecycle.yml",
];

const ADMIN_VERIFY_ONLY = [
  ".github/workflows/propose-v2-upgrade.yml",
  ".github/workflows/execute-v2-upgrade.yml",
  ".github/workflows/fund-v2-liquidity.yml",
];

function expectPinnedActions(path: string) {
  const source = read(path);
  expect(source, path).not.toMatch(/uses:\s+[^\s]+@v\d+(?:\.\d+)*\b/);
  for (const line of source.split("\n").filter((item) => item.includes("uses:"))) {
    expect(line, `${path}: ${line}`).toMatch(/@[0-9a-f]{40}(?:\s|$)/);
  }
  if (source.includes("actions/checkout@")) {
    expect(source, path).toContain("persist-credentials: false");
  }
}

function isPaused(source: string) {
  return source.includes("if: ${{ false }}");
}

function expectPredictionMarketPaused(path: string) {
  const source = read(path);
  expect(source, path).toContain("workflow_dispatch");
  expect(source, path).not.toContain("schedule:");
  expect(source, path).toContain("permissions:\n  contents: read");
  expect(source, path).toContain("if: ${{ false }}");
  expect(source, path).not.toMatch(/secrets\.(?:OWNER|GUARDIAN|JURY|TREASURY|LIQUIDITY|DEPLOYER)_PRIVATE_KEY/);
  expectPinnedActions(path);
}

function jobBlock(source: string, name: string) {
  const header = `  ${name}:\n`;
  const start = source.indexOf(header);
  if (start < 0) return "";
  const boundary = /^  [A-Za-z0-9_-]+:\n/gm;
  let next = boundary.exec(source);
  while (next && next.index <= start) next = boundary.exec(source);
  return source.slice(start, next ? next.index : source.length);
}

describe("onchain signing isolation", () => {
  it("hardens state-changing Arc workflows before credentials are exposed", () => {
    for (const path of STATE_CHANGING) {
      const source = read(path);
      if (isPaused(source)) {
        expectPredictionMarketPaused(path);
        continue;
      }
      expect(source, path).toContain("permissions:\n  contents: read");
      expectPinnedActions(path);
      expect(source, path).not.toMatch(/\bnpm install\b/);
      const blocks = path === ".github/workflows/market-lifecycle.yml"
        ? ["finalize-markets", "resolve-markets", "resolve-disputes"].map((name) => jobBlock(source, name))
        : [source];
      for (const block of blocks) {
        expect(block, path).not.toBe("");
        expect(block, path).toContain("github.ref == 'refs/heads/main'");
        expect(block, path).toContain("verify-arc-testnet-target.mjs");
        expect(block, path).toContain("assert-authoritative-supabase.mjs");
      }
    }
  });

  it("serializes every active signing trust domain and keeps paused domains inert", () => {
    for (const path of [
      ".github/workflows/auto-create-markets.yml",
      ".github/workflows/market-lifecycle.yml",
      ".github/workflows/auto-recovery.yml",
      ".github/workflows/security-monitor.yml",
    ]) {
      const source = read(path);
      if (isPaused(source)) {
        expectPredictionMarketPaused(path);
        continue;
      }
      expect(source, path).toContain("cancel-in-progress: false");
      if (path === ".github/workflows/security-monitor.yml") {
        expect(source, path).toContain("group: arc-guardian-wallet-state-change");
      } else {
        expect(source, path).toContain("group: arc-owner-wallet-state-change");
      }
    }
  });

  it("keeps lifecycle and stake indexers read-only onchain and fail-closed on targets", () => {
    for (const path of READ_WRITE_INDEXERS) {
      const source = read(path);
      if (isPaused(source)) {
        expectPredictionMarketPaused(path);
        continue;
      }
      expect(source, path).toContain("permissions:\n  contents: read");
      expectPinnedActions(path);
      const blocks = ["sync-lifecycle", "sync-stakes"].map((name) => jobBlock(source, name));
      for (const block of blocks) {
        expect(block, path).not.toBe("");
        expect(block, path).toContain("github.ref == 'refs/heads/main'");
        expect(block, path).toContain("verify-arc-testnet-target.mjs");
        expect(block, path).toContain("assert-authoritative-supabase.mjs");
        expect(block, path).not.toMatch(/secrets\.(?:OWNER|GUARDIAN|JURY|TREASURY|LIQUIDITY|DEPLOYER)_PRIVATE_KEY/);
      }
    }
  });

  it("removes rare admin signing keys and transaction paths from hosted CI", () => {
    for (const path of ADMIN_VERIFY_ONLY) {
      const source = read(path);
      expect(source, path).toContain("permissions:\n  contents: read");
      expect(source, path).toContain("if: github.ref == 'refs/heads/main'");
      expectPinnedActions(path);
      expect(source, path).not.toMatch(
        /secrets\.(?:TREASURY_PRIVATE_KEY_1|TREASURY_PRIVATE_KEY_2|OWNER_PRIVATE_KEY|LIQUIDITY_PRIVATE_KEY|DEPLOYER_PRIVATE_KEY)\b/,
      );
      expect(source, path).not.toMatch(/\bnpm install\b/);
    }

    expect(read(".github/workflows/propose-v2-upgrade.yml")).toContain(
      "VERIFY_MODE: candidate",
    );
    expect(read(".github/workflows/execute-v2-upgrade.yml")).toContain(
      "VERIFY_MODE: execution-readiness",
    );
    expect(read(".github/workflows/fund-v2-liquidity.yml")).toContain(
      "Verify V2 economics before offline/manual funding",
    );
  });

  it("uses typed recovery actions when recovery is enabled and no actions while paused", () => {
    const source = read(".github/workflows/auto-recovery.yml");
    if (isPaused(source)) {
      expectPredictionMarketPaused(".github/workflows/auto-recovery.yml");
      expect(source).not.toContain("scripts/sync-stakes.js");
      expect(source).not.toContain("scripts/resolve-markets.js");
      return;
    }
    expect(source).toContain("type: choice");
    expect(source).toContain("- sync-stakes");
    expect(source).toContain("- resolve-markets");
    expect(source).toContain("- create-markets");
  });

  it("keeps technical-proof briefings manual-only or fully paused", () => {
    const path = ".github/workflows/Auto-generate-briefings.yml";
    const source = read(path);
    if (isPaused(source)) {
      expectPredictionMarketPaused(path);
      expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(source).not.toContain("bun scripts/generate-briefings.js");
      return;
    }
    expect(source).toContain("workflow_dispatch: {}");
    expect(source).not.toContain("schedule:");
    expect(source).toContain("permissions:\n  contents: read");
    expect(source).toContain("if: github.ref == 'refs/heads/main'");
    expect(source).toContain("assert-authoritative-supabase.mjs");
    expectPinnedActions(path);
  });
});
