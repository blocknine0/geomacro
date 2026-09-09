import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const PRIVILEGED_WORKFLOWS = [
  ".github/workflows/security-monitor.yml",
  ".github/workflows/auto-ingest-news.yml",
  ".github/workflows/auto-create-markets.yml",
  ".github/workflows/auto-finalize-markets.yml",
  ".github/workflows/auto-resolve-markets.yml",
  ".github/workflows/auto-resolve-disputes.yml",
  ".github/workflows/auto-recovery.yml",
  ".github/workflows/sync-lifecycle.yml",
  ".github/workflows/sync-stakes.yml",
  ".github/workflows/Auto-generate-briefings.yml",
];

const ADMIN_VERIFY_WORKFLOWS = [
  ".github/workflows/propose-v2-upgrade.yml",
  ".github/workflows/deploy-v2-implementation.yml",
  ".github/workflows/execute-v2-upgrade.yml",
  ".github/workflows/fund-v2-liquidity.yml",
];

function filesUnder(path: string): string[] {
  const absolute = join(ROOT, path);
  return readdirSync(absolute).flatMap((name) => {
    const child = join(path, name);
    return statSync(join(ROOT, child)).isDirectory() ? filesUnder(child) : [child];
  });
}

describe("commercial security baseline", () => {
  it("keeps privileged workflows least-privilege, main-only and immutable-action pinned", () => {
    for (const path of PRIVILEGED_WORKFLOWS) {
      const source = read(path);
      expect(source, path).toContain("permissions:\n  contents: read");
      expect(source, path).toContain("if: github.ref == 'refs/heads/main'");
      expect(source, path).not.toMatch(/uses:\s+[^\s]+@v\d+/);
      expect(source, path).not.toMatch(/\bnpm install\b/);

      if (source.includes("actions/checkout@")) {
        expect(source, path).toMatch(/actions\/checkout@[0-9a-f]{40}/);
        expect(source, path).toContain("persist-credentials: false");
      }
      if (source.includes("actions/setup-node@")) {
        expect(source, path).toMatch(/actions\/setup-node@[0-9a-f]{40}/);
      }
      if (source.includes("oven-sh/setup-bun@")) {
        expect(source, path).toMatch(/oven-sh\/setup-bun@[0-9a-f]{40}/);
      }
    }
  });

  it("serializes state-changing trust domains without cancelling signing runs", () => {
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

  it("requires chain/database preflight before privileged automated operations", () => {
    for (const path of [
      ".github/workflows/security-monitor.yml",
      ".github/workflows/auto-create-markets.yml",
      ".github/workflows/auto-finalize-markets.yml",
      ".github/workflows/auto-resolve-markets.yml",
      ".github/workflows/auto-resolve-disputes.yml",
      ".github/workflows/auto-recovery.yml",
      ".github/workflows/sync-lifecycle.yml",
      ".github/workflows/sync-stakes.yml",
    ]) {
      const source = read(path);
      expect(source, path).toContain("verify-arc-testnet-target.mjs");
      expect(source, path).toContain("assert-authoritative-supabase.mjs");
    }

    expect(read(".github/workflows/auto-ingest-news.yml")).toContain(
      "assert-authoritative-supabase.mjs",
    );
    expect(read(".github/workflows/Auto-generate-briefings.yml")).toContain(
      "assert-authoritative-supabase.mjs",
    );
  });

  it("keeps rare upgrade and liquidity signing keys out of hosted workflows", () => {
    const allWorkflows = filesUnder(".github/workflows")
      .filter((path) => path.endsWith(".yml") || path.endsWith(".yaml"))
      .map(read)
      .join("\n");

    expect(allWorkflows).not.toMatch(/TREASURY_PRIVATE_KEY_/);
    expect(allWorkflows).not.toContain("LIQUIDITY_PRIVATE_KEY");
    expect(allWorkflows).not.toContain("DEPLOYER_PRIVATE_KEY");

    for (const path of ADMIN_VERIFY_WORKFLOWS) {
      const source = read(path);
      expect(source, path).toContain("permissions:\n  contents: read");
      expect(source, path).toContain("if: github.ref == 'refs/heads/main'");
      expect(source, path).not.toContain("PRIVATE_KEY");
      expect(source, path).not.toMatch(/uses:\s+[^\s]+@v\d+/);
      expect(source, path).not.toMatch(/\bnpm install\b/);
    }
  });

  it("does not define browser-visible service-role or signing secrets", () => {
    const envExample = read(".env.example");
    expect(envExample).not.toMatch(
      /^VITE_[A-Z0-9_]*(?:SERVICE_ROLE|PRIVATE_KEY|SIGNING)[A-Z0-9_]*=/m,
    );

    const browserSource = filesUnder("src")
      .filter((path) => /\.(?:ts|tsx|js|jsx)$/.test(path))
      .filter((path) => !path.includes("/__tests__/"))
      .map(read)
      .join("\n");

    expect(browserSource).not.toMatch(
      /import\.meta\.env\.VITE_[A-Z0-9_]*(?:SERVICE_ROLE|PRIVATE_KEY|SIGNING)/,
    );
  });

  it("uses a typed allowlist for manual recovery operations", () => {
    const source = read(".github/workflows/auto-recovery.yml");
    expect(source).toContain("type: choice");
    expect(source).toContain("- sync-stakes");
    expect(source).toContain("- resolve-markets");
    expect(source).toContain("- create-markets");
  });
});
