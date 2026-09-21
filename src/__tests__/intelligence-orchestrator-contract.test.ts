import { describe, expect, it } from "vitest";
import fs from "node:fs";

function read(path: string) {
  return fs.readFileSync(path, "utf8");
}

describe("permanent intelligence orchestration contract", () => {
  it("has exactly one scheduled intelligence heartbeat", () => {
    const orchestrator = read(".github/workflows/intelligence-orchestrator.yml");
    expect(orchestrator).toContain('cron: "7,22,37,52 * * * *"');
    expect(orchestrator).toContain("group: geomacro-intelligence-orchestrator");
    expect(orchestrator).toContain("cancel-in-progress: false");
    expect(orchestrator).not.toContain("workflow_run:");
  });

  it("keeps live intelligence adapters due-based and serial", () => {
    const script = read("scripts/intelligence-orchestrator.mjs");
    for (const task of [
      "gdelt_gal",
      "gdelt_v2",
      "country_raw_mesh",
      "rss_live",
      "realtime_fanout",
      "telegram_discovery",
      "news_ingest",
      "gri_publish",
      "source_evidence",
    ]) {
      expect(script).toContain(`key: "${task}"`);
    }
    expect(script).toContain("MAX_TASKS_PER_TICK");
    expect(script).toContain("retry_pending");
    expect(script).toContain("consecutive_failures");
    expect(script).toContain('status = "degraded"');
    expect(script).toContain("for (const item of due)");
  });

  it("moves the high-frequency intelligence workflows to operator-only recovery mode", () => {
    for (const path of [
      ".github/workflows/global-country-raw-source-mesh.yml",
      ".github/workflows/gdelt-gal-live-sync.yml",
      ".github/workflows/gdelt-v2-event-sync.yml",
      ".github/workflows/realtime-corridor-hot-topic-fanout.yml",
      ".github/workflows/testnet-rss-live-runner.yml",
      ".github/workflows/global-telegram-source-discovery-scheduled.yml",
      ".github/workflows/auto-ingest-news.yml",
      ".github/workflows/source-evidence-graph-auto-promotion.yml",
      ".github/workflows/federico-seven-day-risk-refresh.yml",
    ]) {
      const source = read(path);
      expect(source, path).toContain("workflow_dispatch:");
      expect(source, path).not.toContain("schedule:");
      expect(source, path).not.toContain("workflow_run:");
    }
  });

  it("keeps GRI freshness gates strict while avoiding pre-publish proof races", () => {
    const workflow = read(".github/workflows/gri-governance.yml");
    expect(workflow).toContain('GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS: "3"');
    expect(workflow).not.toContain("23 */2 * * *");
    expect(workflow).not.toContain("50 */2 * * *");
    expect(workflow).not.toContain("\n  push:\n");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.mode == 'public-proof'");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.mode == 'publish'");
  });
});
