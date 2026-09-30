import { describe, expect, it } from "vitest";
import fs from "node:fs";

function read(path: string) {
  return fs.readFileSync(path, "utf8");
}

function expectScheduledOrExplicitQuotaHold(workflow: string) {
  const emergencyMarker =
    "Emergency quota hold. Preserve workflow_dispatch for controlled recovery.";
  if (workflow.includes(emergencyMarker)) {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    return;
  }
  expect(workflow).toContain('cron: "7,22,37,52 * * * *"');
}

describe("permanent intelligence orchestration contract", () => {
  it("has exactly one scheduled intelligence heartbeat or an explicit quota-recovery hold", () => {
    const workflow = read(".github/workflows/intelligence-orchestrator.yml");
    const orchestrator = read("scripts/intelligence-orchestrator.mjs");
    expectScheduledOrExplicitQuotaHold(workflow);
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
    const gdeltCycle = read("scripts/run-gdelt-gal-cycle.mjs");
    expect(gdeltCycle).toContain("reconcile-structured-event-commercial-rights.mjs");
    expect(script).toContain("RECONCILE_SOURCE_KEYS=country_raw_web_mesh");
    expect(script).toContain("RECONCILE_LOOKBACK_MINUTES=120");
    expect(script).toContain("offsetSeconds: 240");
    expect(script).toContain("refreshOidcToken");
    expect(script).toContain("timeoutMs: 2_400_000");
    expect(script).toContain("retry_pending");
    expect(script).toContain("GDELT_GAL_FAILURE_CLASS");
    expect(script).toContain("state.cursor.failure_class = failureClass");
    expect(script).toContain("consecutive_failures");
    expect(script).toContain('status = "degraded"');
    expect(script).toContain("const orderedDue = orderDueTasks(due)");
    expect(script).toContain("for (const item of orderedDue)");
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

  it("moves high-frequency intelligence workflows to operator-only recovery mode", () => {
    for (const path of [
      ".github/workflows/global-country-raw-source-mesh.yml",
      ".github/workflows/gdelt-gal-live-sync.yml",
      ".github/workflows/gdelt-v2-event-sync.yml",
      ".github/workflows/realtime-corridor-hot-topic-fanout.yml",
      ".github/workflows/testnet-rss-live-runner.yml",
      ".github/workflows/source-evidence-graph-auto-promotion.yml",
      ".github/workflows/federico-seven-day-risk-refresh.yml",
      ".github/workflows/open-realtime-source-mesh.yml",
      ".github/workflows/ingest-reliefweb-live.yml",
      ".github/workflows/global-realtime-source-proof.yml",
      ".github/workflows/production-intelligence-readiness.yml",
    ]) {
      const source = read(path);
      expect(source, path).toContain("workflow_dispatch:");
      expect(source, path).not.toContain("schedule:");
      expect(source, path).not.toContain("workflow_run:");
    }
  });

  it("keeps a bounded low-write GRI freshness path active during quota recovery", () => {
    const workflow = read(".github/workflows/auto-ingest-news.yml");
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).toContain('cron: "17 */6 * * *"');
    expect(workflow).toContain("group: geomacro-intelligence-orchestrator");
    expect(workflow).toContain('MAX_CANDIDATES_PER_CATEGORY: "4"');
    expect(workflow).toContain("supabase-free-tier-budget.mjs --require-bulk-write --require-normal");
    expect(workflow).toContain("check-gri-input-change.mjs");
    expect(workflow).toContain("compute-gri-v12.js");
    expect(workflow).toContain("verify-gri-snapshot-v12.js");
    expect(workflow).not.toContain("workflow_run:");
  });

  it("allows the public demo Risk Object refresh to run on a bounded freshness schedule", () => {
    const workflow = read(".github/workflows/public-demo-risk-refresh.yml");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain('cron: "0 * * * *"');
    expect(workflow).toContain("group: geomacro-public-demo-refresh");
    expect(workflow).not.toContain("group: geomacro-intelligence-orchestrator");
    expect(workflow).not.toContain("workflow_run:");
    expect(workflow).toContain("Refresh all visible public demo subjects");
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
