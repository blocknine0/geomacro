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

  it("reruns when either primary or scored-only Intelligence publication ownership changes", () => {
    expect(workflow).toContain('scripts/ops/publish-b2-public-intelligence-direct-postgres.mjs');
    expect(workflow).toContain('scripts/ops/republish-b2-public-intelligence-scored-only.mjs');
    expect(workflow).toContain('scripts/ops/sync-fastlane-scored-intelligence.mjs');
  });

  it("cache-busts production probes and always keeps diagnostic evidence", () => {
    expect(workflow).toContain("Cache-Control: no-cache");
    expect(workflow).toContain("production_health=${nonce}");
    expect(workflow).toContain("Upload production Intelligence diagnostic");
    expect(workflow).toContain("if: always()");
  });
});
