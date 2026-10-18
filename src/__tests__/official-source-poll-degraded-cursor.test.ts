import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { officialSourcePollCursorOutcome } from "../../scripts/lib/official-source-poll-cursor.mjs";

describe("#1827 read-only 90-minute official publisher failure truth", () => {
  it("does not retain a stale healthy cursor when the real source poll fails", () => {
    const original = { status: "healthy", failure_class: null };
    const state = { ...original, ...officialSourcePollCursorOutcome(false) };
    expect(state).toEqual({
      status: "degraded",
      failure_class: "official_native_source_probe_failed",
    });
    expect(officialSourcePollCursorOutcome(undefined).status).toBe("degraded");
    expect(officialSourcePollCursorOutcome("true").status).toBe("degraded");
  });

  it("only a completed successful original publisher poll may restore healthy", () => {
    expect(officialSourcePollCursorOutcome(true)).toEqual({
      status: "healthy",
      failure_class: null,
    });
  });

  it("persists true outcome through the real D1 task runner and never self-certifies a public event", () => {
    const source = readFileSync("scripts/intelligence-orchestrator.mjs", "utf8");
    expect(source).toContain('if (task.key === "official_native_rss")');
    expect(source).toContain("officialSourcePollCursorOutcome(success)");
    expect(source).toContain("state.cursor.status = sourceOutcome.status");
    expect(source).toContain("state.cursor.failure_class = sourceOutcome.failure_class");
    expect(source).toContain("await persistState(task, state");
    // The scheduler itself may complete an authentic red SOURCE observation,
    // but D1 native transport state remains degraded and last_success stays unset.
    expect(source).toContain("summary.ok = summary.ok && result.ok");
    expect(source).toContain("source_transport_degraded: observationDegraded");
    expect(source).toContain('last_success_at: success ? new Date().toISOString() : null');
    expect(source).toContain("if (!summary.ok) process.exitCode = 1");
    expect(source).toContain("restrictedDataPlane && task.restrictedDirectPostgresSafe !== true");
    expect(source).toContain('key: "official_native_rss"');
  });
});
