import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("technical-proof workflow policy", () => {
  it("does not continuously generate prediction markets or Hawk/Dove briefings", () => {
    for (const path of [
      ".github/workflows/auto-create-markets.yml",
      ".github/workflows/Auto-generate-briefings.yml",
    ]) {
      const source = read(path);
      expect(source).toContain("workflow_dispatch");
      expect(source).not.toContain("schedule:");
    }
  });

  it("keeps all Arc Testnet lifecycle schedules in one permanent workflow", () => {
    const lifecycle = read(".github/workflows/market-lifecycle.yml");
    expect(lifecycle).toContain('cron: "5 */2 * * *"');
    expect(lifecycle).toContain('cron: "15 */2 * * *"');
    expect(lifecycle).toContain('cron: "25 */2 * * *"');
    expect(lifecycle).toContain('cron: "30 */2 * * *"');
    expect(lifecycle).toContain('cron: "45 */2 * * *"');
    expect(lifecycle).toContain("node scripts/sync-lifecycle.js");
    expect(lifecycle).toContain("bun scripts/sync-stakes.js");
    expect(lifecycle).toContain("node scripts/finalize-markets.js");
    expect(lifecycle).toContain("node scripts/resolve-markets.js");
    expect(lifecycle).toContain("node scripts/resolve-disputes.js");
    expect(lifecycle).not.toContain('cron: "*/15 * * * *"');
    expect(lifecycle).not.toContain("timeout-minutes: 58");
    expect(lifecycle).toContain('bun-version: "1.4.2"');
  });

  it("retains manual and scheduled resolution/finalization in the canonical lifecycle workflow", () => {
    const workflow = read(".github/workflows/market-lifecycle.yml");
    for (const mode of ["sync-lifecycle","sync-stakes","finalize-markets","resolve-markets","resolve-disputes"]) {
      expect(workflow).toContain("- " + mode);
    }
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("schedule:");
  });

  it("permanently excludes prediction markets from mainnet", () => {
    const policy = read("src/lib/product-deployment-policy.ts");
    const docs = read("src/content/docs/34-prediction-markets.md");
    const arena = read("src/routes/arena.tsx");
    const readiness = read("docs/MAINNET_PRODUCTION_READINESS.md");

    expect(policy).toContain("mainnetAllowed: false");
    expect(policy).toContain("realMoneyAllowed: false");
    expect(policy).toContain("permanentTestnetOnly: true");
    expect(policy).toContain("ARC_TESTNET_CHAIN_ID = 5_042_002");

    expect(docs).toContain("permanently Testnet-only");
    expect(docs).toContain("not planned for real-money mainnet deployment");
    expect(arena).toContain("isPredictionMarketTestnetChainId");
    expect(arena).toContain("switchToArc(ARC_TESTNET)");
    expect(arena).toContain("will remain Testnet technical proof");
    expect(readiness).toContain("Never mainnet; permanently Testnet-only");
  });

  it("requires Arc Testnet preflight before every official stateful prediction-market workflow", () => {
    for (const path of [
      ".github/workflows/auto-create-markets.yml",
      ".github/workflows/market-lifecycle.yml",
      ".github/workflows/auto-recovery.yml",
      ".github/workflows/security-monitor.yml",
    ]) {
      expect(read(path), `${path} must fail closed to Arc Testnet`).toContain(
        "scripts/ops/verify-arc-testnet-target.mjs",
      );
    }
  });

  it("verifies every configured prediction-market RPC fallback, not only the primary RPC", () => {
    const verifier = read("scripts/ops/verify-arc-testnet-target.mjs");

    for (const name of [
      "ARC_RPC_URL",
      "ARC_RPC_URL_2",
      "ARC_RPC_URL_3",
      "ARC_RPC_URL_4",
      "ARC_RPC_URL_5",
    ]) {
      expect(verifier).toContain(`\"${name}\"`);
    }

    expect(verifier).toContain("const EXPECTED_CHAIN_ID = 5042002n");
    expect(verifier).toContain("for (const target of uniqueTargets)");
    expect(verifier).toContain("provider.getNetwork()");
    expect(verifier).toContain("provider.getCode(contractAddress)");
    expect(verifier).toContain("Mainnet is not permitted");
  });
});
