import fs from "node:fs";
import { describe, expect, it } from "vitest";

const mesh = fs.readFileSync("scripts/sync-open-live-source-mesh.mjs", "utf8");

describe("open realtime source isolation", () => {
  it("retries JSON transports before declaring a source unavailable", () => {
    expect(mesh).toContain("OPEN_LIVE_SOURCE_FETCH_ATTEMPTS ?? 3");
    expect(mesh).toContain("EMPTY_JSON_RESPONSE");
    expect(mesh).toContain("INVALID_JSON_RESPONSE");
  });

  it("contains a failed provider without fabricating evidence", () => {
    expect(mesh).toContain("loadSourceSafely");
    expect(mesh).toContain('unavailable_reason: "UPSTREAM_UNAVAILABLE"');
    expect(mesh).toContain('status: "unavailable"');
    expect(mesh).toContain('records: 0');
  });

  it("never seals unavailable providers as healthy source cycles", () => {
    const unavailableBranch = mesh.slice(mesh.indexOf("if (source.unavailable)"), mesh.indexOf("if (source.skipped)"));
    expect(unavailableBranch).toContain('status: "unavailable"');
    expect(unavailableBranch).not.toContain("sealSource");
    expect(unavailableBranch).not.toContain('status: "healthy"');
  });

  it("reports degradation separately from overall usable-source success", () => {
    expect(mesh).toContain("successfulSources.length > 0");
    expect(mesh).toContain("degraded: unavailableSources.length > 0");
    expect(mesh).toContain("unavailable_sources: unavailableSources");
  });
});
