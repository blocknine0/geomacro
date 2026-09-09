import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const STATE_CHANGING = [
  ".github/workflows/security-monitor.yml",
  ".github/workflows/auto-create-markets.yml",
  ".github/workflows/auto-finalize-markets.yml",
  ".github/workflows/auto-resolve-markets.yml",
  ".github/workflows/auto-resolve-disputes.yml",
  ".github/workflows/auto-recovery.yml",
];

const READ_WRITE_INDEXERS = [
  ".github/workflows/sync-lifecycle.yml",
  ".github/workflows/sync-stakes.yml",
];

const ADMIN_VERIFY_ONLY = [
  ".github/workflows/propose-v2-upgrade.yml",
  ".github/workflows/deploy-v2-implementation.yml",
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

describe("onchain signing isolation", () => {
  it("hardens state-changing Arc workflows before credentials are exposed", () => {
    for (const path of STATE_CHANGING) {
      const source = read(path);
      expect(source, path).toContain("permissions:\n  contents: read");
      expect(source, path).toContain("if: github.ref == 'refs/heads/main'");
      expectPinnedActions(path);
      expect(source, path).not.toMatch(/\bnpm install\b/);
      expect(source, path).toContain("verify-arc-testnet-target.mjs");
      expect(source, path).toContain("assert-authoritative-supabase.mjs");
    }
  });

  it("serializes every signing trust domain without cancelling in-flight transactions", () => {
    for (const path of [
      ".github/workflows/auto-create-markets.yml",
      ".github/workflows/auto-finalize-markets.yml",
      ".github/workflows/auto-resolve-markets.yml",
      ".github/workflows/auto-recovery.yml",
    ]) {
      const source = read(path);
      expect(source, path).toContain("group: arc-owner-wallet-state-change");
      expect(source, path).toContain("cancel-in-progress: false");
    }

    const jury = read(".github/workflows/auto-resolve-disputes.yml");
    expect(jury).toContain("group: arc-jury-wallet-state-change");
    expect(jury).toContain("cancel-in-progress: false");

    const guardian = read(".github/workflows/security-monitor.yml");
    expect(guardian).toContain("group: arc-guardian-wallet-state-change");
    expect(guardian).toContain("cancel-in-progress: false");
  });

  it("keeps lifecycle and stake indexers read-only onchain and fail-closed on targets", () => {
    for (const path of READ_WRITE_INDEXERS) {
      const source = read(path);
      expect(source, path).toContain("permissions:\n  contents: read");
      expect(source, path).toContain("if: github.ref == 'refs/heads/main'");
      expectPinnedActions(path);
      expect(source, path).toContain("verify-arc-testnet-target.mjs");
      expect(source, path).toContain("assert-authoritative-supabase.mjs");
      expect(source, path).not.toMatch(/secrets\.(?:OWNER|GUARDIAN|JURY|TREASURY|LIQUIDITY|DEPLOYER)_PRIVATE_KEY/);
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

  it("uses typed recovery actions instead of arbitrary command input", () => {
    const source = read(".github/workflows/auto-recovery.yml");
    expect(source).toContain("type: choice");
    expect(source).toContain("- sync-stakes");
    expect(source).toContain("- resolve-markets");
    expect(source).toContain("- create-markets");
  });

  it("keeps technical-proof briefings manual-only and production-target guarded", () => {
    const source = read(".github/workflows/Auto-generate-briefings.yml");
    expect(source).toContain("workflow_dispatch: {}");
    expect(source).not.toContain("schedule:");
    expect(source).toContain("permissions:\n  contents: read");
    expect(source).toContain("if: github.ref == 'refs/heads/main'");
    expect(source).toContain("assert-authoritative-supabase.mjs");
    expectPinnedActions(".github/workflows/Auto-generate-briefings.yml");
  });
});
