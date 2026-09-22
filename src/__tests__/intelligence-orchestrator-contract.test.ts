import { describe, expect, it } from "vitest";
import fs from "node:fs";

function read(path: string) {
  return fs.readFileSync(path, "utf8");
}

describe("permanent intelligence orchestration contract", () => {
  it("has exactly one scheduled intelligence heartbeat", () => {
    const workflow = read(".github/workflows/intelligence-orchestrator.yml");
    const orchestrator = read("scripts/intelligence-orchestrator.mjs");
    expect(workflow).toContain('cron: "7,22,37,52 * * * *"');
    expect(workflow).toContain("group: geomacro-intelligence-orchestrator");
    expect(workflow).toContain("oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6");
    expect(workflow).not.toContain("oven-sh/setup-bun@0c5077e51419868618aaae5fe8019c62421857d6");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).not.toContain("workflow_run:");
    expect(orchestrator).toContain("const TASKS = [");
  });

  it("keeps live intelligence adapters due-based and serial", () => {
    const script = read("scripts/intelligence-orchestrator.mjs");
    for (const task of [
      "gdelt_gal",
      "open_realtime_mesh",
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
    expect(script).toContain('key: "production_readiness"');
    expect(script).toContain('key: "public_demo_refresh"');
    expect(script).toContain("MAX_TASKS_PER_TICK");
    expect(script).toContain('key: "production_readiness"');
    expect(script).toContain('key: "public_demo_refresh"');
    expect(script).toContain("drain-live-structure.mjs");
    expect(script).toContain("scripts/run-gdelt-gal-cycle.mjs");
    expect(script).toContain("run-rss-live-cycle.mjs");
    expect(script).toContain("reconcile-structured-event-commercial-rights.mjs");
    expect(script).toContain("offsetSeconds: 240");
    expect(script).toContain("refreshOidcToken");
    expect(script).toContain("timeoutMs: 2_400_000");
    expect(script).toContain("retry_pending");
    expect(script).toContain("GDELT_GAL_FAILURE_CLASS");
    expect(script).toContain("failure_class: failureClass");
    expect(script).toContain("consecutive_failures");
    expect(script).toContain('status = "degraded"');
    expect(script).toContain("for (const item of due)");
    expect(script).toContain("process.stderr.write(text)");
    expect(script).not.toContain("process.stdout.write(text)");
    expect(script).toContain("console.log(JSON.stringify(summary, null, 2));");
  });

  it("makes missing scheduler state immediately due without creating a first-run herd", () => {
    const script = read("scripts/intelligence-orchestrator.mjs");
    expect(script).toContain("function bootstrapStateForTask(task, nowMs)");
    expect(script).toContain("function shouldBootstrapState(row)");
    expect(script).toContain("state.cursor.next_due_at = new Date(nowMs).toISOString()");
    expect(script).toContain("state.cursor.bootstrap_pending = true");
    expect(script).toContain("state.cursor.bootstrap_pending = false");
    expect(script).toContain("if (row.last_attempt_at || row.last_success_at) return false;");
    expect(script).toContain('if (cursor.skipped_reason === "task_disabled_by_configuration") return false;');
    expect(script).toContain("MAX_TASKS_PER_TICK prevents the bootstrap from becoming a thundering herd");
    expect(script).toContain("bootstrap_seeds_are_immediately_due: true");
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
      ".github/workflows/open-realtime-source-mesh.yml",
      ".github/workflows/ingest-reliefweb-live.yml",
      ".github/workflows/global-realtime-source-proof.yml",
      ".github/workflows/production-intelligence-readiness.yml",
      ".github/workflows/public-demo-risk-refresh.yml",
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
