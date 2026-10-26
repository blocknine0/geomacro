import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/production-website-health.yml", "utf8");
const freeWorkflow = readFileSync(".github/workflows/minimum-free-derived-production-health.yml", "utf8");
const freeVerifier = readFileSync("scripts/ops/verify-minimum-free-production-health.mjs", "utf8");

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
    expect(hook).toContain("function latestOriginalEvidenceAt(rows: IntelEvent[]): number | null");
    expect(hook).toContain("initialData ? latestOriginalEvidenceAt(initialData.all) : null");
    expect(hook).toContain("setUpdatedAt(latestOriginalEvidenceAt(next.all))");
    expect(hook).not.toContain("setUpdatedAt(Date.now())");
    expect(workflow).toContain("Browser refresh time leaked into Intelligence freshness");
    expect(workflow).toContain("grep -Fq 'Latest original evidence ' src/routes/intelligence.tsx");
    expect(workflow).toContain("if grep -Fq 'Monitoring updated ' src/routes/intelligence.tsx; then");
    expect(readFileSync("src/routes/intelligence.tsx", "utf8")).toContain("Latest original evidence ");
    expect(readFileSync("src/routes/intelligence.tsx", "utf8")).not.toContain("Monitoring updated ");
  });

  it("keeps legacy signed hot-product health out of the automatic website launch gate", () => {
    expect(workflow).toContain("Manual-only diagnostics for the legacy signed Intelligence / GRI / Risk Indices");
    expect(workflow).not.toContain("\n  push:\n");
    expect(workflow).not.toContain("\n  schedule:\n");
    expect(workflow).not.toContain("\n  workflow_run:\n");
  });

  it("cache-busts production probes and always keeps diagnostic evidence", () => {
    expect(workflow).toContain("Cache-Control: no-cache");
    expect(workflow).toContain("production_health=${nonce}");
    expect(workflow).toContain("Upload production Intelligence diagnostic");
    expect(workflow).toContain("if: always()");
  });
  it("waits boundedly for exact production deployment propagation without accepting stale SHA", () => {
    expect(workflow).toContain("for attempt in $(seq 1 8)");
    expect(workflow).toContain("Waiting for production deployment SHA");
    expect(workflow).toContain("LIVE_DEPLOYMENT_SHA_MISMATCH");
    expect(workflow).toContain("observed !== expected");
    expect(workflow).toContain("LIVE_BUILD_MARKER_SCHEMA_MISMATCH");
  });


  it("runs no-funds free-source acceptance on every main push and on cadence, using the static archive", () => {
    const pushStart = freeWorkflow.indexOf("  push:\n");
    const permissionsStart = freeWorkflow.indexOf("\n\npermissions:", pushStart);
    const pushBlock = freeWorkflow.slice(pushStart, permissionsStart);
    expect(pushStart).toBeGreaterThanOrEqual(0);
    expect(permissionsStart).toBeGreaterThan(pushStart);
    expect(pushBlock).toContain("branches: [main]");
    expect(pushBlock).not.toContain("paths:");
    expect(freeWorkflow).toContain('cron: "23 */2 * * *"');
    expect(freeWorkflow).toContain("Primary website acceptance");
    expect(freeVerifier).toContain("geomacro-public-finds-archive.daspallab202391.workers.dev/latest.json");
    expect(freeVerifier).not.toContain("geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-immediate");
    expect(freeWorkflow).not.toContain("node scripts/ops/derived-news-latency-audit.mjs");
  });

});
