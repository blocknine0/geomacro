import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/production-website-health.yml", "utf8");

describe("Production Website Health current Intelligence contract", () => {
  it("mirrors the scored-first public serving contract when every launch domain is current", () => {
    expect(workflow).toContain("const scoredCurrentAcrossAllDomains = required.every");
    expect(workflow).toContain("now - timestamp <= dayMs");
    expect(workflow).toContain("body?.mode !== 'verified_b2' || live !== 0");
    expect(workflow).toContain("body?.current_within_24h !== true");
  });

  it("requires explicit fresh live-observed fallback only when scored current coverage is incomplete", () => {
    expect(workflow).toContain("body?.mode !== 'verified_b2_plus_live_observed' || live < 1");
    expect(workflow).toContain("row?.public_status === 'live_observed'");
    expect(workflow).toContain("row?.severity !== null || row?.delta !== null");
    expect(workflow).toContain("title.startsWith('Geomacro observes ')");
    expect(workflow).toContain("now - newestLive > dayMs");
  });

  it("keeps scored three-domain coverage, timestamps and source privacy fail-closed", () => {
    expect(workflow).toContain("const required = ['geopolitics', 'macro', 'rare_earth']");
    expect(workflow).toContain("row?.public_status === 'verified_b2'");
    expect(workflow).toContain("title.startsWith('Geomacro finds ')");
    expect(workflow).toContain("'source_name' in row || 'source_domain' in row || 'source_url' in row");
    expect(workflow).toContain("timestamp > now + futureToleranceMs");
    expect(workflow).toContain("Number(body?.verified_rows) !== verified || Number(body?.live_observed_rows) !== live");
  });

  it("binds displayed freshness to production evidence time rather than browser refresh time", () => {
    const hook = readFileSync("src/lib/use-intelligence.ts", "utf8");
    expect(hook).toContain("function latestEvidenceAt(rows: IntelEvent[]): number | null");
    expect(hook).toContain("initialData ? latestEvidenceAt(initialData.all) : null");
    expect(hook).toContain("setUpdatedAt(latestEvidenceAt(next.all))");
    expect(hook).not.toContain("setUpdatedAt(Date.now())");
    expect(workflow).toContain("Browser refresh time leaked into Intelligence freshness");
  });

  it("covers publisher and deployment changes through the every-main-push acceptance contract", () => {
    const pushStart = workflow.indexOf("  push:\n");
    const scheduleStart = workflow.indexOf("  schedule:\n", pushStart);
    const pushBlock = workflow.slice(pushStart, scheduleStart);
    expect(pushBlock).toContain("branches:\n      - main");
    expect(pushBlock).not.toContain("paths:");
  });

  it("cache-busts production probes and always keeps diagnostic evidence", () => {
    expect(workflow).toContain("Cache-Control: no-cache");
    expect(workflow).toContain("production_health=${nonce}");
    expect(workflow).toContain("Upload production Intelligence diagnostic");
    expect(workflow).toContain("if: always()");
  });
  it("waits boundedly for exact production deployment propagation without accepting stale SHA", () => {
    expect(workflow).toContain("for attempt in $(seq 1 40)");
    expect(workflow).toContain("Waiting for production deployment SHA");
    expect(workflow).toContain("LIVE_DEPLOYMENT_SHA_MISMATCH");
    expect(workflow).toContain("observed !== expected");
    expect(workflow).toContain("LIVE_BUILD_MARKER_SCHEMA_MISMATCH");
  });


  it("verifies production deployment acceptance on every canonical main push", () => {
    const pushStart = workflow.indexOf("  push:\n");
    const scheduleStart = workflow.indexOf("  schedule:\n", pushStart);
    const pushBlock = workflow.slice(pushStart, scheduleStart);
    expect(pushStart).toBeGreaterThanOrEqual(0);
    expect(scheduleStart).toBeGreaterThan(pushStart);
    expect(pushBlock).toContain("branches:\n      - main");
    expect(pushBlock).not.toContain("paths:");
  });

});
