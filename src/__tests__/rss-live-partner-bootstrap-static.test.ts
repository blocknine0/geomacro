import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/run-rss-live-cycle.mjs", "utf8");

describe("RSS live partner bootstrap boundary", () => {
  it("never exposes RSS spool exception details to HTTP clients", () => {
    expect(script).toContain('error: "RSS_SPOOL_REQUEST_REJECTED"');
    expect(script).not.toContain("error instanceof Error ? error.message : String(error)");
    expect(script).not.toContain("error.stack");
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
