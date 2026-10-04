import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/production-website-health.yml", "utf8");

describe("Production Website Health current Intelligence contract", () => {
  it("fails closed unless production serves scored plus current observed evidence", () => {
    expect(workflow).toContain("body?.mode === 'verified_b2_plus_live_observed'");
    expect(workflow).toContain("Number(body?.live_observed_rows) !== live || live < 1");
    expect(workflow).toContain("row?.public_status === 'live_observed'");
    expect(workflow).toContain("row?.severity !== null || row?.delta !== null");
    expect(workflow).toContain("title.startsWith('Geomacro observes ')");
    expect(workflow).toContain("body?.current_within_24h !== true");
    expect(workflow).not.toContain("body?.mode === 'verified_b2' && Number(body?.live_observed_rows) === 0");
  });

  it("keeps scored three-domain coverage and source privacy fail-closed", () => {
    expect(workflow).toContain("new Set(['geopolitics', 'macro', 'rare_earth'])");
    expect(workflow).toContain("row?.public_status === 'verified_b2'");
    expect(workflow).toContain("title.startsWith('Geomacro finds ')");
    expect(workflow).toContain("'source_name' in row || 'source_domain' in row || 'source_url' in row");
  });

  it("cache-busts production probes and always keeps diagnostic evidence", () => {
    expect(workflow).toContain("Cache-Control: no-cache");
    expect(workflow).toContain("production_health=${nonce}");
    expect(workflow).toContain("Upload production Intelligence diagnostic");
    expect(workflow).toContain("if: always()");
  });
});
