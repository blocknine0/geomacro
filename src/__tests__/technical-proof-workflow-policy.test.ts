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

  it("keeps legacy lifecycle maintenance bounded while existing Testnet state drains", () => {
    const lifecycle = read(".github/workflows/sync-lifecycle.yml");
    const disputes = read(".github/workflows/auto-resolve-disputes.yml");
    const stakes = read(".github/workflows/sync-stakes.yml");

    expect(lifecycle).toContain('cron: "5 */2 * * *"');
    expect(lifecycle).toContain("node scripts/sync-lifecycle.js");
    expect(lifecycle).not.toContain("sleep \"$SLEEP_FOR\"");
    expect(lifecycle).not.toContain("timeout-minutes: 58");

    expect(disputes).toContain('cron: "45 */2 * * *"');
    expect(disputes).not.toContain('cron: "*/15 * * * *"');

    expect(stakes).toContain('cron: "25 */2 * * *"');
    expect(stakes).not.toContain("*/30 * * * *");
    expect(stakes).toContain("bun install --frozen-lockfile");
  });

  it("retains resolution/finalization automation so existing Testnet markets can complete", () => {
    const resolve = read(".github/workflows/auto-resolve-markets.yml");
    const finalize = read(".github/workflows/auto-finalize-markets.yml");

    expect(resolve).toContain("schedule:");
    expect(finalize).toContain("schedule:");
    expect(resolve).toContain("workflow_dispatch");
    expect(finalize).toContain("workflow_dispatch");
  });
});
