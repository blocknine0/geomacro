import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("realtime corridor and hot-topic fanout contract", () => {
  it("defines all three product categories for every corridor and required hot topic", () => {
    const migration = read("supabase/migrations/970_realtime_scope_fanout_mesh.sql");
    expect(migration).toContain("live_realtime_scope_targets");
    expect(migration).toContain("GEOPOLITICS");
    expect(migration).toContain("MACRO");
    expect(migration).toContain("CRITICAL_MINERALS");
    expect(migration).toContain("CORRIDOR:GDELT_BURST:");
    expect(migration).toContain("HOT_TOPIC:GDELT_BURST:");
    expect(migration).toContain("realtime_scope_contract_100_complete");
    expect(migration).toContain("as $");
    expect(migration).not.toContain("as $\nbegin");
    expect(migration).not.toContain("\n$;");
  });

  it("uses the global GDELT stream as first-break backbone and only bursts on mapped events", () => {
    const worker = read("scripts/sync-realtime-scope-fanout.mjs");
    expect(worker).toContain('from("live_structured_events")');
    expect(worker).toContain("live_realtime_escalation_queue");
    expect(worker).toContain('urlObj.searchParams.set("timespan", "15m")');
    expect(worker).toContain("BURST_COOLDOWN_SECONDS");
    expect(worker).toContain("first_break_event_id");
  });

  it("keeps raw source material internal", () => {
    const migration = read("supabase/migrations/970_realtime_scope_fanout_mesh.sql");
    expect(migration).toContain("raw_redistribution_allowed");
    expect(migration).toContain("enabled_for_commercial_signals");
    expect(migration).toContain("commercial_usage_status");
    const workflow = read(".github/workflows/realtime-corridor-hot-topic-fanout.yml");
    expect(workflow).toContain("Upload sanitized fanout evidence");
  });

  it("is operator-only because the master orchestrator owns fanout cadence", () => {
    const workflow = read(".github/workflows/realtime-corridor-hot-topic-fanout.yml");
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).not.toContain("workflows:");
    expect(workflow).not.toContain('cron: "*/5 * * * *"');
    expect(workflow).not.toContain("workflow_run:");
    const orchestrator = readFileSync("scripts/intelligence-orchestrator.mjs", "utf8");
    expect(orchestrator).toContain('key: "realtime_fanout"');
    expect(workflow).toContain("${{ secrets.APP_SUPABASE_URL }}");
    expect(workflow).toContain("${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}");
    expect(workflow).not.toContain("\\${{ secrets.APP_SUPABASE_URL }}");
    expect(workflow).not.toContain("\\${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}");
  });
});
