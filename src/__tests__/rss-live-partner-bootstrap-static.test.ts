import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/run-rss-live-cycle.mjs", "utf8");

describe("RSS live partner bootstrap boundary", () => {
  it("never exposes RSS spool exception details to HTTP clients", () => {
    const start = script.indexOf("async function createLocalSpoolServer");
    const end = script.indexOf("async function closeServer", start);
    const spoolServer = script.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(spoolServer).toContain('error: "RSS_SPOOL_REQUEST_REJECTED"');
    expect(spoolServer).not.toContain("error.message");
    expect(spoolServer).not.toContain("String(error)");
    expect(spoolServer).not.toContain("error.stack");
  });


  it("never logs child stderr, stack traces, paths, tokens, or arbitrary exception text", () => {
    const runStart = script.indexOf("function runCommand");
    const runEnd = script.indexOf("function parseLastJson", runStart);
    const runCommand = script.slice(runStart, runEnd);
    const mainCatchStart = script.indexOf("main().catch");
    const mainCatch = script.slice(mainCatchStart);

    expect(runStart).toBeGreaterThanOrEqual(0);
    expect(runEnd).toBeGreaterThan(runStart);
    expect(runCommand).not.toContain("process.stderr.write");
    expect(runCommand).not.toContain("error.message");

    expect(script).not.toContain("stderr.slice");
    expect(script).not.toContain("error.stack");
    expect(script).not.toContain("String(error)");
    expect(script).not.toContain("RSS worker failed with exit code=");
    expect(script).toContain('throw new Error("RSS_WORKER_FAILED")');
    expect(script).toContain('throw new Error("RSS_CANONICAL_DIRECT_INGEST_FAILED")');
    expect(script).toContain('throw new Error("RSS_CANONICAL_DIRECT_CORROBORATION_FAILED")');

    expect(mainCatch).toContain('/^RSS_[A-Z0-9_]+$/.test(message)');
    expect(mainCatch).toContain('"RSS_LIVE_CYCLE_FAILED"');
    expect(mainCatch).toContain("console.error(failureCode)");
    expect(mainCatch).not.toContain("console.error(message");
  });

  it("keeps partial source tolerance opt-in, bounded, and explicitly evidenced", () => {
    expect(script).toContain("RSS_LIVE_ALLOW_PARTIAL_SOURCE_FAILURES");
    expect(script).toContain("RSS_LIVE_MIN_PARTIAL_COMPLETED_SOURCES");
    expect(script).toContain("RSS_PARTIAL_SOURCE_FLOOR_NOT_MET");
    expect(script).toContain("RSS_PARTIAL_SOURCE_STATE_UNPROVEN");
    expect(script).toContain('stderr: worker.stderr');
    expect(script).toContain('event?.kind !== "rss_error"');
    expect(script).toContain('if (lastState.get(sourceId) !== "success") lastState.set(sourceId, "error")');
    expect(script).not.toContain("process.stderr.write");
    expect(script).toContain("const unprovenMissing = missing.filter((id) => !hadError.has(id))");
    expect(script).toContain("failed_sources: missing.sort()");
    expect(script).toContain("partial_refresh: missing.length > 0");
    expect(script).toContain("partial_source_failure_tolerance_enabled: ALLOW_PARTIAL_SOURCE_FAILURES");
    expect(script).toContain("worker.code !== 0 && !ALLOW_PARTIAL_SOURCE_FAILURES");
  });

  it("keeps global corroboration enabled by default and skips it only on explicit opt-in", () => {
    expect(script).toContain("RSS_LIVE_SKIP_CORROBORATION");
    expect(script).toContain('=== "true"');
    expect(script).toContain("if (SKIP_CORROBORATION)");
    expect(script).toContain("explicit_partner_bootstrap_country_corroboration_follows");
    expect(script).toContain('["scripts/run-live-flash-corroborate-local.ts"]');
    expect(script).toContain("threshold_weakening: false");
  });
});
