import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const pausedWorkflows = [
  ".github/workflows/auto-create-markets.yml",
  ".github/workflows/Auto-generate-briefings.yml",
  ".github/workflows/market-lifecycle.yml",
  ".github/workflows/auto-recovery.yml",
  ".github/workflows/security-monitor.yml",
];

describe("prediction-market paused runtime policy", () => {
  it("keeps every prediction-market workflow fail-closed and unscheduled", () => {
    for (const path of pausedWorkflows) {
      const source = read(path);
      expect(source, path).toContain("workflow_dispatch");
      expect(source, path).not.toContain("schedule:");
      expect(source, path).toContain("if: ${{ false }}");
    }
  });

  it("renders a static paused page without mounting the market runtime", () => {
    const arena = read("src/routes/arena.tsx");
    expect(arena).toContain("Prediction Markets are currently paused");
    expect(arena).not.toContain("ArenaSection");
    expect(arena).not.toContain("useWallet");
    expect(arena).not.toContain("switchToArc");
  });

  it("continues to permanently exclude prediction markets from mainnet", () => {
    const policy = read("src/lib/product-deployment-policy.ts");
    const docs = read("src/content/docs/34-prediction-markets.md");
    const readiness = read("docs/MAINNET_PRODUCTION_READINESS.md");
    expect(policy).toContain("mainnetAllowed: false");
    expect(policy).toContain("realMoneyAllowed: false");
    expect(policy).toContain("permanentTestnetOnly: true");
    expect(docs).toContain("permanently Testnet-only");
    expect(readiness).toContain("Never mainnet; permanently Testnet-only");
  });
});
